# Architecture

## Overview

FLUX is a full-stack messaging application organised as a **pnpm monorepo**. The
server, the web client and the shared contract package are versioned together, so an API change
and the client code that consumes it land in a single commit.

```
apps/server   → NestJS API + WebSocket gateway
apps/web      → React SPA (Vite)
packages/shared → DTO shapes, enums, error codes shared by both sides
```

## Layered request flow

```
HTTP request
  → helmet / pino-http / rate-limit guards     (main.ts bootstrap)
  → JwtAuthGuard  (+ RolesGuard, ThrottlerGuard)
  → DTO validation (class-validator, whitelist + forbidNonWhitelisted)
  → Controller          thin: parameter binding only
  → Service             business rules, transactions, authorisation checks
  → PrismaService       PostgreSQL        ──┐
  → S3Service           SeaweedFS / MinIO  ─┤ infrastructure
  → RedisService        cache + pub/sub  ───┘
  → HttpExceptionFilter → uniform error envelope to the client
```

Cross-cutting behaviour lives in `src/common/`: decorators (`@CurrentUser`, `@Roles`), guards,
the logging interceptor and the exception filter. Services never write to the response directly.

> **Important:** `enableImplicitConversion` is deliberately **`false`** in `apps/server/tsconfig`.
> Nest then hands raw `@Query` primitives to services as `string | undefined`, so numeric params
> must be parsed explicitly via `parsePositiveInt` (`src/common/utils/parse-query.ts`). Re-enabling
> it turns a missing parameter into `NaN`, which reaches Prisma as `take: null`.

## Server modules

| Module | Responsibility |
| --- | --- |
| `auth` | register, e-mail verification, login, rotating refresh tokens, TOTP 2FA, Argon2id |
| `users` / `contacts` | profiles, avatars, contact list, block/online state |
| `chats` | private / saved / group / channel creation, membership, roles, invitations |
| `messages` | send (text and attachments), history, edit, delete-for-everyone, reactions, replies |
| `search` | user and message search with pagination |
| `realtime` | WebSocket gateway, room join, event fan-out |
| `media` | presigned upload init/complete, download URL issuance, membership check before download |
| `files` | `S3Service` — buckets, keys, presigned URLs, storage quota |
| `calls` | call signalling and TURN credential exposure |
| `presence` | online status, last seen |
| `notifications` | web push (VAPID), unread badges |
| `admin` + `audit` | moderation endpoints and append-only audit trail |
| `bots` | Bot API |
| `health` | Terminus health/readiness probes (DB + Redis) |

## Realtime design

`RealtimeGateway` (`apps/server/src/realtime/realtime.gateway.ts`) is a **raw `ws` server** on
path `/ws`, served by Nest's `WsAdapter`. It is not Socket.IO and it does not use rooms.

**Handshake.** The client connects to `ws://host/ws?token=<accessToken>`. The gateway verifies the
access token with the same `TokenService` used for REST, loads the user, rejects blocked users
(close code `4002`) and registers the socket in an in-memory registry:

```ts
private userConnections = new Map<string, Set<ClientConnection>>();  // userId → sockets
```

A ping/pong keepalive every 30 s drops dead sockets; connect/disconnect also flips
`User.presence` to `ONLINE` / `OFFLINE`.

**Delivery.**

```
service (business event)
   → realtime.gateway.emitToUser(userId, event, payload)
      → for each open socket of that user → ws.send(JSON.stringify({event, payload, timestamp}))
```

Callers loop over chat members themselves:

```ts
for (const m of members) {
  this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_NEW, { chatId, message });
}
```

Event names come from the shared `RealtimeEvent` enum (`@FLUX/shared`), so renaming one breaks
compilation instead of silently dropping updates: `chat.created`, `chat.updated`, `chat.deleted`,
`message.new`, `message.updated`, `message.deleted`, `message.reaction.updated`,
`message.read`, call signalling and presence events.

## Known limitations

Documented on purpose, so nobody has to rediscover them:

