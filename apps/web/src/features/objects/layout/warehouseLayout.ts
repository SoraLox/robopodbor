/**
 * Планировка склада из конструктора (шаг мастера «Планировка»): сетка клеток
 * upstream (simulation/shape) ↔ компактная строка для паспорта и расчёта, плюс
 * метрики, которые из неё берут экономика и сцена.
 *
 * Нарисованный контур — это весь склад из паспорта: площадь пола (пол, ворота,
 * стеллажи) равна «Общей площади склада», отсюда размер клетки в метрах.
 */
import { CELL, GRID_SIZE, buildDefaultShape, makeEmptyShape } from '@/upstream/simulation/shape/shapeTypes.js';
import { computeGateClusters } from '@/upstream/simulation/shape/shapeGeometry.js';
import { decodeLayoutCells, encodeLayoutCells, rackStorageOf, type RackStorage } from '@domain/warehouseLayout';

export interface Shape {
  gridSize: number;
  cellSize: number;
  cells: Uint8Array;
}

/** «25:F1G3F2…» — размер сетки и серии клеток (кодек общий с расчётом, @domain/warehouseLayout). */
export function encodeShape(shape: Shape): string {
  return encodeLayoutCells(shape.gridSize, shape.cells);
}

export function decodeShape(text: string | null | undefined): Shape | null {
  const decoded = decodeLayoutCells(text);
  if (!decoded || decoded.gridSize !== GRID_SIZE) return null;
  const shape = makeEmptyShape(GRID_SIZE) as Shape;
  shape.cells.set(decoded.cells);
  return shape;
}

export const DEFAULT_LAYOUT = encodeShape(buildDefaultShape() as Shape);

export const isGate = (value: number) => value === CELL.GATE || value === CELL.GATE_IN || value === CELL.GATE_OUT;
const isInside = (value: number) => value !== CELL.EMPTY;

export interface LayoutMetrics {
  /** Клеток внутри здания: пол, ворота, стеллажи. */
  footprintCells: number;
  rackCells: number;
  gates: number;
  gatesIn: number;
  gatesOut: number;
  /** Сторона клетки в метрах: контур = площадь склада из паспорта. */
  cellMeters: number;
  /** Площадь всей сетки для сцены, м²: сцена масштабирует сетку по ней. */
  sceneAreaM2: number;
  /** Средний путь погрузчика в одну сторону: от ворот до стеллажа, м. */
  routeLengthM: number;
}

export function layoutMetrics(shape: Shape, areaM2: number): LayoutMetrics {
  let footprintCells = 0;
  let rackCells = 0;
  for (const value of shape.cells) {
    if (isInside(value)) footprintCells += 1;
    if (value === CELL.RACK) rackCells += 1;
  }
  const total = shape.gridSize * shape.gridSize;
  const sceneAreaM2 = footprintCells ? (areaM2 * total) / footprintCells : areaM2;
  const cellMeters = Math.sqrt(sceneAreaM2) / shape.gridSize;
  const clusters = computeGateClusters(shape) as Array<{ kind: string; cells: Array<{ gx: number; gz: number }> }>;

  // Путь по проездам (манхэттенский) от ближайших ворот до каждого места хранения;
  // стеллажей нет — до каждой клетки пола.
  const centers = clusters.map((cluster) => ({
    gx: cluster.cells.reduce((sum, cell) => sum + cell.gx, 0) / cluster.cells.length,
    gz: cluster.cells.reduce((sum, cell) => sum + cell.gz, 0) / cluster.cells.length,
  }));
  const targets = rackCells ? CELL.RACK : CELL.FLOOR;
  let sum = 0;
  let count = 0;
  if (centers.length) {
    for (let gz = 0; gz < shape.gridSize; gz += 1) {
      for (let gx = 0; gx < shape.gridSize; gx += 1) {
        if (shape.cells[gz * shape.gridSize + gx] !== targets) continue;
        sum += Math.min(...centers.map((c) => Math.abs(c.gx - gx) + Math.abs(c.gz - gz)));
        count += 1;
      }
    }
  }
  const routeLengthM = count ? Math.round((sum / count) * cellMeters) : Math.round(Math.sqrt(areaM2) / 2);

  return {
    footprintCells,
    rackCells,
    gates: clusters.length,
    gatesIn: clusters.filter((c) => c.kind === 'in').length,
    gatesOut: clusters.filter((c) => c.kind === 'out').length,
    cellMeters,
    sceneAreaM2: Math.round(sceneAreaM2),
    routeLengthM,
  };
}

/** Параметры расчёта, которые добавляет планировка: сама форма и путь погрузчика. */
export function layoutParameters(layout: string | null, areaM2: number): Record<string, string> {
  // Планировки нет — значит стандартная (прямоугольник с типовыми стеллажами):
  // расчёт и сцена строятся по одному и тому же плану.
  const shape = layoutOrStandard(layout);
  return {
    wh_layout: encodeShape(shape),
    wh_route_length_m: String(layoutMetrics(shape, areaM2).routeLengthM),
  };
}

