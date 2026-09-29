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
  const shape = decodeShape(layout);
  if (!shape || layout === DEFAULT_LAYOUT) return {};
  return {
    wh_layout: layout!,
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
 * у ворот — зона доков, дальше — три ряда двойных стеллажей с рабочими проходами
 * и центральным поперечным проездом (к нему выходят конвейеры приёмки и
 * отгрузки), у дальней стены — свободная зона комплектации для роборук и сортера.
 * Доли — от сетки, поэтому раскладка одна и та же на любом размере склада.
 */
export function withStandardRacks(shape: Shape): Shape {
  if (shape.cells.some((value) => value === CELL.RACK)) return shape;
  const n = shape.gridSize;
  const next = { ...shape, cells: shape.cells.slice() } as Shape;
  // Полоса у ворот — под станцию приёмки (карусель, роборуки, стоянки транспортировщиков).
  const rowPairs = [0.36, 0.52, 0.68].map((f) => Math.round(f * n));
  const cross = Math.floor(n / 2);
  for (const gz of rowPairs.flatMap((z) => [z, z + 1])) {
    for (let gx = 2; gx <= n - 3; gx += 1) {
      if (gx === cross) continue;
      if (next.cells[gz * n + gx] === CELL.FLOOR) next.cells[gz * n + gx] = CELL.RACK;
    }
  }
  return next;
}
