import * as THREE from "three";
import { activePalette } from "../studioLook.js";
import { disposeTree } from "../sceneUtils.js";

// Лента по ломаной — открытая (подача, сборный конвейер) или замкнутая в кольцо
// (карусель приёмки: груз ездит по кругу, пока его не заберёт роборука).
// Груз — те же объекты сцены, что возят погрузчики и транспортировщики: его
// ставят на ленту (put) и снимают с неё (точка отбора take) — ничего не
// появляется и не исчезает само.
//
// Точки отбора (addPickPoint) — у роборук: если рука готова, груз, доезжая до
// точки, останавливается в ней и ждёт руку; не готова — едет дальше (по кругу).

export const BELT_TOP = 0.9;
const FRAME_COLOR_KEY = "storage";

export function createBeltPath({ group, points, closed = false, speed = 1.2, width = 3, spacing = 3.2, beltTexture = null }) {
  const palette = activePalette();
  const beltMaterial = new THREE.MeshStandardMaterial({ color: palette.belt, map: beltTexture ?? null, roughness: 0.7 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: palette[FRAME_COLOR_KEY], flatShading: true, roughness: 0.6 });

  const pts = closed ? [...points, points[0]] : points;
  const segments = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-6) continue;
    segments.push({ a, b, length, from: total });
    total += length;
  }

  const wrap = (d) => (closed ? ((d % total) + total) % total : d);
  function at(d) {
    const dd = wrap(d);
    const seg = segments.find((s) => dd <= s.from + s.length + 1e-9) ?? segments[segments.length - 1];
    const t = Math.max(0, Math.min(1, (dd - seg.from) / seg.length));
    return { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t, heading: Math.atan2(seg.b.x - seg.a.x, seg.b.z - seg.a.z) };
  }

  // Проекция точки на ленту: ближайшее расстояние вдоль пути.
  function project(p) {
    let best = { d: 0, dist: Infinity };
    for (const s of segments) {
      const dx = s.b.x - s.a.x;
      const dz = s.b.z - s.a.z;
      const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / (s.length * s.length)));
      const dist = Math.hypot(p.x - (s.a.x + dx * t), p.z - (s.a.z + dz * t));
      if (dist < best.dist) best = { d: s.from + s.length * t, dist };
    }
    return best.d;
  }

  // Рама и полотно.
  const root = new THREE.Group();
  for (const s of segments) {
    const seg = new THREE.Group();
    seg.position.set((s.a.x + s.b.x) / 2, 0, (s.a.z + s.b.z) / 2);
    seg.rotation.y = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
    const len = s.length + width; // внахлёст на поворотах
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, BELT_TOP - 0.14, len), frameMaterial);
    frame.position.y = (BELT_TOP - 0.14) / 2;
    frame.castShadow = true;
    frame.receiveShadow = true;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(width - 0.3, 0.14, len), beltMaterial);
    belt.position.y = BELT_TOP - 0.07;
    seg.add(frame, belt);
    root.add(seg);
  }
  group.add(root);

  const items = []; // { unit, d, held }
  const picks = [];
  let moved = 0;

  const gapAhead = (item) => {
    let best = Infinity;
    for (const other of items) {
      if (other === item) continue;
      let gap = other.d - item.d;
      if (closed) gap = ((gap % total) + total) % total;
      if (gap > 1e-6 && gap < best) best = gap;
    }
    return best;
  };

  function place(item) {
    const p = at(item.d);
    item.unit.position.set(p.x, BELT_TOP, p.z);
    item.unit.rotation.set(0, p.heading, 0);
  }

  // Поставить груз на ленту в точке d, если там есть окно.
  function put(unit, d) {
    const dd = wrap(d);
    const free = items.every((o) => {
      let gap = Math.abs(o.d - dd);
      if (closed) gap = Math.min(gap, total - gap);
      return gap >= spacing;
    });
    if (!free) return false;
    unit.removeFromParent();
    group.add(unit);
    const item = { unit, d: dd, held: null };
    items.push(item);
    place(item);
    return true;
  }

  function remove(item) {
    const i = items.indexOf(item);
    if (i >= 0) items.splice(i, 1);
    moved += 1;
    return item.unit;
  }

  // Точка отбора: ready() — рука ждёт груз; onArrive(item) — груз встал в точке.
  function addPickPoint(d, ready) {
    const pick = { d: wrap(d), ready, item: null };
    picks.push(pick);
    return {
      d: pick.d,
      // Груз, который стоит в точке и ждёт руку (или null).
      waiting: () => pick.item,
      take() {
        const item = pick.item;
        if (!item) return null;
        pick.item = null;
        return remove(item);
      },
    };
  }

  function step(dt) {
    // Порядок: от головы колонны к хвосту — хвост упирается в голову.
    const order = [...items].sort((a, b) => gapAhead(b) - gapAhead(a));
    for (const item of order) {
      if (item.held) continue;
      const room = gapAhead(item) - spacing;
      let travel = Math.max(0, Math.min(speed * dt, room));
      if (!closed) travel = Math.min(travel, total - item.d);
      const from = item.d;
      let to = from + travel;
      // Проехали точку отбора, где ждёт рука, — встаём в ней.
      for (const pick of picks) {
        if (pick.item) continue;
        let ahead = pick.d - from;
        if (closed) ahead = ((ahead % total) + total) % total;
        if (ahead >= -1e-6 && ahead <= travel + 1e-6 && pick.ready()) {
          to = from + ahead;
          item.held = pick;
          pick.item = item;
          break;
        }
      }
      item.d = wrap(to);
      place(item);
    }
  }

  function dispose() {
    for (const item of items) item.unit.removeFromParent();
    group.remove(root);
    disposeTree(root);
    beltMaterial.dispose();
    frameMaterial.dispose();
  }

  const obstacles = segments.map((s) => ({
    x: (s.a.x + s.b.x) / 2,
    z: (s.a.z + s.b.z) / 2,
    halfX: Math.abs(s.b.x - s.a.x) / 2 + width / 2 + 0.6,
    halfZ: Math.abs(s.b.z - s.a.z) / 2 + width / 2 + 0.6,
  }));

  return {
    total,
    closed,
    at,
    project,
    put,
    addPickPoint,
    step,
    dispose,
    obstacles,
    items: () => items,
    // Конец открытой ленты: груз, доехавший до конца (сборный конвейер → ворота).
    takeAtEnd() {
      if (closed) return null;
      const item = items.find((i) => i.d >= total - 1e-3);
      return item ? remove(item) : null;
    },
    getMoved: () => moved,
  };
}
