# FLUX

**FLUX** is an independent, production-ready, full-stack messenger built as a pnpm
monorepo: a **NestJS** API with WebSocket realtime, a **React** web client, and a **PostgreSQL +
Redis + S3-compatible storage + TURN** Docker infrastructure.

> **Disclaimer:** This is an independent open-source project. It is not affiliated with, endorsed
> by, or connected to Telegram FZ-LLC or any other proprietary messenger company.

---

## Current status

The backend, infrastructure and an end-to-end verification suite are complete and green. The web
client is a functional single-page app covering the whole messaging loop: authentication (including
self-service password reset), chat
creation (private / group / channel), message history with attachments and voice notes, replies, reactions, edit
and delete, live typing indicators, global search, contacts, calls UI, an admin panel and full
settings (profile, 2FA, password, sessions, notifications with Web Push, privacy switches and
blocked users), plus polls, stories, group calls, bots and more (see [docs/FEATURES.md](docs/FEATURES.md)). Mobile (Expo) and desktop (Electron) clients are in `apps/`; real-device checks are still pending.

| Area | State |
| --- | --- |
| Auth (register → e-mail verify → login → refresh → 2FA/TOTP) | ✅ implemented, covered by smoke test |
| Chats (private / saved / group / channel), membership, roles | ✅ implemented, covered by smoke test |
| Messages (send, history, edit, delete, reactions, replies, search) | ✅ implemented, covered by smoke test |
| Realtime (WS auth, `chat.created`, `message.new`, `message.updated`) | ✅ implemented, covered by smoke test |
| Media (presigned upload → download) | ✅ implemented, covered by smoke test |
| Image thumbnails (Sharp JPEG previews via `?thumb=1`) | ✅ implemented, unit-tested + E2E-verified |
| Voice notes (in-browser recorder, duration + waveform, audio player) | ✅ implemented, unit + integration-tested |
| Password reset (`/auth/password/forgot` → `/auth/password/reset`, rotates sessions) | ✅ implemented, E2E-verified |
| Bot API + signed webhooks (HMAC-SHA256, queued delivery) | ✅ implemented, unit-tested |
| S3 object storage (buckets auto-created at startup) | ✅ working (SeaweedFS) |
| Infrastructure (Postgres, Redis, SeaweedFS, coturn, nginx) | ✅ `docker compose` |
| Web client (auth, chats, messaging, attachments, search, contacts, calls, admin, settings) | ✅ builds & runs |
| Privacy (14 switches enforced across profiles, presence, typing, calls, chats, forwarding) | ✅ implemented, unit-tested |
| Interface language (English / Russian) with CLDR plural forms | ✅ implemented |
| Appearance (light / dark / system theme, accent colours, wallpapers, compact mode) | ✅ implemented |
| coturn end-to-end WebRTC verification | ⚠️ configured, not yet verified in a call |
| Web UI — bots, stickers, folders | 🚧 pending |
| Polls, stickers, forum topics, channel extras, geolocation, QR login, FFmpeg, group calls (LiveKit), mobile push, admin settings, metrics | ✅ implemented, see [docs/FEATURES.md](docs/FEATURES.md) |
| Mobile (`apps/mobile`) and desktop (`apps/desktop`) | 🚧 push + autostart added; not verified on devices |
| Automated tests (unit / integration / Playwright) | ✅ unit suite (`tests/unit`, 96 tests); integration and Playwright suites scaffolded in `tests/` |

---

## Features

**Messaging**

- Private chats, saved messages, groups and channels with roles (owner / admin / member)
- Real-time delivery over WebSocket with per-user fan-out (see *Known limitations* below)
- Message edit, delete-for-everyone, reactions, replies, full-text search
- Read receipts, live typing indicators, online presence

**Media & calls**

