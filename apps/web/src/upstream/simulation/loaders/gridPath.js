import { FLOOR } from "../floorConstants.js";
import { CELL, cellAt, cellWorldOrigin } from "../shape/shapeTypes.js";

// Навигация погрузчиков по своей форме склада: сетка клеток конструктора,
// проезжие — пол и ворота, стеллажи и всё снаружи контура — нет. Путь — A* по
// 8 соседям (без срезания углов стеллажей), затем «натягивание нити»: лишние
// точки убираются, пока отрезок между ними идёт только по проезжим клеткам.
// Раньше маршрут был прямой ворота↔стеллаж с одним объездом, и за вторым
// стеллажом подряд погрузчик проезжал насквозь.

const isWalkableValue = (value) =>
  value === CELL.FLOOR || value === CELL.GATE || value === CELL.GATE_IN || value === CELL.GATE_OUT;

export function makeNavGrid(shape) {
  const n = shape.gridSize;
  const walkable = new Uint8Array(n * n);
  for (let gz = 0; gz < n; gz++) {
    for (let gx = 0; gx < n; gx++) walkable[gz * n + gx] = isWalkableValue(cellAt(shape, gx, gz)) ? 1 : 0;
  }
  return { n, cellSize: shape.cellSize, walkable };
}

export function isWalkable(nav, gx, gz) {
  return gx >= 0 && gz >= 0 && gx < nav.n && gz < nav.n && nav.walkable[gz * nav.n + gx] === 1;
}

export function cellCenter(nav, gx, gz) {
  const a = cellWorldOrigin(gx, gz);
  return { x: a.x + nav.cellSize / 2, z: a.z + nav.cellSize / 2 };
}

export function cellOfPoint(nav, point) {
  return {
    gx: Math.max(0, Math.min(nav.n - 1, Math.floor((point.x + FLOOR / 2) / nav.cellSize))),
    gz: Math.max(0, Math.min(nav.n - 1, Math.floor((point.z + FLOOR / 2) / nav.cellSize))),
  };
}

// Ближайшая проезжая клетка (поиск в ширину) — для точки, оказавшейся на
// непроезжей клетке (центр стеллажа, край контура).
export function nearestWalkable(nav, from) {
  if (isWalkable(nav, from.gx, from.gz)) return from;
  const seen = new Uint8Array(nav.n * nav.n);
  const queue = [from];
  seen[from.gz * nav.n + from.gx] = 1;
  while (queue.length) {
    const cell = queue.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cell.gx + dx;
      const gz = cell.gz + dz;
      if (gx < 0 || gz < 0 || gx >= nav.n || gz >= nav.n || seen[gz * nav.n + gx]) continue;
      if (isWalkable(nav, gx, gz)) return { gx, gz };
      seen[gz * nav.n + gx] = 1;
      queue.push({ gx, gz });
    }
  }
  return null;
}

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// Открытый список A* — двоичная куча по f: раньше был массив с линейным
// поиском минимума, и на сетке с рядами стеллажей один путь стоил десятки
// миллисекунд — погрузчики «подвисали» на каждом новом плече.
function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].f <= heap[i].f) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l].f < heap[m].f) m = l;
      if (r < heap.length && heap[r].f < heap[m].f) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}

export function findCellPath(nav, start, goal) {
  const n = nav.n;
  const key = (gx, gz) => gz * n + gx;
  const g = new Float32Array(n * n).fill(Infinity);
  const came = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const h = (gx, gz) => Math.hypot(gx - goal.gx, gz - goal.gz);
  const open = [];
  heapPush(open, { gx: start.gx, gz: start.gz, f: h(start.gx, start.gz) });
  g[key(start.gx, start.gz)] = 0;

  while (open.length) {
    const current = heapPop(open);
    const ck = key(current.gx, current.gz);
    if (closed[ck]) continue;
    closed[ck] = 1;

    if (current.gx === goal.gx && current.gz === goal.gz) {
      const cells = [];
      for (let k = ck; k !== -1; k = came[k]) cells.push({ gx: k % n, gz: Math.floor(k / n) });
      return cells.reverse();
    }

    for (const [dx, dz, cost] of NEIGHBORS) {
      const gx = current.gx + dx;
      const gz = current.gz + dz;
      if (!isWalkable(nav, gx, gz)) continue;
      // По диагонали — только если оба боковых соседа свободны: не срезаем угол стеллажа.
      if (dx && dz && (!isWalkable(nav, current.gx + dx, current.gz) || !isWalkable(nav, current.gx, current.gz + dz))) continue;
      const nk = key(gx, gz);
      const next = g[ck] + cost;
      if (next < g[nk]) {
        g[nk] = next;
        came[nk] = ck;
        heapPush(open, { gx, gz, f: next + h(gx, gz) });
      }
    }
  }
  return null;
}

// Отрезок между двумя точками идёт только по проезжим клеткам (с запасом на
// ширину погрузчика — проверяем полосу из трёх параллельных лучей).
function segmentClear(nav, a, b, halfWidth) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const nx = -dz / length;
  const nz = dx / length;
  const steps = Math.ceil(length / (nav.cellSize / 4));
  for (const offset of [-halfWidth, 0, halfWidth]) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cell = cellOfPoint(nav, { x: a.x + dx * t + nx * offset, z: a.z + dz * t + nz * offset });
      if (!isWalkable(nav, cell.gx, cell.gz)) return false;
    }
  }
  return true;
}

// Путь в мировых точках от from до to (to — центр проезжей клетки или точка в ней).
// Маршруты погрузчиков повторяются (ворота ↔ одни и те же стеллажи), поэтому
// сглаженный путь кэшируется по клеткам начала и конца.
export function findPath(nav, from, to, halfWidth = 0.9) {
  const start = nearestWalkable(nav, cellOfPoint(nav, from));
  const goal = nearestWalkable(nav, cellOfPoint(nav, to));
  if (!start || !goal) return [to];
  nav.cache ??= new Map();
  const cacheKey = `${start.gx},${start.gz}>${goal.gx},${goal.gz}>${to.x.toFixed(2)},${to.z.toFixed(2)}`;
  const cached = nav.cache.get(cacheKey);
  if (cached) return cached.slice();

  const cells = findCellPath(nav, start, goal);
  if (!cells) return [to];

  const origin = cellCenter(nav, start.gx, start.gz);
  const points = [origin, ...cells.slice(1, -1).map((c) => cellCenter(nav, c.gx, c.gz)), to];
  // «Натягивание нити» вперёд: от опорной точки тянемся, пока отрезок свободен.
  const smoothed = [];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    while (next + 1 < points.length && segmentClear(nav, points[anchor], points[next + 1], halfWidth)) next++;
    smoothed.push(points[next]);
    anchor = next;
  }
  if (nav.cache.size > 2000) nav.cache.clear();
  nav.cache.set(cacheKey, smoothed);
  return smoothed.slice();
}

export function pathLength(from, points) {
  let total = 0;
  let prev = from;
  for (const p of points) {
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}
