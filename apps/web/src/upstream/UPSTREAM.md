# Перенесённый код симуляции и экономики

Каталог содержит **дословную копию** кода из репозитория разработчика.
Правки здесь не приветствуются: чем ближе файлы к оригиналу, тем дешевле
забирать его обновления обычным diff'ом.

| | |
|---|---|
| Источник | https://github.com/bam-low/lct |
| Ветка | `main` |
| Коммит | `fe37345` (прошлый перенос — `2ed95bc`) |
| Дата коммита | 29 сентября 2026 |
| Автор | Egor |
| Перенесено | 24 сентября 2026, обновлено 29 сентября 2026 |

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

Наших правок много, поэтому обновлять лучше трёхсторонним слиянием по каждому
файлу: база — перенесённый коммит upstream, «наши» — этот каталог, «их» —
новый коммит (`git merge-file ours base theirs`). Новые модели из `public/models`
кладутся в `apps/web/assets-src/models` и сжимаются `bash scripts/build-models.sh`.

После обновления поменяйте коммит в таблице выше.

## Наши правки поверх оригинала

- Убраны подписи размеров чанков на полу (`chunkLabels.js`, `chunkLabelLines`):
  по решению продукта, и они давали рывок при повороте камеры.
- Производительность: адаптивный DPR, отрисовка только при изменениях,
  сжатые модели — см. `apps/web/docs/performance/animations.md`.
- Пастельная «студийная» палитра (`studioLook.js`) дополнена цветами конструктора
  формы склада (контур, стеллажи, зоны ворот); `floor.js` и `walls.js` берут
  цвета через `activePalette()`.
- `WarehouseScene.jsx` и `AirportScene.jsx`: режим `immersive` для hero отчёта —
  канвас на весь контейнер, плейбек, камера и снимок PNG управляются из
  `SimPlaybackContext` (кнопки в панели отчёта).
- Сцене аэропорта модели роботов загружаются заранее в нашей обёртке
  (`ResultSimulation.tsx`), у upstream их прогревает `main.jsx`.

## Как наши роботы попадают в сцену

`features/results/simulation/simulationInput.ts` (склад) и `airportInput.ts`
(аэропорт) переводят паспорт объекта и карточку каталога во входы сцен.
3D-модель выбирается по типу решения: AMR и тягачи — LowCart (`transporter`),
системы хранения — СтойкаБокс (`storagecube`), погрузчики и штабелёры —
погрузчик, уборщики — пылесос. Склад — стандартный прямоугольник
(`buildDefaultShape`): конструктора формы в нашем мастере нет. Сцена аэропорта
показывает только транспортировку груза и багажа.