- Presigned S3 uploads (images, video, voice notes, documents) with per-bucket quotas
- Attachments sent from the message composer and rendered inline from `message.media`
- Server-side JPEG thumbnails for images (Sharp: EXIF-rotated, alpha flattened, ≤480 px), stored
  next to the original and served through `GET /api/v1/media/download/:id?thumb=1`; the chat list
  loads the preview and the lightbox loads the full-resolution object
- Voice notes: recorded in the browser (`MediaRecorder`), uploaded through the same presigned flow,
  and sent as a `VOICE` message whose `duration` (seconds) and normalised `waveform` samples are
  stored on `MessageMedia` and rendered by the inline audio player
- Avatars, stickers, chat media, exports
- Voice/video calls via WebRTC with coturn TURN relay (initiate / accept / reject / end wired in the UI)

**Security**

- Argon2id password hashing, short-lived access token + rotating refresh token
- JWT auth for both REST and WebSocket
- E-mail verification, optional 2FA (TOTP), rate limiting, Helmet
- Self-service password reset by e-mail code; a successful reset revokes every active session and
  refresh token, so a previously stolen session cannot outlive the password change
- Role-based access control and an audit log

**Bots**

- Owner-scoped bot tokens (`x-bot-token`) for sending messages (with inline keyboards), editing and
  deleting the owner's messages, and answering `/commands`
- A bot may only post into chats its owner belongs to
- Outgoing webhooks are delivered off the request path through **BullMQ**: each update is POSTed as
  JSON with an `X-FLUX-Signature: sha256=<hmac>` header (HMAC-SHA256 over the exact body) and an
  `X-FLUX-Event` header, retried 3× with exponential backoff. Receivers verify with
  `verifyWebhookSignature` (`apps/server/src/bots/bot-webhooks.sign.ts`)

**Interface**

- English and Russian UI, switchable at login and in Settings → Language (auto-detected on first run)
- CLDR plural forms via `Intl.PluralRules` — "1 участник / 2 участника / 5 участников"
- Light / dark / system theme, six accent colours, three chat wallpapers, compact list mode
- Optional Enter-to-send toggle (off ⇒ Ctrl/⌘+Enter sends)

**Platform**

- Web (React 18 + Vite), desktop (Electron), mobile (React Native)
- Admin panel, Bot API, web push (VAPID)
- Structured logging (pino) and health checks

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Server | NestJS 10, Prisma 5, Socket.IO / `ws`, BullMQ, class-validator, nestjs-pino |
| Web | React 18, TypeScript 5, Vite 7, React Router 7, Zustand, TanStack Query, TailwindCSS 4 |
| Database | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 |
| Object storage | SeaweedFS S3 gateway (MinIO via optional override) |
| TURN / STUN | coturn |
| Reverse proxy | nginx (production compose profile) |
| Monorepo | pnpm workspaces + Turborepo |
| Verification | `scripts/smoke-test.mjs` (Node 22, built-in `fetch` + WebSocket) |

---

## Repository layout

```
FLUX-messenger/
├── apps/
│   ├── server/            # NestJS API + WebSocket gateway (apps/server/src)
│   │   └── src/           #   auth, chats, messages, media, realtime, search, admin, ...
│   ├── web/               # React SPA (Vite)
│   ├── mobile/            # React Native (scaffolded)
│   └── desktop/           # Electron (scaffolded)
├── packages/
│   └── shared/            # Shared types, enums and zod/DTO contracts
├── docker/
│   ├── docker-compose.minio.yml   # optional MinIO override (quay.io)
│   ├── coturn/             # turnserver.conf
│   ├── nginx/              # production reverse-proxy configs
│   └── server|web/         # Dockerfiles
├── docs/                   # Architecture & deployment docs
├── scripts/                # install-all.sh, start-dev.sh, reset-project.sh, smoke-test.mjs
├── docker-compose.yml      # postgres, redis, seaweedfs, coturn, nginx
├── .env.example            # every supported configuration key
└── pnpm-workspace.yaml
```

---

## Quick start

### Prerequisites

