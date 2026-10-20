/**
 * Геометрия в метрах → Shape 25×25: FLOOR внутри контура, RACK/ворота по снапу.
 */

import { CELL, CELL_SIZE, GRID_SIZE, makeEmptyShape, setCellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import type { Shape } from '@/features/objects/layout/warehouseLayout';
import type { GateCandidate, RackFootprint, Segment, WarehouseSemantics } from './semantics';
import type { DxfPoint } from './parseDxf';

export type RasterResult = {
  shape: Shape;
  /** Метры → клетка (для эвристик ворот). */
  worldToCell: (x: number, y: number) => { gx: number; gz: number } | null;
  cellToWorld: (gx: number, gz: number) => { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

function pointInPoly(x: number, y: number, poly: DxfPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Ячейки, которые пересекает отрезок (суперпокрытие по сэмплам). */
function stampSegment(mask: Uint8Array, n: number, toCell: (x: number, y: number) => { gx: number; gz: number } | null, seg: Segment) {
  const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  const steps = Math.max(2, Math.ceil(len * 4)); // плотнее, чем клетка
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = seg.a.x + (seg.b.x - seg.a.x) * t;
    const y = seg.a.y + (seg.b.y - seg.a.y) * t;
    const cell = toCell(x, y);
    if (!cell) continue;
    mask[cell.gz * n + cell.gx] = 1;
  }
}

function floodExterior(wall: Uint8Array, n: number): Uint8Array {
  const exterior = new Uint8Array(n * n);
  const stack: number[] = [];
  const push = (gx: number, gz: number) => {
    if (gx < 0 || gz < 0 || gx >= n || gz >= n) return;
    const idx = gz * n + gx;
    if (exterior[idx] || wall[idx]) return;
    exterior[idx] = 1;
    stack.push(idx);
  };
  for (let i = 0; i < n; i += 1) {
    push(i, 0);
    push(i, n - 1);
    push(0, i);
    push(n - 1, i);
  }
  while (stack.length) {
    const idx = stack.pop()!;
    const gx = idx % n;
    const gz = (idx / n) | 0;
    push(gx + 1, gz);
    push(gx - 1, gz);
    push(gx, gz + 1);
    push(gx, gz - 1);
  }
  return exterior;
}

function fillFloorFromMask(shape: Shape, wall: Uint8Array, usePoly: DxfPoint[] | null, cellCenter: (gx: number, gz: number) => DxfPoint) {
  const n = shape.gridSize;
  if (usePoly && usePoly.length >= 3) {
    for (let gz = 0; gz < n; gz += 1) {
      for (let gx = 0; gx < n; gx += 1) {
        const c = cellCenter(gx, gz);
        if (pointInPoly(c.x, c.y, usePoly)) setCellAt(shape, gx, gz, CELL.FLOOR);
      }
    }
    return;
  }

  const exterior = floodExterior(wall, n);
  for (let gz = 0; gz < n; gz += 1) {
    for (let gx = 0; gx < n; gx += 1) {
      const idx = gz * n + gx;
      if (!exterior[idx]) setCellAt(shape, gx, gz, CELL.FLOOR);
    }
  }
}

function stampRack(shape: Shape, rack: RackFootprint, toCell: RasterResult['worldToCell']) {
  const corners = [
    toCell(rack.minX, rack.minY),
    toCell(rack.maxX, rack.minY),
    toCell(rack.maxX, rack.maxY),
    toCell(rack.minX, rack.maxY),
  ].filter(Boolean) as Array<{ gx: number; gz: number }>;
  if (!corners.length) return;
  const minGx = Math.min(...corners.map((c) => c.gx));
  const maxGx = Math.max(...corners.map((c) => c.gx));
  const minGz = Math.min(...corners.map((c) => c.gz));
  const maxGz = Math.max(...corners.map((c) => c.gz));
  for (let gz = minGz; gz <= maxGz; gz += 1) {
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      if (shape.cells[gz * shape.gridSize + gx] === CELL.EMPTY) continue;
      setCellAt(shape, gx, gz, CELL.RACK);
    }
  }
}

/**
 * Сначала снап как на чертеже (пары слева/справа на одном gz).
 * Если соседние ряды схлопнулись без проезда — прорежаем через один.
 */
function stampRacksWithAisles(shape: Shape, racks: RackFootprint[], toCell: RasterResult['worldToCell']) {
  if (!racks.length) return;
  for (const rack of racks) stampRack(shape, rack, toCell);

  const n = shape.gridSize;
  const rowHasRack = (gz: number) => {
    for (let gx = 0; gx < n; gx += 1) if (shape.cells[gz * n + gx] === CELL.RACK) return true;
    return false;
  };
  const rackRows: number[] = [];
  for (let gz = 0; gz < n; gz += 1) if (rowHasRack(gz)) rackRows.push(gz);

  // Сплошные серии рядов без проезда: R F R F… (не вычищаем всё подряд).
  let runStart = 0;
  while (runStart < rackRows.length) {
    let runEnd = runStart;
    while (runEnd + 1 < rackRows.length && rackRows[runEnd + 1] === rackRows[runEnd]! + 1) runEnd += 1;
    if (runEnd > runStart) {
      for (let i = runStart + 1; i <= runEnd; i += 2) {
        const gz = rackRows[i]!;
        for (let gx = 0; gx < n; gx += 1) {
          if (shape.cells[gz * n + gx] === CELL.RACK) setCellAt(shape, gx, gz, CELL.FLOOR);
        }
      }
    }
    runStart = runEnd + 1;
  }
}

function nearestFloorOnContour(shape: Shape, gx: number, gz: number): { gx: number; gz: number } | null {
  const n = shape.gridSize;
  const isInside = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && shape.cells[z * n + x] !== CELL.EMPTY;
  const onContour = (x: number, z: number) =>
    isInside(x, z) && (!isInside(x + 1, z) || !isInside(x - 1, z) || !isInside(x, z + 1) || !isInside(x, z - 1));

  if (onContour(gx, gz)) return { gx, gz };

  let best: { gx: number; gz: number } | null = null;
  let bestD = Infinity;
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!onContour(x, z)) continue;
      const d = Math.abs(x - gx) + Math.abs(z - gz);
      if (d < bestD) {
        bestD = d;
        best = { gx: x, gz: z };
      }
    }
  }
  return best;
}

