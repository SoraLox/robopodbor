FROM node:22-alpine AS build
WORKDIR /app

COPY apps/api/package*.json ./apps/api/
WORKDIR /app/apps/api
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY apps/api ./apps/api

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production

COPY --from=build /app/apps/api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/api/health >/dev/null || exit 1

# Применяем миграции и (идемпотентно) досеиваем демо-данные при каждом старте,
# чтобы "docker compose up" оставался единственной командой для воспроизводимого
# запуска и демонстрационного расчёта (см. 8.2.2, 6.10 ТЗ).
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/index.js"]
