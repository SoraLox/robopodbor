import { describe, expect, it } from 'vitest';
import { CELL, buildDefaultShape, setCellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { cellCenter, cellOfPoint, findPath, isWalkable, makeNavGrid } from '@/upstream/simulation/loaders/gridPath.js';

/** Каждая точка пути и отрезки между ними — только по проезжим клеткам. */
function pathIsClear(nav: ReturnType<typeof makeNavGrid>, from: { x: number; z: number }, points: Array<{ x: number; z: number }>) {
  let prev = from;
  for (const p of points) {
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const cell = cellOfPoint(nav, { x: prev.x + (p.x - prev.x) * t, z: prev.z + (p.z - prev.z) * t });
      if (!isWalkable(nav, cell.gx, cell.gz)) return false;
    }
    prev = p;
  }
  return true;
}

describe('путь погрузчика на своей форме склада', () => {
  it('объезжает два стеллажа подряд, а не проезжает сквозь второй', () => {
    const shape = buildDefaultShape();
    // Две стенки стеллажей поперёк прямой ворота → цель, со смещёнными проходами.
    for (let gx = 0; gx < 20; gx += 1) setCellAt(shape, gx, 6, CELL.RACK);
    for (let gx = 5; gx < 25; gx += 1) setCellAt(shape, gx, 12, CELL.RACK);
    const nav = makeNavGrid(shape);
    const from = cellCenter(nav, 2, 1);
    const to = cellCenter(nav, 2, 20);
    const path = findPath(nav, from, to);
    expect(path.at(-1)).toEqual(to);
    expect(pathIsClear(nav, from, path)).toBe(true);
    // Обходит через проходы: сначала справа (gx ≥ 20), потом слева (gx < 5).
    expect(path.some((p: { x: number; z: number }) => cellOfPoint(nav, p).gx >= 20)).toBe(true);
  });

  it('не выходит за контур Г-образного склада', () => {
    const shape = buildDefaultShape();
    for (let gz = 0; gz < 14; gz += 1) for (let gx = 12; gx < 25; gx += 1) setCellAt(shape, gx, gz, CELL.EMPTY);
    const nav = makeNavGrid(shape);
    const from = cellCenter(nav, 2, 2);
    const to = cellCenter(nav, 22, 20);
    const path = findPath(nav, from, to);
    expect(pathIsClear(nav, from, path)).toBe(true);
  });
});
