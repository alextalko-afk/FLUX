# API server image. Build context: the repository root.
#   docker build -f docker/server/Dockerfile -t flux-server .
# The `builder` stage also carries the Prisma CLI, so docker-compose.prod.yml uses it as the one-shot
# `migrate` job; the `runner` stage is what runs the API.
FROM node:22-alpine AS builder
WORKDIR /app
# openssl: Prisma engine. python3/make/g++: argon2 compiles from source when its prebuilt binary cannot be fetched.
RUN apk add --no-cache openssl python3 make g++
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY tsconfig.base.json ./
RUN pnpm --filter @FLUX/server exec prisma generate
RUN pnpm --filter @FLUX/shared run build
RUN pnpm --filter @FLUX/server run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg also provides ffprobe: video posters and server-measured media duration. openssl: Prisma engine.
RUN apk add --no-cache ffmpeg openssl
# Same paths as in the builder, so pnpm's symlinked node_modules keep resolving.
COPY --from=builder /app /app
EXPOSE 3000
USER node
CMD ["node", "apps/server/dist/main.js"]

# Hosts without a separate migration job (Render free): apply migrations, then start the API.
FROM builder AS render
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg openssl
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @FLUX/server exec prisma migrate deploy && node apps/server/dist/main.js"]
