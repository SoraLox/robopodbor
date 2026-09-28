# РОБОПОДБОР

Независимый расчёт окупаемости роботизации склада, аэропорта и медучреждения: каталог роботов, подбор под объект, экономика «как есть / покупка / аренда», 3D-симуляция склада и отчёт в PDF и Excel.

## Запуск за три шага

Нужен только [Docker Desktop](https://www.docker.com/products/docker-desktop/): macOS (Intel и Apple Silicon), Windows 10/11 с WSL2 или Linux с Docker Compose v2. Node.js, PostgreSQL и прочее ставить не нужно — всё собирается в контейнерах.

1. Запустите Docker Desktop и дождитесь, пока он напишет, что движок работает.
2. Скачайте проект:

   ```bash
   git clone https://github.com/SoraLox/robopodbor.git
   cd robopodbor
   ```

3. Соберите и запустите:

   ```bash
   docker compose up --build
   ```

   Первая сборка занимает 4–6 минут (скачиваются образы и npm-пакеты), следующие запуски — секунды. Готово, когда в логе появится `api listening on :4000`, а `robopodbor-web-1` станет healthy.

Откройте **<http://localhost:8080>**.

Файл `.env` для локального запуска не нужен: база, миграции, каталог из 188 роботов и демо-пользователи создаются сами.

## Демо-доступ

| Роль | Почта | Пароль |
|---|---|---|
| Пользователь | krylov@volga-logistic.ru | volga123 |
| Администратор | admin@robotopodbor.ru | admin123 |

Без входа доступны каталог и полный расчёт: «Рассчитать окупаемость» → тип объекта → паспорт (можно ничего не вводить, пустые поля берутся из датасета организатора) → процесс и робот → отчёт.

## Если что-то пошло не так

| Что видно | Что сделать |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop не запущен — запустите и повторите команду |
| `port is already allocated` / `address already in use` на 8080 | Порт занят другой программой. Создайте рядом с `docker-compose.yml` файл `.env` со строкой `WEB_PORT=8090` и откройте <http://localhost:8090> |
| Сборка падает на `npm ci` или скачивании образов | Нет интернета или мешает прокси/VPN. Интернет нужен только на первой сборке |
| Сборка падает с нехваткой памяти | В Docker Desktop → Settings → Resources дайте не меньше 4 ГБ памяти |
| Сайт открылся, но пустой или «Не удалось загрузить» | Посмотрите `docker compose logs migrate api`: миграции и сид должны закончиться строкой «Сид базы данных выполнен» |
| После `git pull` не видно изменений | Пересоберите: `docker compose up --build` |

Остановить — `Ctrl+C` или `docker compose down`. Начать с чистой базы — `docker compose down -v`, затем снова `docker compose up --build`.

## Документация

- [docs/README.md](docs/README.md) — состав документации по пунктам ТЗ, сборник в [docs/robopodbor-docs.pdf](docs/robopodbor-docs.pdf).
- [docs/02-deploy.md](docs/02-deploy.md) — размещение на сервере с HTTPS и запуск для разработки.
- [docs/examples/](docs/examples/) — пример выгруженного отчёта.
- [contracts/openapi.yaml](contracts/openapi.yaml) — API.
