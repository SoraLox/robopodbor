# Сборка фронта
FROM node:22-alpine AS build
WORKDIR /app

COPY apps/web/package*.json ./apps/web/
WORKDIR /app/apps/web
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY contracts ./contracts
COPY apps/web ./apps/web

WORKDIR /app/apps/web
# В docker-compose рядом поднимается настоящий apps/api, поэтому здесь
# MSW-моки отключены и все /api-запросы идут на реальный бэкенд через nginx.
ENV VITE_ENABLE_MOCKS=false
RUN npm run build

# Раздача статики
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
