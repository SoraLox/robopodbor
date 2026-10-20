/**
 * Дозаполнение того, чего нет на чертеже: ворота на контуре и типовые стеллажи.
 */

import { CELL, cellAt, setCellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { computeGateClusters } from '@/upstream/simulation/shape/shapeGeometry.js';
import { withStandardRacks, type Shape } from '@/features/objects/layout/warehouseLayout';

function isInside(shape: Shape, gx: number, gz: number): boolean {
  return cellAt(shape, gx, gz) !== CELL.EMPTY;
}

function onContour(shape: Shape, gx: number, gz: number): boolean {
  if (!isInside(shape, gx, gz)) return false;
  return (
    !isInside(shape, gx + 1, gz) ||
    !isInside(shape, gx - 1, gz) ||
    !isInside(shape, gx, gz + 1) ||
    !isInside(shape, gx, gz - 1)
  );
}

type Side = 'north' | 'south' | 'west' | 'east';

function sideLengths(shape: Shape): Record<Side, number> {
  const n = shape.gridSize;
  const counts: Record<Side, number> = { north: 0, south: 0, west: 0, east: 0 };
  for (let gz = 0; gz < n; gz += 1) {
    for (let gx = 0; gx < n; gx += 1) {
      if (!onContour(shape, gx, gz)) continue;
      if (!isInside(shape, gx, gz - 1)) counts.north += 1;
      if (!isInside(shape, gx, gz + 1)) counts.south += 1;
      if (!isInside(shape, gx - 1, gz)) counts.west += 1;
      if (!isInside(shape, gx + 1, gz)) counts.east += 1;
    }
  }
  return counts;
}

/** along: mid — середина стороны; start — север/западный край; end — юг/восток. */
function placeGateCluster(
  shape: Shape,
  side: Side,
  value: number,
  width = 3,
  along: 'start' | 'mid' | 'end' = 'mid',
) {
  const n = shape.gridSize;
  const cells: Array<{ gx: number; gz: number }> = [];
  for (let gz = 0; gz < n; gz += 1) {
    for (let gx = 0; gx < n; gx += 1) {
      if (!onContour(shape, gx, gz)) continue;
      const exposed =
        (side === 'north' && !isInside(shape, gx, gz - 1)) ||
        (side === 'south' && !isInside(shape, gx, gz + 1)) ||
        (side === 'west' && !isInside(shape, gx - 1, gz)) ||
        (side === 'east' && !isInside(shape, gx + 1, gz));
      if (exposed) cells.push({ gx, gz });
    }
  }
  if (!cells.length) return;

  const pickStart = (len: number) => {
    if (along === 'start') return 0;
    if (along === 'end') return Math.max(0, len - width);
    return Math.max(0, Math.floor(len / 2) - Math.floor(width / 2));
  };

  if (side === 'north' || side === 'south') {
    cells.sort((a, b) => a.gz - b.gz || a.gx - b.gx);
    const keyGz = along === 'end' ? cells[cells.length - 1]!.gz : along === 'start' ? cells[0]!.gz : cells[Math.floor(cells.length / 2)]!.gz;
    // Для north/south «start» = запад (меньший gx).
    const row = cells.filter((c) => c.gz === keyGz).sort((a, b) => a.gx - b.gx);
    const start = pickStart(row.length);
    for (let i = start; i < Math.min(row.length, start + width); i += 1) {
      const c = row[i]!;
      if (cellAt(shape, c.gx, c.gz) === CELL.RACK) setCellAt(shape, c.gx, c.gz, CELL.FLOOR);
      setCellAt(shape, c.gx, c.gz, value);
    }
  } else {
    // west/east: сортируем по gz; start = север (меньший gz) — «сверху» на превью.
    cells.sort((a, b) => a.gx - b.gx || a.gz - b.gz);
    const keyGx = along === 'end' ? cells[cells.length - 1]!.gx : along === 'start' ? cells[0]!.gx : cells[Math.floor(cells.length / 2)]!.gx;
    // На восточном крыле берём самый восточный столбец контура.
    const eastMost = Math.max(...cells.map((c) => c.gx));
    const westMost = Math.min(...cells.map((c) => c.gx));
    const colGx = side === 'east' ? eastMost : side === 'west' ? westMost : keyGx;
    const col = cells.filter((c) => c.gx === colGx).sort((a, b) => a.gz - b.gz);
    const start = pickStart(col.length);
    for (let i = start; i < Math.min(col.length, start + width); i += 1) {
      const c = col[i]!;
      if (cellAt(shape, c.gx, c.gz) === CELL.RACK) setCellAt(shape, c.gx, c.gz, CELL.FLOOR);
      setCellAt(shape, c.gx, c.gz, value);
    }
  }
}

function opposite(side: Side): Side {
  if (side === 'north') return 'south';
  if (side === 'south') return 'north';
  if (side === 'west') return 'east';
  return 'west';
}

function longestSide(counts: Record<Side, number>): Side {
  let best: Side = 'north';
  let bestN = -1;
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    if (counts[side] > bestN) {
      bestN = counts[side];
      best = side;
    }
  }
  return best;
}

