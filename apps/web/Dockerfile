# Сборка фронта
FROM node:22-alpine AS build
WORKDIR /app

COPY apps/web/package*.json ./apps/web/
WORKDIR /app/apps/web
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY contracts ./contracts
# Общие с API правила подбора и паспорта объекта (alias @domain в vite.config.ts).
COPY apps/api/src/domain ./apps/api/src/domain
COPY apps/web ./apps/web

WORKDIR /app/apps/web
# В docker-compose рядом поднимается настоящий apps/api, поэтому здесь
# MSW-моки отключены и все /api-запросы идут на реальный бэкенд через nginx.
ENV VITE_ENABLE_MOCKS=false
# nginx отдаёт index.html на любой путь, поэтому можно чистые URL вместо /#/...
ENV VITE_ROUTER=browser
RUN npm run build
# Сжимаем заранее: nginx отдаёт готовый .gz через gzip_static, не тратя CPU на каждый запрос.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' -o -name '*.glb' \) \
      -size +1k -exec gzip -9 -k {} \;

# Раздача статики
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/ /etc/nginx/snippets/
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
# 127.0.0.1, а не localhost: в alpine localhost — это ::1, а nginx слушает только IPv4,
# и контейнер навсегда оставался unhealthy при рабочем сайте.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
