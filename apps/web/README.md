# Роботоподбор · фронтенд

React 19 + TypeScript (strict) + Vite. UI собран по дизайн-системе платформы:
плотная сетка, hairline-разделители, оранжевый акцент только на primary-действиях.

## Запуск

```bash
npm install --prefix apps/web
npm run dev --prefix apps/web
```

Бэкенд не нужен: в dev весь `/api` обслуживает MSW.

## Страницы

| Маршрут | Что там |
| --- | --- |
| `/` | Лендинг: герой с 3D-манипулятором, числа, «как работает», объекты, эффект, CTA |
| `/login` | Вход, форма с валидацией |
| `/calculate/:type` | Шаг 1 — выбор типа объекта |
| `/calculate/:type/form` | Шаг 2 — паспорт объекта, 6 полей с валидацией |
| `/calculate/:type/processes` | Шаг 3 — выбор автоматизируемых процессов |
| `/calculate/:type/results/:id` | Шаг 4 — KPI, сценарии, CAPEX/OPEX в аккордеоне |
| `/catalog` | Каталог: фильтры слева, таблица с чекбоксами |
| `/catalog/compare` | Построчное сравнение отмеченных решений |
| `/projects` | Мои расчёты: сводные KPI и таблица |
| `/methodology` | Методика и допущения по умолчанию |
| `/admin` | Справочники и источники данных |
| любой другой | 404 |

3D-манипулятор процедурный (three.js, без внешних моделей): серебристый
металлик, планарная обратная кинематика двух звеньев — клешня идёт за
курсором в плоскости экрана. Масштаб подгоняется под высоту канваса.

## Проверки

```bash
npm run typecheck --prefix apps/web
npm run test --prefix apps/web
npm run build --prefix apps/web
```

## Структура

- `src/styles/globals.css` — токены дизайн-системы (CSS-переменные shadcn)
- `src/shared/components/` — SectionHeading, KpiBlock, StatusBadge, DataCard,
  Sparkline, ComparisonTable, Stepper. У каждого — пример использования в JSDoc
- `src/components/ui/` — примитивы shadcn/ui
- `src/features/` — экраны по доменам
- `src/api/` — OpenAPI-стаб, типизированный клиент (openapi-fetch), TanStack Query
- `src/mocks/` — MSW: обработчики и фикстуры с цифрами из макета

`src/features/results/visualization/VisualizationSlot.tsx` — заглушка,
её заполняет отдельный поток.