const numberOf = (text: string | undefined, fallback: number) => {
  const value = Number(String(text ?? '').replace(/\s/g, '').replace(',', '.'));
  return value > 0 ? value : fallback;
};

/** «Общая площадь склада» из паспорта, м². */
export function areaOf(parameters: Record<string, string>): number {
  return numberOf(parameters.wh_obschaya_ploschad_sklada, 20000);
}

/** Ёмкость нарисованных стеллажей по паспорту: высота потолка и габарит паллеты. */
export function rackStorage(shape: Shape, parameters: Record<string, string>): RackStorage | null {
  return rackStorageOf(shape, {
    areaM2: areaOf(parameters),
    ceilingM: numberOf(parameters.wh_vysota_potolkov_zone_hraneniya, 10),
    palletLengthM: numberOf(parameters.wh_pallet_length, 1200) / 1000,
    palletWidthM: numberOf(parameters.wh_pallet_width, 800) / 1000,
    palletHeightM: numberOf(parameters.wh_pallet_height, 1600) / 1000,
  });
}

/** «Количество паллетомест» из паспорта. */
export function palletSlotsOf(parameters: Record<string, string>): number {
  return numberOf(parameters.wh_kolichestvo_palletomest, 20000);
}

/**
 * Стандартная расстановка стеллажей для сценария, если на планировке их нет:
 * у ворот — зона доков, дальше — четыре двойных ряда стеллажей с рабочими проходами
 * и центральным поперечным проездом (к нему выходят конвейеры приёмки и
 * отгрузки), у дальней стены — свободная зона комплектации для роборук и сортера.
 * Четыре ряда покрывают ≥90% паллетомест паспорта по умолчанию (иначе форма
 * сразу показывает предупреждение на пресете «Распределительный центр»).
 * Доли — от сетки, поэтому раскладка одна и та же на любом размере склада.
 */
export function withStandardRacks(
  shape: Shape,
  /** Доли рядов по глубине сетки; по умолчанию 4 двойных ряда. */
  rowFractions: number[] = [0.36, 0.52, 0.68, 0.84],
): Shape {
  if (shape.cells.some((value) => value === CELL.RACK)) return shape;
  const n = shape.gridSize;
  const next = { ...shape, cells: shape.cells.slice() } as Shape;
  // Полоса у ворот — под станцию приёмки (карусель, роборуки, стоянки транспортировщиков).
  const rowPairs = rowFractions.map((f) => Math.round(f * n));
  const cross = Math.floor(n / 2);
  for (const gz of rowPairs.flatMap((z) => [z, z + 1])) {
    for (let gx = 2; gx <= n - 3; gx += 1) {
      if (gx === cross) continue;
      if (next.cells[gz * n + gx] === CELL.FLOOR) next.cells[gz * n + gx] = CELL.RACK;
    }
  }
  return next;
}

/** Стандартная планировка: прямоугольник с воротами и типовой расстановкой стеллажей. */
export function standardLayoutShape(): Shape {
  return withStandardRacks(buildDefaultShape() as Shape);
}

export const STANDARD_LAYOUT = encodeShape(standardLayoutShape());

/** План склада из мастера; не задан — стандартный (то, что показывает конструктор). */
export function layoutOrStandard(layout: string | null | undefined): Shape {
  return decodeShape(layout) ?? standardLayoutShape();
}

/** Типовая расстановка стеллажей на текущем контуре: прежние стеллажи убираются. */
export function typicalRacks(shape: Shape): Shape {
  const cleared = { ...shape, cells: shape.cells.map((v) => (v === CELL.RACK ? CELL.FLOOR : v)) } as Shape;
  return withStandardRacks(cleared);
}

// ─── Примеры складов для конструктора ──────────────────────────────────────
// Типичные планировки на той же сетке 25 × 25: контур, ворота выгрузки и
// загрузки, ряды двойных стеллажей с проходами. Пользователь берёт пример и
// правит под себя; сцена и расчёт строят ровно нарисованное.

export interface WarehousePreset {
  id: string;
  title: string;
  /** Что это за склад — одной фразой. */
  description: string;
  /** Что покажет симуляция на этой планировке. */
  shows: string;
  build: () => Shape;
}

type Rect = [x0: number, z0: number, x1: number, z1: number];

function presetShape(floor: Rect[], gates: Array<{ cell: number; cells: Array<[number, number]> }>, racks: Rect[], gaps: number[] = []): Shape {
  const shape = makeEmptyShape(GRID_SIZE) as Shape;
  const n = shape.gridSize;
  const fill = ([x0, z0, x1, z1]: Rect, value: number, skip: (gx: number) => boolean = () => false) => {
    for (let gz = z0; gz <= z1; gz += 1) {
      for (let gx = x0; gx <= x1; gx += 1) if (!skip(gx)) shape.cells[gz * n + gx] = value;
    }
  };
  for (const rect of floor) fill(rect, CELL.FLOOR);
  for (const rect of racks) fill(rect, CELL.RACK, (gx) => gaps.includes(gx));
  for (const gate of gates) for (const [gx, gz] of gate.cells) shape.cells[gz * n + gx] = gate.cell;
  return shape;
}

