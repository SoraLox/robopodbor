/**
 * Планировка склада из конструктора (шаг мастера «Планировка»): строка вида
 * «25:F1G3F2…» — размер сетки и серии клеток (буква + сколько подряд). Коды
 * клеток совпадают с simulation/shape/shapeTypes.js (CELL). Модуль без
 * зависимостей: форму читают и расчёт экономики, и фронтенд.
 *
 * Нарисованный контур — весь склад из паспорта: пол, ворота и стеллажи вместе
 * равны «Общей площади склада», отсюда площадь одной клетки.
 */

export const LAYOUT_CELL = { EMPTY: 0, FLOOR: 1, GATE: 2, RACK: 3, GATE_IN: 4, GATE_OUT: 5 } as const;

const LETTER_OF: Record<number, string> = { 0: "E", 1: "F", 2: "G", 3: "R", 4: "I", 5: "O" };
const VALUE_OF: Record<string, number> = { E: 0, F: 1, G: 2, R: 3, I: 4, O: 5 };

export function encodeLayoutCells(gridSize: number, cells: ArrayLike<number>): string {
  let out = `${gridSize}:`;
  let run = 0;
  for (let i = 0; i < cells.length; i += 1) {
    run += 1;
    if (cells[i + 1] !== cells[i] || i === cells.length - 1) {
      out += `${LETTER_OF[cells[i]!] ?? "E"}${run}`;
      run = 0;
    }
  }
  return out;
}

export function decodeLayoutCells(text: string | null | undefined): { gridSize: number; cells: Uint8Array } | null {
  const match = text?.match(/^(\d+):((?:[EFGRIO]\d+)+)$/);
  if (!match) return null;
  const gridSize = Number(match[1]);
  if (!(gridSize > 0 && gridSize <= 100)) return null;
  const cells = new Uint8Array(gridSize * gridSize);
  let index = 0;
  for (const [, letter, count] of match[2]!.matchAll(/([EFGRIO])(\d+)/g)) {
    const end = Math.min(cells.length, index + Number(count));
    cells.fill(VALUE_OF[letter!]!, index, end);
    index = end;
  }
  return index === cells.length ? { gridSize, cells } : null;
}

/** Зазор вокруг паллеты в ячейке стеллажа и над ней, м — отраслевая норма для фронтальных стеллажей. */
export const RACK_CLEARANCE_M = 0.1;
export const RACK_LEVEL_GAP_M = 0.2;

export interface RackStorage {
  rackAreaM2: number;
  levels: number;
  /** Паллетомест на м² площади стеллажа в одном ярусе. */
  perLevelPerM2: number;
  pallets: number;
}

/**
 * Ёмкость нарисованных стеллажей: площадь стеллажей × паллет на м² ×
 * ярусы по высоте потолка. null — стеллажи не нарисованы.
 */
export function rackStorageOf(
  layout: { gridSize: number; cells: ArrayLike<number> },
  input: { areaM2: number; ceilingM: number; palletLengthM: number; palletWidthM: number; palletHeightM: number },
): RackStorage | null {
  let inside = 0;
  let racks = 0;
  for (let i = 0; i < layout.cells.length; i += 1) {
    if (layout.cells[i] !== LAYOUT_CELL.EMPTY) inside += 1;
    if (layout.cells[i] === LAYOUT_CELL.RACK) racks += 1;
  }
  if (!racks || !inside) return null;
  const rackAreaM2 = (input.areaM2 * racks) / inside;
  const perLevelPerM2 =
    1 / ((input.palletLengthM + RACK_CLEARANCE_M) * (input.palletWidthM + RACK_CLEARANCE_M));
  const levels = Math.max(1, Math.floor(input.ceilingM / (input.palletHeightM + RACK_LEVEL_GAP_M)));
  return { rackAreaM2, levels, perLevelPerM2, pallets: Math.floor(rackAreaM2 * perLevelPerM2 * levels) };
}
