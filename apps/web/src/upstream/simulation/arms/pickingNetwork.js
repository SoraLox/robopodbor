import * as THREE from "three";
import { MODEL_SCALE, ARM_BELT_X, ARM_BELT_START_Z, ARM_BELT_END_Z, ARM_BELT_HALF_LENGTH } from "../constants.js";
import { cellCenter, cellOfPoint, isWalkable, makeNavGrid } from "../loaders/gridPath.js";
import { activePalette } from "../studioLook.js";
import { CELL, cellAt } from "../shape/shapeTypes.js";

// Сеть конвейеров участка отбора (goods-to-robot): роборуки не живут на своих
// замкнутых лентах, а стоят на общей схеме, как на складе:
//   подача   — лента от торца стеллажей (выдача из хранения) вдоль ряда рук;
//              каждая коробка едет к своей руке и сходит на её входную ленту;
//   сборный  — после отбора коробка с выходной ленты руки уходит на сборный
//              конвейер, и он ведёт вдоль стены к воротам отгрузки.
// Маршрут сборного конвейера — по сетке пола (в обход стеллажей, зон рук и
// конвейерных линий связей), с предпочтением вдоль стен и с минимумом поворотов.

const S = MODEL_SCALE;
const TRUNK_WIDTH = 2.2;
// От торца ленты руки до оси магистрали: полрамы руки + полширины магистрали + зазор.
const TRUNK_OFFSET = (ARM_BELT_HALF_LENGTH - Math.abs(ARM_BELT_START_Z)) * S + TRUNK_WIDTH / 2 + 0.35;
const BELT_TOP = 0.81;
const BOX_SIZE = 0.68 * S;
const BOX_Y = BELT_TOP + BOX_SIZE / 2;
const BOX_SPACING = BOX_SIZE + 0.6;
const SPUR_MAX = 10;

// Полилиния: точки, длины участков, положение по пройденному пути.
function makeLine(points) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-6) continue;
    segments.push({ a, b, length, from: total });
    total += length;
  }
  return {
    points,
    segments,
    total,
    at(d) {
      const seg = segments.find((s) => d <= s.from + s.length) ?? segments[segments.length - 1];
      if (!seg) return { x: points[0].x, z: points[0].z };
      const t = Math.max(0, Math.min(1, (d - seg.from) / seg.length));
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t };
    },
  };
}

// Путь по клеткам пола от start до goal: Дейкстра по (клетка, направление) —
// поворот дороже прямого участка, у стены дешевле, чем посреди проходов.
function routeCells(nav, blocked, start, goal, isWall, isGate) {
  const n = nav.n;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const free = (gx, gz) => isWalkable(nav, gx, gz) && !blocked[gz * n + gx];
  const nearWall = (gx, gz) => DIRS.some(([dx, dz]) => isWall(gx + dx, gz + dz));
  // Перед проёмами — площадка фур и погрузчиков: туда конвейер не тянем.
  const atGate = (gx, gz) => DIRS.some(([dx, dz]) => isGate(gx + dx, gz + dz));
  const INF = Infinity;
  const dist = new Float64Array(n * n * 4).fill(INF);
  const came = new Int32Array(n * n * 4).fill(-1);
  const open = [];
  for (let d = 0; d < 4; d++) {
    dist[(start.gz * n + start.gx) * 4 + d] = 0;
    open.push([0, start.gx, start.gz, d]);
  }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [cost, gx, gz, dir] = open.splice(bi, 1)[0];
    const key = (gz * n + gx) * 4 + dir;
    if (cost > dist[key]) continue;
    if (gx === goal.gx && gz === goal.gz) {
      const cells = [];
      for (let k = key; k !== -1; k = came[k]) {
        const c = Math.floor(k / 4);
        cells.push({ gx: c % n, gz: Math.floor(c / n) });
      }
      return { cells: cells.reverse(), cost };
    }
    DIRS.forEach(([dx, dz], nd) => {
      const nx = gx + dx;
      const nz = gz + dz;
      const isGoal = nx === goal.gx && nz === goal.gz;
      if (!isGoal && (!free(nx, nz) || isGate(nx, nz))) return;
      const step = 1 + (nd !== dir ? 3 : 0) + (nearWall(nx, nz) ? 0 : 1.5) + (!isGoal && atGate(nx, nz) ? 6 : 0);
      const nk = (nz * n + nx) * 4 + nd;
      if (cost + step < dist[nk]) {
        dist[nk] = cost + step;
        came[nk] = key;
        open.push([cost + step, nx, nz, nd]);
      }
    });
  }
  return null;
}

