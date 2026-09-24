# Перенесённый код симуляции и экономики

Каталог содержит **дословную копию** кода из репозитория разработчика.
Правки здесь не приветствуются: чем ближе файлы к оригиналу, тем дешевле
забирать его обновления обычным diff'ом.

| | |
|---|---|
| Источник | https://github.com/bam-low/lct |
| Ветка | `main` |
| Коммит | `2ed95bcea274059549c001193759220c6a6682ba` |
| Дата коммита | 22 сентября 2026 |
| Автор | Egor |
| Перенесено | 24 сентября 2026 |

## Что взято

| Каталог там | Каталог здесь |
|---|---|
| `src/simulation/*` | `simulation/` — сцена three.js, роботы, маршруты, пол, энергия |
| `src/domain/*` | `domain/` — `scenarioEngine`, `economics`, `applicability`, `catalog`, `warehouseAdapter` |
| `src/state/*` | `state/` — состояние экономики и проекта |
| `public/models/*.glb` | `apps/web/public/models/` — forklift, truck, vacuum |
| `public/icons.svg` | `apps/web/public/sim-icons.svg` |

Его `src/components/*` сюда **не** переносились: интерфейс мы пересобираем в
своём дизайне, оригинальные компоненты служат только образцом поведения.
Его `App.css`/`index.css` не брали — они на Tailwind 4, у нас Tailwind 3.

## Что важно знать

- Код на JavaScript, не на TypeScript. В `tsconfig.app.json` включён `allowJs`,
  но `checkJs` оставлен выключенным — файлы намеренно не типизируются, чтобы
  не расходиться с оригиналом.
- Каталог исключён из eslint по той же причине.
- Модели грузятся как `${import.meta.env.BASE_URL}models/<файл>.glb` — с base
  path GitHub Pages это работает без правок.
- Внешних зависимостей ровно две: `react` и `three` (включая
  `three/addons/loaders/GLTFLoader.js`). Код написан под three `0.186`.

## Как обновлять

```
git clone --depth 1 https://github.com/bam-low/lct.git
diff -ru lct/src/simulation apps/web/src/upstream/simulation
```

После обновления поменяйте коммит в таблице выше.
