# 9. Внешние библиотеки и источники данных (ТЗ 6.8)

Все библиотеки — свободное ПО с открытым исходным кодом. Точные версии закреплены в `apps/web/package-lock.json` и `apps/api/package-lock.json`.

## Сервер (`apps/api`)

| Библиотека | Назначение | Лицензия | Ссылка |
|---|---|---|---|
| Node.js 22 | среда выполнения | MIT | <https://nodejs.org> |
| Express 4 | HTTP-сервер | MIT | <https://expressjs.com> |
| Prisma 6 | ORM и миграции | Apache-2.0 | <https://www.prisma.io> |
| zod 3 | проверка входных данных | MIT | <https://zod.dev> |
| multer 2 | приём файлов | MIT | <https://github.com/expressjs/multer> |
| helmet 8 | заголовки безопасности | MIT | <https://helmetjs.github.io> |
| cors, cookie-parser | CORS и cookie | MIT | <https://github.com/expressjs> |
| SheetJS CE 0.20 | чтение и запись xlsx/csv | Apache-2.0 | <https://sheetjs.com> |
| tsx, TypeScript | сборка и запуск | MIT, Apache-2.0 | <https://www.typescriptlang.org> |

## Интерфейс (`apps/web`)

| Библиотека | Назначение | Лицензия | Ссылка |
|---|---|---|---|
| React 19 | интерфейс | MIT | <https://react.dev> |
| Vite | сборка | MIT | <https://vite.dev> |
| React Router 6 | маршрутизация | MIT | <https://reactrouter.com> |
| TanStack Query 5 | загрузка и кеш данных | MIT | <https://tanstack.com/query> |
| Zustand 5 | состояние мастера | MIT | <https://zustand.docs.pmnd.rs> |
| openapi-fetch, openapi-typescript | типизированный клиент по контракту | MIT | <https://openapi-ts.dev> |
| react-hook-form | формы | MIT | <https://react-hook-form.com> |
| Radix UI | доступные примитивы | MIT | <https://www.radix-ui.com> |
| Tailwind CSS | стили | MIT | <https://tailwindcss.com> |
| Recharts | графики | MIT | <https://recharts.org> |
| three.js, @react-three/fiber, drei | 3D-сцена и визуализация | MIT | <https://threejs.org> |
| jsPDF, jspdf-autotable | отчёт PDF | MIT | <https://github.com/parallax/jsPDF> |
| SheetJS CE | выгрузка Excel | Apache-2.0 | <https://sheetjs.com> |
| lucide-react | иконки | ISC | <https://lucide.dev> |
| MSW | моки API для демо без сервера и тестов | MIT | <https://mswjs.io> |
| Vitest, Testing Library | тесты | MIT | <https://vitest.dev> |

Шрифты:

- PT Sans — для отчёта PDF, лицензия SIL OFL 1.1, текст лицензии в `apps/web/src/assets/fonts/PTSans-OFL.txt`. Ссылка: <https://www.paratype.ru/public/>.
- Inter, Space Grotesk, JetBrains Mono — для интерфейса, лицензия SIL OFL 1.1, пакеты Fontsource.

## Инфраструктура

| Компонент | Лицензия | Ссылка |
|---|---|---|
| PostgreSQL 16 | PostgreSQL License | <https://www.postgresql.org> |
| nginx | BSD-2-Clause | <https://nginx.org> |
| Caddy 2 | Apache-2.0 | <https://caddyserver.com> |
| Docker, Docker Compose | Apache-2.0 | <https://www.docker.com> |

## Источники данных

Актуальный список ведёт администратор в разделе «Справочники» → «Источники данных». Он же выводится в каждом отчёте. Начальный набор:

| Источник | Что взято | Актуальность |
|---|---|---|
| Каталог решений организатора (PDF) | перечень решений и характеристики | ожидается от организатора |
| Демо-датасеты объектов «Датасеты_хакатон.xlsx» | паспорта склада, аэропорта и медучреждения, значения по умолчанию | 2026 |
| Файл цен БАС и БРС (catalog_export_v5) | цены изделий с НДС, без доставки и пусконаладки | ожидается от организатора |
| Прайс-листы вендоров | цены на технику и системы управления парком | 17.09.2026 |
| Тарифы электроэнергии | стоимость кВт·ч по регионам | 01.09.2026 |
| [Реестр российской промышленной продукции Минпромторга (ГИСП)](https://gisp.gov.ru/pp719v2/pub/prod/) | признак российского происхождения | 28.08.2026 |
| Отраслевой бенчмарк | стоимость смены, тариф RaaS, сервисный контракт | 2025 |
| Сайты производителей и публичные спецификации | недостающие характеристики решений | 09.2026 |

У каждого решения каталога хранятся собственные источник, ссылка, дата актуализации и признак подтверждённости (ТЗ 3.3.4).
