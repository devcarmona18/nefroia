# syntax=docker/dockerfile:1.7
# NefroIA: imagen multi-stage (Next.js standalone, usuario no root).

ARG NODE_VERSION=22

# ---------- Dependencias ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts evita ejecutar `husky` (no existe .git en la imagen).
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------- Compilación ----------
FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=3072
RUN pnpm build

# ---------- Migraciones (se ejecuta una vez antes de la app) ----------
FROM deps AS migrate
WORKDIR /app
COPY drizzle.config.ts tsconfig.json ./
COPY lib/db ./lib/db
CMD ["pnpm", "db:migrate"]

# ---------- Ejecución ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    EMBEDDING_CACHE_DIR=/app/.cache/transformers

# Caché escribible del modelo de embeddings local (se descarga en el primer
# uso; para entornos sin red, monta un volumen ya poblado en esta ruta).
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/.cache/transformers \
    && chown -R nextjs:nodejs /app/.cache

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
