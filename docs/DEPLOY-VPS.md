# Deploying FLUX on a VPS

One Linux VPS (2 vCPU / 4 GB RAM is enough for a few hundred users), Docker with the compose plugin, and a domain.

## 1. DNS and firewall
- `A` records for `chat.example.com`, `s3.chat.example.com` (and `lk.chat.example.com` for group calls) → the VPS IP.
- Open: `80/tcp`, `443/tcp`, `443/udp`. With `--profile calls` also: `3478/tcp+udp`, `49160-49200/udp` (TURN), `7881/tcp`, `50000-50100/udp` (LiveKit).
- Nothing else is published: Postgres, Redis and the object store sit on an internal Docker network.

## 2. Configure
```bash
git clone <repo> flux && cd flux
cp .env.prod.example .env.prod
```
Fill in every value (`openssl rand -hex 32` for secrets). Also set what you use from `.env.example`: `SMTP_*` (otherwise verification codes are only logged), `FCM_*`/`EXPO_*` (mobile push), `VAPID_*` (web push), `FFMPEG_*`, `LIVEKIT_URL=wss://lk.<domain>`, `TURN_*`.
`METRICS_TOKEN` enables `/api/v1/metrics` for Prometheus (`Authorization: Bearer <token>`).

## 3. Start
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# group calls + TURN:
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile calls up -d
```
Startup order: Postgres/Redis → `migrate` (one-shot `prisma migrate deploy`) → `server` → Caddy. Caddy gets the certificates itself.
Check: `curl https://chat.example.com/api/v1/health`.

## 4. First admin
Register in the web UI, then promote the account:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE \"User\" SET role='"'"'ADMIN'"'"' WHERE email='"'"'you@example.com'"'"'"'
```
Sign in again (the role is in the access token). Admin → System: close registration, maintenance mode, upload limit, queues.

## 5. Update
```bash
git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Migrations run automatically. Back up first (see BACKUP.md).

## Notes
- `S3_PUBLIC_ENDPOINT=https://s3.<domain>`: browsers upload/download straight to storage through presigned links; the API talks to it over the internal network.
- `TRUST_PROXY=1` is set because Caddy is the only proxy; do not put another proxy in front without raising it.
- Logs: `docker compose -f docker-compose.prod.yml logs -f server`.

## Monitoring (optional)
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile monitoring up -d
ssh -L 3001:127.0.0.1:3001 user@vps      # then open http://localhost:3001 (admin / GRAFANA_PASSWORD)
```
Prometheus scrapes `/api/v1/metrics` with `METRICS_TOKEN`; the FLUX dashboard (requests, latency, WebSockets, messages, queues) is provisioned automatically. Alert rules are in `docker/monitoring/alerts.yml` (API down, 5xx rate, latency, failed queue jobs); connect Alertmanager or Grafana contact points to receive them.