function stampGate(shape: Shape, gate: GateCandidate, toCell: RasterResult['worldToCell'], cellMetersApprox: number) {
  const cell = toCell(gate.position.x, gate.position.y);
  if (!cell) return;
  const anchor = nearestFloorOnContour(shape, cell.gx, cell.gz);
  if (!anchor) return;

  const widthCells = Math.max(1, Math.round(gate.widthM / Math.max(cellMetersApprox, 0.5)));
  const value = gate.kind === 'in' ? CELL.GATE_IN : gate.kind === 'out' ? CELL.GATE_OUT : CELL.GATE_IN;

  // Растягиваем вдоль той стороны контура, где больше соседей EMPTY.
  const n = shape.gridSize;
  const empty = (x: number, z: number) => x < 0 || z < 0 || x >= n || z >= n || shape.cells[z * n + x] === CELL.EMPTY;
  const north = empty(anchor.gx, anchor.gz - 1);
  const south = empty(anchor.gx, anchor.gz + 1);
  const west = empty(anchor.gx - 1, anchor.gz);
  const east = empty(anchor.gx + 1, anchor.gz);

  const horizontal = north || south;
  const half = Math.floor((widthCells - 1) / 2);
  if (horizontal) {
    for (let dx = -half; dx <= half + (widthCells % 2 === 0 ? 1 : 0); dx += 1) {
      const gx = anchor.gx + dx;
      if (gx < 0 || gx >= n) continue;
      if (shape.cells[anchor.gz * n + gx] === CELL.EMPTY) continue;
      setCellAt(shape, gx, anchor.gz, value);
    }
  } else if (west || east) {
    for (let dz = -half; dz <= half + (widthCells % 2 === 0 ? 1 : 0); dz += 1) {
      const gz = anchor.gz + dz;
      if (gz < 0 || gz >= n) continue;
      if (shape.cells[gz * n + anchor.gx] === CELL.EMPTY) continue;
      setCellAt(shape, anchor.gx, gz, value);
    }
  } else {
    setCellAt(shape, anchor.gx, anchor.gz, value);
  }
}

export function rasterizeSemantics(sem: WarehouseSemantics): RasterResult {
  const n = GRID_SIZE;
  const shape = makeEmptyShape(n) as Shape;
  // cellSize остаётся сценовым константным (CELL_SIZE), метры — из паспорта позже.
  shape.cellSize = CELL_SIZE;

  let bounds = sem.bounds;
  if (!bounds) {
    // Пустой чертёж — минимальный прямоугольник в центре.
    bounds = { minX: 0, minY: 0, maxX: 25, maxY: 25 };
  }

  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  // Поле EMPTY в 1 клетку по краю, если влезает.
  const pad = 1;
  const usable = n - pad * 2;
  const scale = Math.min(usable / width, usable / height);
  const offsetX = pad + (usable - width * scale) / 2;
  const offsetY = pad + (usable - height * scale) / 2;

  // DXF Y-up → сетка gz вниз (как canvas редактора).
  const worldToCell = (x: number, y: number): { gx: number; gz: number } | null => {
    const gx = Math.floor(offsetX + (x - bounds!.minX) * scale);
    const gz = Math.floor(offsetY + (bounds!.maxY - y) * scale);
    if (gx < 0 || gz < 0 || gx >= n || gz >= n) return null;
    return { gx, gz };
  };

  const cellToWorld = (gx: number, gz: number) => ({
    x: bounds!.minX + (gx + 0.5 - offsetX) / scale,
    y: bounds!.maxY - (gz + 0.5 - offsetY) / scale,
  });

  const wall = new Uint8Array(n * n);
  for (const seg of sem.segments) stampSegment(wall, n, worldToCell, seg);

  fillFloorFromMask(shape, wall, sem.areaPolygon, (gx, gz) => cellToWorld(gx, gz));

  // Если flood/poly ничего не дали — заполним bbox.
  if (![...shape.cells].some((v) => v !== CELL.EMPTY)) {
    for (let gz = pad; gz < n - pad; gz += 1) {
      for (let gx = pad; gx < n - pad; gx += 1) setCellAt(shape, gx, gz, CELL.FLOOR);
    }
  }

  const metersPerCell = 1 / scale;

  stampRacksWithAisles(shape, sem.racks, worldToCell);
  for (const gate of sem.gates) stampGate(shape, gate, worldToCell, metersPerCell);

  return { shape, worldToCell, cellToWorld, bounds };
}
