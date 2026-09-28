FROM node:22-alpine AS build
WORKDIR /app/apps/api

COPY apps/api/package*.json ./
RUN npm ci --no-audit --no-fund

COPY apps/api ./
RUN npx prisma generate
RUN npm run build

# Одноразовый прогон миграций и (идемпотентного) сида демо-данных — отдельный сервис
# в docker-compose, чтобы "docker compose up" оставался единственной командой для
# воспроизводимого запуска (см. 8.2.2, 6.10 ТЗ), а сам API стартовал сразу и не
# тащил в рантайм prisma CLI и tsx.
FROM build AS migrate
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]

FROM node:22-alpine AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production
# scrypt при входе выполняется в пуле потоков libuv (по умолчанию 4 потока) —
# поднимаем, чтобы несколько одновременных входов не блокировали остальной I/O.
ENV UV_THREADPOOL_SIZE=8

COPY --from=build /app/apps/api/package*.json ./
# npm сам доставляет peer-зависимости @prisma/client — CLI prisma, его движки и
# typescript (~170 МБ). В рантайме нужен только клиент и сгенерированный .prisma.
RUN npm ci --omit=dev --omit=peer --no-audit --no-fund \
  && npm prune --omit=dev --legacy-peer-deps \
  && npm cache clean --force
COPY --from=build /app/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./dist
# Нужен только файл демо-расчёта для GET /api/calculations.
COPY --from=build /app/apps/api/prisma/seed-data/demo-calculation.json ./prisma/seed-data/demo-calculation.json

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1

# exec-форма: node — PID 1 и сам получает SIGTERM от docker stop (см. shutdown в index.ts).
CMD ["node", "dist/index.js"]