// Ворота шириной в три клетки вдоль стены: по x на строке z или по z на столбце x.
const gateX = (cell: number, z: number, ...starts: number[]) =>
  starts.map((x) => ({ cell, cells: [x, x + 1, x + 2].map((gx) => [gx, z] as [number, number]) }));
const gateZ = (cell: number, x: number, ...starts: number[]) =>
  starts.map((z) => ({ cell, cells: [z, z + 1, z + 2].map((gz) => [x, gz] as [number, number]) }));
// Двойные ряды стеллажей вдоль x: строки z и z+1.
const rows = (x0: number, x1: number, ...zs: number[]): Rect[] => zs.map((z) => [x0, z, x1, z + 1]);

/** Пресет по умолчанию на шаге «Планировка» — всегда выбран, пока пользователь не сменит. */
export const DEFAULT_WAREHOUSE_PRESET_ID = 'dc';

export const WAREHOUSE_PRESETS: WarehousePreset[] = [
  {
    id: 'dc',
    title: 'Распределительный центр',
    description: 'Пять двусторонних ворот на одной стене, четыре двойных ряда стеллажей, зона приёмки у ворот.',
    shows: 'Полный цикл: фуры, груз у ворот, погрузчики и AMR до стеллажей и обратно.',
    build: standardLayoutShape,
  },
  {
    id: 'crossdock',
    title: 'Кросс-док',
    description: 'Выгрузка с одной стороны, загрузка с противоположной, хранения почти нет — груз идёт насквозь.',
    shows: 'Сквозной поток: паллеты из фуры почти сразу уходят в другую фуру через буферный ряд.',
    build: () =>
      presetShape(
        [[0, 4, 24, 20]],
        [...gateX(CELL.GATE_IN, 4, 2, 8, 14, 20), ...gateX(CELL.GATE_OUT, 20, 2, 8, 14, 20)],
        rows(4, 20, 11),
        [12],
      ),
  },
  {
    id: 'l-shape',
    title: 'Г-образный склад',
    description: 'Два крыла: приёмка в верхнем, отгрузка в нижнем, стеллажи в обоих.',
    shows: 'Длинные маршруты с поворотом: видно, как планировщик разводит роботов в узком месте.',
    build: () =>
      presetShape(
        [
          [0, 0, 24, 11],
          [0, 12, 11, 24],
        ],
        [...gateX(CELL.GATE_IN, 0, 3, 9, 15), ...gateX(CELL.GATE_OUT, 24, 2, 7)],
        [...rows(14, 22, 5, 8), ...rows(2, 9, 14, 17)],
      ),
  },
  {
    id: 'narrow',
    title: 'Узкий длинный склад',
    description: 'Ворота вдоль длинной стены, два длинных ряда стеллажей с поперечными проездами.',
    shows: 'Плотное движение в одном проезде: роботы ждут друг друга по расписанию, а не сталкиваются.',
    build: () =>
      presetShape(
        [[0, 6, 24, 18]],
        [...gateX(CELL.GATE_IN, 6, 2, 7), ...gateX(CELL.GATE_OUT, 6, 15, 20)],
        rows(2, 22, 12, 16),
        [8, 16],
      ),
  },
  {
    id: 'storage',
    title: 'Высотное хранение',
    description: 'Пять двойных рядов стеллажей, узкие проходы, двое ворот приёмки и двое отгрузки.',
    shows: 'Максимум паллетомест: погрузчики у стеллажей заняты сильнее всех — узкое место видно в «Заданиях».',
    build: () =>
      presetShape(
        [[0, 0, 24, 24]],
        [...gateX(CELL.GATE_IN, 0, 3, 8), ...gateX(CELL.GATE_OUT, 0, 14, 19)],
        rows(2, 22, 6, 10, 14, 18, 22),
        [12],
      ),
  },
  {
    id: 'fulfillment',
    title: 'Фулфилмент e-commerce',
    description: 'Приёмка с запада, отгрузка с востока, стеллажи в верхней половине, внизу — зона отбора.',
    shows: 'Станция отбора у глухой стены: роборуки разбирают паллеты по коробкам, лента уходит в стену.',
    build: () =>
      presetShape(
        [[0, 0, 24, 24]],
        [...gateZ(CELL.GATE_IN, 0, 3, 9), ...gateZ(CELL.GATE_OUT, 24, 3, 9)],
        rows(5, 19, 4, 8, 12),
        [12],
      ),
  },
];

/** Пример, с которым совпадает планировка (или null — своя). */
export function presetOf(shape: Shape): WarehousePreset | null {
  const code = encodeShape(shape);
  return WAREHOUSE_PRESETS.find((preset) => encodeShape(preset.build()) === code) ?? null;
}

/** Форма пресета по умолчанию (распределительный центр). */
export function defaultWarehousePresetShape(): Shape {
  const preset =
    WAREHOUSE_PRESETS.find((item) => item.id === DEFAULT_WAREHOUSE_PRESET_ID) ?? WAREHOUSE_PRESETS[0]!;
  return preset.build();
}