// Клетки, пересекающие прямоугольники {x, z, halfX, halfZ}.
function markRects(nav, rects) {
  const blocked = new Uint8Array(nav.n * nav.n);
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      const c = cellCenter(nav, gx, gz);
      const h = nav.cellSize / 2;
      if (rects.some((r) => Math.abs(c.x - r.x) < r.halfX + h - 0.2 && Math.abs(c.z - r.z) < r.halfZ + h - 0.2)) blocked[gz * nav.n + gx] = 1;
    }
  }
  return blocked;
}

// Прямоугольники участков полилинии (для пылесосов и объезда).
function lineRects(line) {
  return line.segments.map((s) => ({
    x: (s.a.x + s.b.x) / 2,
    z: (s.a.z + s.b.z) / 2,
    halfX: Math.abs(s.b.x - s.a.x) / 2 + TRUNK_WIDTH / 2 + 0.4,
    halfZ: Math.abs(s.b.z - s.a.z) / 2 + TRUNK_WIDTH / 2 + 0.4,
  }));
}

// Раскладка сети по местам рук. slots — места рук (computeArmSlots), gates —
// ворота отгрузки, avoid — прямоугольники, через которые сборный конвейер не идёт.
export function planPickingNetwork({ shape, slots, gates, avoid = [] }) {
  const nav = makeNavGrid(shape);
  const armRects = slots.map((slot) => ({
    x: slot.x,
    z: slot.z,
    halfX: (ARM_BELT_X + 0.8) * S,
    halfZ: ARM_BELT_HALF_LENGTH * S + TRUNK_OFFSET + TRUNK_WIDTH / 2,
  }));

  // Ряды рук — по одинаковой Z.
  const rowsByZ = new Map();
  slots.forEach((slot, i) => {
    const key = Math.round(slot.z * 10);
    if (!rowsByZ.has(key)) rowsByZ.set(key, []);
    rowsByZ.get(key).push({ ...slot, index: i });
  });

  const rows = [];
  const taken = [];
  for (const members of rowsByZ.values()) {
    members.sort((a, b) => a.x - b.x);
    const z = members[0].z;
    const feedZ = z + ARM_BELT_START_Z * S - TRUNK_OFFSET;
    const takeZ = z + ARM_BELT_END_Z * S + TRUNK_OFFSET;
    const inX = members.map((m) => m.x - ARM_BELT_X * S);
    const outX = members.map((m) => m.x + ARM_BELT_X * S);

    // Подача: отвод от торца стеллажей (или от стены) к магистрали, дальше вдоль ряда.
    const xs = inX[0] - 3;
    let spur = 0;
    while (spur < SPUR_MAX) {
      const cell = cellOfPoint(nav, { x: xs, z: feedZ - spur - 1 });
      if (!isWalkable(nav, cell.gx, cell.gz)) break;
      spur += 1;
    }
    spur = Math.max(3, spur);
    const feed = makeLine([
      { x: xs, z: feedZ - spur },
      { x: xs, z: feedZ },
      { x: inX[inX.length - 1], z: feedZ },
    ]);
    const divertD = inX.map((x) => spur + (x - xs));

    // Сборный: вдоль ряда к стороне ворот отгрузки, дальше — по полу к краю проёма.
    // Из всех ворот отгрузки и обоих краёв проёма берём самый дешёвый маршрут.
    const center = (outX[0] + outX[outX.length - 1]) / 2;
    const isWall = (gx, gz) => cellAt(shape, gx, gz) === CELL.EMPTY;
    const isGate = (gx, gz) => {
      const v = cellAt(shape, gx, gz);
      return v === CELL.GATE || v === CELL.GATE_IN || v === CELL.GATE_OUT;
    };
    const blocked = markRects(nav, [...avoid, ...armRects, ...taken, ...lineRects(feed)]);
    let best = null;
    for (const east of [true, false]) {
      const startX = east ? outX[0] - 1.5 : outX[outX.length - 1] + 1.5;
      const endX = east ? outX[outX.length - 1] + 3 : outX[0] - 3;
      const startCell = cellOfPoint(nav, { x: endX, z: takeZ });
      for (const gate of gates) {
        const along = { x: Math.abs(gate.normal[1]), z: Math.abs(gate.normal[0]) };
        const halfSpan = (gate.worldSpan.max - gate.worldSpan.min) / 2;
        const edge = halfSpan - nav.cellSize / 2;
        for (const side of [-1, 1]) {
          const goal = cellOfPoint(nav, {
            x: gate.worldCenter.x + along.x * edge * side - gate.normal[0] * nav.cellSize,
            z: gate.worldCenter.z + along.z * edge * side - gate.normal[1] * nav.cellSize,
          });
          const route = routeCells(nav, blocked, startCell, goal, isWall, isGate);
          // Длина магистрали вдоль ряда тоже в счёт: ворота с другой стороны ряда — дороже.
          const cost = route ? route.cost + Math.abs(endX - center) / nav.cellSize : Infinity;
          if (route && (!best || cost < best.cost)) best = { cost, route, gate, startX, endX };
        }
      }
    }
    const startX = best ? best.startX : outX[0] - 1.5;
    const endX = best ? best.endX : outX[outX.length - 1] + 3;
    const points = [
      { x: startX, z: takeZ },
      { x: endX, z: takeZ },
    ];
    if (best && best.route.cells.length > 1) {
      const cells = best.route.cells;
      const first = cellCenter(nav, cells[0].gx, cells[0].gz);
      points[1] = { x: first.x, z: takeZ };
      points.push({ x: first.x, z: first.z });
      for (let i = 1; i < cells.length; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        const next = cells[i + 1];
        const turn = !next || next.gx - cur.gx !== cur.gx - prev.gx || next.gz - cur.gz !== cur.gz - prev.gz;
        if (turn) points.push(cellCenter(nav, cur.gx, cur.gz));
      }
      // В проём ворот — к фуре.
      const last = points[points.length - 1];
      points.push({ x: last.x + best.gate.normal[0] * nav.cellSize, z: last.z + best.gate.normal[1] * nav.cellSize });
    }
    const take = makeLine(points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 1e-3));
    const mergeD = outX.map((x) => Math.abs(x - startX));
    taken.push(...lineRects(feed), ...lineRects(take));

    rows.push({ feed, take, arms: members.map((m, k) => ({ index: m.index, divertD: divertD[k], mergeD: mergeD[k] })) });
  }

  return { rows, obstacles: taken };
}

