# One image runs the web app, the migrations and the background worker (the command differs; see docker-compose.yml).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
# postgresql-client gives the worker pg_dump for nightly backups. tini makes shutdowns clean.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PHOTO_DIR=/data/photos BACKUP_DIR=/backups
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/photos /backups && chown -R node:node /data /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