function hasValidGates(shape: Shape): boolean {
  return (computeGateClusters(shape) as unknown[]).length > 0;
}

function hasRacks(shape: Shape): boolean {
  return shape.cells.some((v) => v === CELL.RACK);
}

function onlyInGates(shape: Shape): boolean {
  const clusters = computeGateClusters(shape) as Array<{ kind: string }>;
  if (!clusters.length) return false;
  return clusters.every((c) => c.kind === 'in') && !clusters.some((c) => c.kind === 'out' || c.kind === 'generic');
}

/** Сторона контура, где стоят GATE_IN (по экспозиции кластера). */
function inGateSide(shape: Shape): Side | null {
  const clusters = computeGateClusters(shape) as Array<{ kind: string; cells: Array<{ gx: number; gz: number }> }>;
  const ins = clusters.filter((c) => c.kind === 'in');
  if (!ins.length) return null;
  const counts: Record<Side, number> = { north: 0, south: 0, west: 0, east: 0 };
  for (const cluster of ins) {
    for (const cell of cluster.cells) {
      if (!isInside(shape, cell.gx, cell.gz - 1)) counts.north += 1;
      if (!isInside(shape, cell.gx, cell.gz + 1)) counts.south += 1;
      if (!isInside(shape, cell.gx - 1, cell.gz)) counts.west += 1;
      if (!isInside(shape, cell.gx + 1, cell.gz)) counts.east += 1;
    }
  }
  return longestSide(counts);
}

/** Много доков на одной стороне — типичный погрузочный фасад. */
function isDockFacade(shape: Shape): boolean {
  const clusters = computeGateClusters(shape) as Array<{ kind: string }>;
  return clusters.filter((c) => c.kind === 'in').length >= 3;
}

/** Прямоугольник → ворота на коротких торцах; L с крылом → слева и на крыле. */
function pickAutoGatePlacement(shape: Shape): {
  inSide: Side;
  outSide: Side;
  inAlong: 'start' | 'mid' | 'end';
  outAlong: 'start' | 'mid' | 'end';
  label: string;
} {
  const n = shape.gridSize;
  let minGx = n;
  let maxGx = -1;
  let minGz = n;
  let maxGz = -1;
  let inside = 0;
  for (let gz = 0; gz < n; gz += 1) {
    for (let gx = 0; gx < n; gx += 1) {
      if (!isInside(shape, gx, gz)) continue;
      inside += 1;
      minGx = Math.min(minGx, gx);
      maxGx = Math.max(maxGx, gx);
      minGz = Math.min(minGz, gz);
      maxGz = Math.max(maxGz, gz);
    }
  }
  if (inside === 0 || maxGx < minGx) {
    return { inSide: 'north', outSide: 'south', inAlong: 'mid', outAlong: 'mid', label: 'Ворота сверху и снизу.' };
  }

  const bbox = (maxGx - minGx + 1) * (maxGz - minGz + 1);
  const fill = inside / bbox;
  const midGz = (minGz + maxGz) / 2;
  let northEast = 0;
  let southEast = 0;
  for (let gz = minGz; gz <= maxGz; gz += 1) {
    if (!isInside(shape, maxGx, gz)) continue;
    if (gz <= midGz) northEast += 1;
    else southEast += 1;
  }
  const hasEastWing = fill < 0.88 && southEast >= northEast + 2;

  if (hasEastWing) {
    return {
      inSide: 'west',
      outSide: 'east',
      inAlong: 'mid',
      outAlong: 'start',
      label: 'Ворота: выгрузка слева, загрузка справа сверху.',
    };
  }

  const tall = maxGz - minGz >= maxGx - minGx;
  if (tall) {
    return { inSide: 'north', outSide: 'south', inAlong: 'mid', outAlong: 'mid', label: 'Ворота сверху и снизу.' };
  }
  return { inSide: 'west', outSide: 'east', inAlong: 'mid', outAlong: 'mid', label: 'Ворота слева и справа.' };
}