- Node.js **22+** and **pnpm 9+**
- Docker with Compose v2
- On Windows the shell scripts require **Git Bash** or **WSL** (PowerShell 5.1 mishandles the
  UTF-8 output of some scripts).

### 1. Install and start everything

```bash
./scripts/install-all.sh
```

This installs dependencies, creates `.env` from `.env.example`, starts PostgreSQL / Redis /
SeaweedFS / coturn, runs Prisma migrations and builds all packages.

### 2. Create the first account

No demo accounts are ever created. Seed an administrator yourself:

```bash
pnpm cli:admin --email=admin@example.com --password='ChangeMe123!' --username=admin
```

### 3. Run the development servers

```bash
./scripts/start-dev.sh        # shared watcher + NestJS + Vite in parallel
```

| Service | URL |
| --- | --- |
| Web client | http://localhost:5173 |
| REST API | http://localhost:3000/api/v1 |
| Health check | http://localhost:3000/api/v1/health |
| WebSocket | `ws://localhost:3000/ws` |
| SeaweedFS S3 | http://localhost:9000 |
| SeaweedFS UI | http://localhost:8888 |

### Production-style run

```bash
pnpm build
pnpm --filter @FLUX/server run start:prod
```

or, with the reverse proxy in front (nginx expects the built API and SPA to run on the host and
forwards to them through `host.docker.internal`):

```bash
pnpm build
pnpm --filter @FLUX/server run start:prod &
docker compose up -d postgres redis seaweedfs coturn nginx
# http://localhost:80  -> SPA + /api + WebSocket upgrade
```

On a VPS use `docker-compose.prod.yml` (Caddy + HTTPS, migrations, optional calls): see [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md), backups in [docs/BACKUP.md](docs/BACKUP.md).

---

## Configuration

Every supported key lives in `.env.example`; copy it to `.env` and edit it. **Never commit
`.env`** — real secrets live only on the server. Key groups:

| Group | Keys |
| --- | --- |
| Database & cache | `DATABASE_URL`, `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT` |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_*_EXPIRATION`, `ARGON2_*`, `PASSCODE_PEPPER` |
| Storage | `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_*`, `S3_FORCE_PATH_STYLE` |
| Mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (empty host: codes are only logged) |
| Antivirus | `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_REQUIRED` (start it with `docker compose --profile antivirus up -d clamav`) |
| Admin | `ADMIN_REQUIRE_2FA` (1 = the admin API needs two-factor sign-in) |
| Push | `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Calls | `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`, `STUN_SERVER_URL` |
| Server | `PORT`, `NODE_ENV`, `FRONTEND_URL`, `API_PREFIX`, `WS_PATH`, `MAX_UPLOAD_SIZE_MB`, `RATE_LIMIT_*` |

Check a configuration with `pnpm cli:check-config`.

Operator commands: `pnpm cli:admin`, `pnpm cli:user`, `pnpm cli:reset-password --email=… --password=…` (also signs the account out everywhere), `pnpm cli:cleanup` (expired codes and old sessions).

### Secret chats (end-to-end encrypted)

Each browser creates its own X25519 key pair (libsodium) and keeps the private key in IndexedDB; the server stores public keys only and refuses plaintext in a secret chat. A secret chat is bound to one device per side, so it is not readable on other devices, cannot be forwarded or pinned, and is excluded from search. Compare the safety number in the chat header to verify the peer. Losing the browser data means losing the chat history.

Generate secrets with `openssl rand -hex 32`, or use `pnpm cli:vapid` for the VAPID pair.

---

## Testing

The end-to-end smoke test boots nothing itself — point it at a running stack (API on `:3000`,
Redis, Postgres, S3):

```bash
pnpm smoke
```

It registers two fresh users, verifies e-mail, searches, creates private/group/channel chats,
sends/edits/reacts to messages, uploads and downloads media over presigned URLs, then opens two
WebSocket clients and asserts realtime events. Current result: **22/22 passing**.

---

## Infrastructure