1. **One API instance only.** Realtime delivery is kept in an in-memory
   `Map<userId, Set<socket>>`, and the gateway does not publish to Redis. With several API
   replicas, a user would only receive events produced by the replica their socket is connected
   to. Run a single API process behind the proxy, or add per-user Redis pub/sub fan-out first.
2. **Presence is broadcast to every connected socket** (`broadcast()`), not only to contacts.
3. **Typing indicators are not wired up end-to-end.** `chat.typing.start` / `chat.typing.stop`
   exist in the shared `RealtimeEvent` enum, but no server code emits them yet.
4. **coturn is configured but not verified** with a real WebRTC call yet.


Two rules matter:

- **`chat.created` is emitted even when the chat already exists.** `createPrivateChat` is
  idempotent, and both members still receive the event on the "already exists" path, because
  clients treat it as an upsert — without it the client that lost the race never converges.
- **Delivery is addressed per user id**, so private payloads only reach sockets owned by that
  user. Presence, by contrast, intentionally uses `broadcast()`, which sends to *every* connected
  socket.

### Known limitation — single instance

The registry is **in-memory**: `emitToUser` only reaches sockets connected to *this* process.
`RedisService` is injected into the gateway but is not currently used for fan-out, so running
several API replicas would deliver events only to users connected to the replica that produced
them. The fix is to publish on a Redis channel per user id and have each replica subscribe and
deliver to its local sockets. Until that lands, run **one** API instance behind the proxy (which
is how the current deployment is configured).

A second, milder consequence of `broadcast()`: online/offline presence is visible to all
authenticated sockets, not only to contacts.

## Media pipeline

Uploads never stream through the API:

1. `POST /media/upload/init` → validates MIME type and size, checks chat membership, creates a
   `FileObject` row and returns a **presigned PUT URL** (10 min TTL).
2. The client `PUT`s the bytes directly to S3.
3. `POST /media/upload/complete` → `headObject` verifies the object really exists, and the
   `FileObject` is marked ready with its derived category (`image` / `video` / `audio` /
   `document`).
4. `GET /media/download/:id` → authorises against chat membership and returns a short-lived
   **presigned GET URL**.

Buckets (`avatars`, `chat-media`, `voice`, `video`, `stickers`, `exports`, `temp`) are ensured in
`S3Service.onModuleInit`, non-blocking and logged, so the same binary runs against SeaweedFS,
MinIO or any S3-compatible backend without code changes.

## Authentication model

- **Access token**: short-lived JWT (15 min default), sent as a cookie, also accepted as a
  `Bearer` token — the latter is what the WebSocket handshake uses.
- **Refresh token**: long-lived, rotated on every use, stored server-side so it can be revoked;
  reuse invalidates the session.
- Passwords hashed with **Argon2id**; optional **TOTP 2FA**.
- E-mail verification is required before login in production mode.

## Data model (core)

`User` → `Session` (refresh tokens), `Contact`, `Chat` → `ChatMember` (role), `Message`
(reply/parent, edit & delete metadata) → `Reaction`, `Media` → `FileObject` (bucket + key),
`Call`, `Notification`, `AuditLog`. Chats are polymorphic via `Chat.type`
(`PRIVATE` | `GROUP` | `CHANNEL` | `SAVED`), which keeps history queries uniform.

## Infrastructure

```
                       ┌─ PostgreSQL 16  (source of truth)
Docker Compose  ───────┼─ Redis 7        (cache, BullMQ queues, pub/sub)
                       ├─ SeaweedFS      (S3 gateway :9000)
                       ├─ coturn         (TURN :3478 + relay range)
                       └─ nginx          (reverse proxy :80)
```

`docker/docker-compose.minio.yml` overrides only the storage service, for operators who prefer
MinIO (pulled from Quay.io, since its Docker Hub images were removed in 2025).

## Observability

- Structured JSON logs via `nestjs-pino`; request id correlation through `pino-http`.
- `GET /api/v1/health` reports database and Redis readiness.
- Graceful shutdown on `SIGTERM`/`SIGINT` drains HTTP and closes Prisma/Redis.