/**
 * Гарантирует: ≥1 валидный кластер ворот и стеллажи (типовые, если на чертеже не было).
 */
export function applyHeuristics(shape: Shape): { shape: Shape; warnings: string[] } {
  const warnings: string[] = [];
  let next = { ...shape, cells: shape.cells.slice() } as Shape;

  if (!hasValidGates(next)) {
    const place = pickAutoGatePlacement(next);
    placeGateCluster(next, place.inSide, CELL.GATE_IN, 3, place.inAlong);
    placeGateCluster(next, place.outSide, CELL.GATE_OUT, 3, place.outAlong);
    if (!hasValidGates(next)) {
      const primary = longestSide(sideLengths(next));
      placeGateCluster(next, primary, CELL.GATE_IN, 3, 'mid');
      placeGateCluster(next, opposite(primary), CELL.GATE_OUT, 3, 'mid');
    }
    warnings.push(place.label);
  } else if (onlyInGates(next)) {
    // Напротив доков: снизу слева (south+start), не на боковой стене.
    const dockSide = inGateSide(next) ?? 'north';
    const outSide = opposite(dockSide);
    const outAlong: 'start' | 'mid' | 'end' = outSide === 'south' || outSide === 'north' ? 'start' : 'mid';
    placeGateCluster(next, outSide, CELL.GATE_OUT, 3, outAlong);
    if (onlyInGates(next)) {
      placeGateCluster(next, 'south', CELL.GATE_OUT, 3, 'start');
    }
    warnings.push(
      outSide === 'south' ? 'Ворота загрузки снизу слева.' : 'Добавлены ворота загрузки на противоположной стороне.',
    );
  }

  if (!hasRacks(next)) {
    // У докового фасада не ставим нижний ряд — оставляем апрон у южной стены.
    const dock = isDockFacade(next);
    next = dock ? withStandardRacks(next, [0.36, 0.52, 0.68]) : withStandardRacks(next);
    warnings.push(dock ? 'Стеллажи без нижнего ряда у докового апрона.' : 'Стеллажи расставлены типово.');
  }

  // Финальная страховка: если ворот всё ещё нет (вырожденный контур) — весь северный ряд.
  if (!hasValidGates(next)) {
    const n = next.gridSize;
    for (let gx = 2; gx <= Math.min(4, n - 1); gx += 1) {
      for (let gz = 0; gz < n; gz += 1) {
        if (isInside(next, gx, gz) && onContour(next, gx, gz) && !isInside(next, gx, gz - 1)) {
          setCellAt(next, gx, gz, CELL.GATE_IN);
        }
      }
    }
    // Проще: найти любую contour-клетку
    for (let gz = 0; gz < n && !hasValidGates(next); gz += 1) {
      for (let gx = 0; gx < n; gx += 1) {
        if (onContour(next, gx, gz)) {
          setCellAt(next, gx, gz, CELL.GATE_IN);
          if (hasValidGates(next)) break;
        }
      }
    }
  }

  return { shape: next, warnings };
}
