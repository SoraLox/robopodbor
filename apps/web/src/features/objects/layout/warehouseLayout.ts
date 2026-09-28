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

export interface Shape {
  gridSize: number;
  cellSize: number;
  cells: Uint8Array;
}

const LETTER_OF: Record<number, string> = {
  [CELL.EMPTY]: 'E',
  [CELL.FLOOR]: 'F',
  [CELL.GATE]: 'G',
  [CELL.RACK]: 'R',
  [CELL.GATE_IN]: 'I',
  [CELL.GATE_OUT]: 'O',
};
const VALUE_OF: Record<string, number> = Object.fromEntries(
  Object.entries(LETTER_OF).map(([value, letter]) => [letter, Number(value)]),
);

/** «25:F1G3F2…» — размер сетки и серии клеток (буква + сколько подряд). */
export function encodeShape(shape: Shape): string {
  let out = `${shape.gridSize}:`;
  let run = 0;
  for (let i = 0; i < shape.cells.length; i += 1) {
    run += 1;
    if (shape.cells[i + 1] !== shape.cells[i] || i === shape.cells.length - 1) {
      out += `${LETTER_OF[shape.cells[i]!] ?? 'E'}${run}`;
      run = 0;
    }
  }
  return out;
}

export function decodeShape(text: string | null | undefined): Shape | null {
  const match = text?.match(/^(\d+):((?:[EFGRIO]\d+)+)$/);
  if (!match) return null;
  const gridSize = Number(match[1]);
  if (gridSize !== GRID_SIZE) return null;
  const shape = makeEmptyShape(gridSize) as Shape;
  let index = 0;
  for (const [, letter, count] of match[2]!.matchAll(/([EFGRIO])(\d+)/g)) {
    const value = VALUE_OF[letter!]!;
    const end = Math.min(shape.cells.length, index + Number(count));
    shape.cells.fill(value, index, end);
    index = end;
  }
  return index === shape.cells.length ? shape : null;
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

/** «Общая площадь склада» из паспорта, м². */
export function areaOf(parameters: Record<string, string>): number {
  const value = Number(String(parameters.wh_obschaya_ploschad_sklada ?? '').replace(/\s/g, '').replace(',', '.'));
  return value > 0 ? value : 20000;
}