// Ленты сети в сцене: рама и полотно по каждому участку полилинии.
export function buildNetworkMeshes(group, rows, beltTexture) {
  const palette = activePalette();
  const beltMaterial = new THREE.MeshStandardMaterial({ color: palette.belt, map: beltTexture ?? null, roughness: 0.7 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: palette.storage, flatShading: true, roughness: 0.6 });
  const root = new THREE.Group();
  for (const row of rows) {
    for (const line of [row.feed, row.take]) {
      for (const s of line.segments) {
        const extra = TRUNK_WIDTH / 2; // стыки на поворотах — внахлёст
        const segment = new THREE.Group();
        segment.position.set((s.a.x + s.b.x) / 2, 0, (s.a.z + s.b.z) / 2);
        segment.rotation.y = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(TRUNK_WIDTH + 0.3, BELT_TOP - 0.12, s.length + extra), frameMaterial);
        frame.position.y = (BELT_TOP - 0.12) / 2;
        frame.castShadow = true;
        const belt = new THREE.Mesh(new THREE.BoxGeometry(TRUNK_WIDTH - 0.3, 0.14, s.length + extra), beltMaterial);
        belt.position.y = BELT_TOP - 0.07;
        segment.add(frame, belt);
        root.add(segment);
      }
    }
  }
  group.add(root);
  return root;
}

export const NETWORK_BOX = { size: BOX_SIZE, y: BOX_Y, spacing: BOX_SPACING };
