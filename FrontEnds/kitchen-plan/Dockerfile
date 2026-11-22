# Kitchen Plan service: Node built-ins only (node:sqlite, node:http), so the
# image needs no npm install and no build step. node:sqlite is unflagged from
# Node 22.13.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    KITCHEN_DB_PATH=/var/lib/kitchen-plan/kitchen-plan.sqlite \
    KITCHEN_BACKUP_DIR=/var/backups/kitchen-plan \
    KITCHEN_HOST=0.0.0.0 \
    KITCHEN_PORT=3100 \
    KITCHEN_FEED_HOST=0.0.0.0 \
    KITCHEN_FEED_PORT=3101

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY app/globals.css ./app/globals.css
COPY data/kitchen-recipes.paprikarecipes ./data/kitchen-recipes.paprikarecipes

# Named volumes copy this ownership on first use, so the unprivileged node
# user can write the database and backups.
RUN node --check server/main.mjs \
 && mkdir -p /var/lib/kitchen-plan /var/backups/kitchen-plan \
 && chown node:node /var/lib/kitchen-plan /var/backups/kitchen-plan \
 && chmod 0700 /var/lib/kitchen-plan /var/backups/kitchen-plan

USER node
VOLUME ["/var/lib/kitchen-plan", "/var/backups/kitchen-plan"]
EXPOSE 3100 3101

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

STOPSIGNAL SIGTERM
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.mjs"]