| Service | Container | Port(s) |
| --- | --- | --- |
| PostgreSQL 16 | `tglike-postgres` | `5432` |
| Redis 7 | `tglike-redis` | `6379` |
| SeaweedFS (S3) | `tglike-seaweedfs` | `9000` (S3), `8888` (UI) |
| coturn | `tglike-coturn` | `3478` TCP/UDP, `49160-49200` UDP relay |
| nginx | `tglike-nginx` | `80` (reverse proxy for the API + SPA) |

Useful commands:

```bash
pnpm docker:up            # postgres + redis + seaweedfs + coturn
pnpm docker:logs          # follow all logs
bash ./scripts/reset-project.sh   # wipe local data volumes (source is kept)
```

**S3 backend:** the default is SeaweedFS. MinIO's images were removed from Docker Hub in 2025,
so if you prefer MinIO use the override that pulls from Quay:

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.minio.yml up -d
```

Application buckets (`avatars`, `chat-media`, `voice`, `video`, `stickers`, `exports`, `temp`)
are created automatically by `S3Service.onModuleInit`, so any S3-compatible backend works.

---

## Development notes & known gotchas

These are real traps found while bringing the project up — keep them in mind when changing code:

1. **`enableImplicitConversion` must stay `false`** in the server `tsconfig`. With it enabled,
   a missing numeric `@Query` param becomes `NaN` and Prisma throws on `take: null`. Numeric
   query params are therefore parsed explicitly with `parsePositiveInt`
   (`apps/server/src/common/utils/parse-query.ts`).
2. **Re-creating an existing private chat must still emit `chat.created`** to both members, or
   one side of the conversation never converges on the other client.
3. **PowerShell 5.1 reads scripts as ANSI** — emoji literals in `.ps1` files break execution;
   use `ConvertFrom-Ascii`/`ConvertFromUtf32` instead.
4. **`process.exit()` truncates buffered stdout** when output is redirected; set
   `process.exitCode` and let Node flush.
5. **Startup ordering matters:** the API creates S3 buckets at boot. If SeaweedFS is not up yet
   the call fails with `socket hang up` (non-blocking, logged as a warning) — restart the API
   after storage is ready, or add a healthcheck dependency in Compose.
6. **BullMQ requires `maxmemory-policy noeviction` on Redis.** With an LRU eviction policy Redis may
   silently drop queue/job keys under memory pressure. `docker-compose.yml` sets
   `--maxmemory-policy noeviction`; if you point the app at an external Redis, set the same.

---

## Known limitations

Documented on purpose so nobody has to rediscover them:

1. **Run a single API instance.** Realtime delivery is kept in an in-memory
   `Map<userId, Set<socket>>`; the WebSocket gateway does not publish to Redis. With several API
   replicas, a user would only receive events produced by the replica their socket is connected
   to. Scaling out requires per-user Redis pub/sub fan-out first.
2. **Presence is broadcast to every connected socket**, not only to contacts.
3. **Privacy `allowSavingMedia` and `allowP2P` are client-enforced.** Both are stored and returned
   to clients, but the server cannot stop a browser from saving a file it already downloaded or
   force the ICE path. The other eleven switches are enforced server-side (profiles, presence,
   typing, read receipts, calls, new dialogs, group invites, forwarding).
4. **coturn is configured but not verified** with a real WebRTC call yet.
5. **Mobile and desktop are scaffolds** — the working client today is the web app.

---

## Roadmap

- Verify coturn with a real WebRTC call smoke test
- Complete web UI: calls, admin panel, bots, stickers, folders, themes, voice messages
- Unit / integration / Playwright test suites
- Implement `apps/mobile` (React Native) and `apps/desktop` (Electron)
- Message scheduling, cloud drafts, polls, stickers

## Security note

`docker-compose.yml` and `.env.example` ship **development** credentials (e.g. `tgpass`). Never use them in production:
deploy with `docker-compose.prod.yml` and a filled-in `.env.prod` (see [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md)).
Report vulnerabilities as described in [SECURITY.md](SECURITY.md).
