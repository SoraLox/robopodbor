import { cellCenter, cellOfPoint, isWalkable, makeNavGrid } from "./gridPath.js";
import { CELL, cellAt } from "../shape/shapeTypes.js";
import { createDriver, servicePoint } from "./driver.js";
import { createCargoFactory } from "./cargo.js";
import { createEnergyMeter } from "../energy.js";
import { disposeTree } from "../sceneUtils.js";
import { makeTransporterRobot } from "../robots/transporterRobot.js";

// Челночная схема с плоскими транспортировщиками (AMR-платформа без вил):
// сам груз он не берёт — на него ставит погрузчик и снимает погрузчик.
//   место стоянки A — у ворот или у конца ленты: погрузчик «ворот» ставит
//     паллету на транспортировщик (приёмка) или снимает её (отгрузка);
//   место стоянки B — в зоне хранения: погрузчик «хранения» снимает паллету и
//     ставит в стеллаж (приёмка) или ставит на транспортировщик со стеллажа.
// Транспортировщик возит длинное плечо A↔B; на стоянке один, остальные ждут
// очереди на подъезде (driver.js). Места стоянки для погрузчиков — как ячейка
// стеллажа: {stand, take, put, lift} (customLoaderFleet storageHub / handoffs).

const DECK_HEIGHT = 0.75; // высота вил у платформы транспортировщика

// Клетка стоянки рядом с точкой: проезжая, с проезжим соседом для погрузчика.
const isGateCell = (shape, gx, gz) => {
  const v = cellAt(shape, gx, gz);
  return v === CELL.GATE || v === CELL.GATE_IN || v === CELL.GATE_OUT;
};

// Площадка у ворот (фура, погрузчики у проёма) — не для стоянки транспортировщиков.
function nearGate(shape, gx, gz, cells) {
  for (let dz = -cells; dz <= cells; dz++) {
    for (let dx = -cells; dx <= cells; dx++) {
      if (Math.abs(dx) + Math.abs(dz) <= cells && isGateCell(shape, gx + dx, gz + dz)) return true;
    }
  }
  return false;
}

// standSign: +1 — место погрузчика со стороны точки point, −1 — с противоположной.
function bayNear(nav, shape, point, { minCells = 2, preferRack = false, targetCells = null, standSign = 1 } = {}) {
  const from = cellOfPoint(nav, point);
  let best = null;
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      if (!isWalkable(nav, gx, gz) || nearGate(shape, gx, gz, 3)) continue;
      const d = Math.abs(gx - from.gx) + Math.abs(gz - from.gz);
      if (d < minCells) continue;
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      // Погрузчик — с той стороны, откуда не подъезжают транспортировщики.
      const stand = sides
        .map(([dx, dz]) => ({ gx: gx + dx, gz: gz + dz }))
        .filter((c) => isWalkable(nav, c.gx, c.gz) && !nearGate(shape, c.gx, c.gz, 2))
        .sort((p, q) => standSign * (Math.abs(p.gx - from.gx) + Math.abs(p.gz - from.gz) - Math.abs(q.gx - from.gx) - Math.abs(q.gz - from.gz)))[0];
      if (!stand) continue;
      const byRack = sides.some(([dx, dz]) => cellAt(shape, gx + dx, gz + dz) === CELL.RACK);
      if (preferRack && !byRack) continue;
      const score = targetCells !== null ? Math.abs(d - targetCells) : d;
      if (!best || score < best.score) best = { score, gx, gz, stand };
    }
  }
  if (!best) return null;
  return { park: cellCenter(nav, best.gx, best.gz), stand: cellCenter(nav, best.stand.gx, best.stand.gz) };
}

// Карманы ожидания у стоянки: проезжие клетки в 2–4 клетках от неё, не на линии
// A–B (там ездят гружёные), не у места погрузчика и не у ворот.
function holdsNear(nav, shape, bay, other, count) {
  const seg = { x: other.park.x - bay.park.x, z: other.park.z - bay.park.z };
  const len2 = seg.x * seg.x + seg.z * seg.z || 1;
  const offLine = (p) => {
    const t = Math.max(0, Math.min(1, ((p.x - bay.park.x) * seg.x + (p.z - bay.park.z) * seg.z) / len2));
    return Math.hypot(p.x - (bay.park.x + seg.x * t), p.z - (bay.park.z + seg.z * t));
  };
  const list = [];
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      if (!isWalkable(nav, gx, gz) || nearGate(shape, gx, gz, 3)) continue;
      const c = cellCenter(nav, gx, gz);
      const d = Math.hypot(c.x - bay.park.x, c.z - bay.park.z) / nav.cellSize;
      if (d < 2 || d > 4.5 || offLine(c) < 6) continue;
      if (Math.hypot(c.x - bay.stand.x, c.z - bay.stand.z) < 6 || Math.hypot(c.x - other.stand.x, c.z - other.stand.z) < 6) continue;
      list.push({ ...c, d });
    }
  }
  list.sort((p, q) => p.d - q.d);
  const picked = [];
  for (const c of list) {
    if (picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= 5)) picked.push({ x: c.x, z: c.z });
    if (picked.length >= count) break;
  }
  return picked;
}

// Места стоянки связи: A — у точки передачи ворот/ленты, B — в хранении на
// расчётном плече от A; у каждой — карманы ожидания. null — если на форме их не поставить.
export function planShuttleBays({ shape, blockedRects = [], gatePoint, routeUnits, holds = 3 }) {
  const nav = blockedNav(shape, blockedRects);
  const a = bayNear(nav, shape, gatePoint, { minCells: 2 });
  if (!a) return null;
  const b = bayNear(nav, shape, a.park, { minCells: 3, preferRack: true, targetCells: Math.max(3, routeUnits / nav.cellSize), standSign: -1 });
  if (!b) return null;
  a.holds = holdsNear(nav, shape, a, b, holds);
  b.holds = holdsNear(nav, shape, b, a, holds);
  return { a, b };
}

// Клетки стоянок — для маршрутов погрузчиков (они подъезжают к месту рядом, не через стоянку).
export const bayRects = (bays) => [bays.a.park, bays.b.park].map((p) => ({ x: p.x, z: p.z, halfX: 0.6, halfZ: 0.6 }));

export function blockedNav(shape, blockedRects) {
  const nav = makeNavGrid(shape);
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      const c = cellCenter(nav, gx, gz);
      const h = nav.cellSize / 2;
      if (blockedRects.some((r) => Math.abs(c.x - r.x) < r.halfX + h - 0.5 && Math.abs(c.z - r.z) < r.halfZ + h - 0.5)) {
        nav.walkable[gz * nav.n + gx] = 0;
      }
    }
  }
  return nav;
}

// Место стоянки: транспортировщик паркуется в park, погрузчик стоит в stand
// вилами к нему. take/put — снять груз с припаркованного / поставить на пустой.
function makeBay(spot, cargoFactory) {
  const bay = {
    park: servicePoint(spot.park),
    parked: null,
    lift: DECK_HEIGHT,
    take() {
      const t = bay.parked;
      if (!t || !t.loaded) return false;
      pair(t);
      t.loaded = false;
      t.model.carry.remove(t.cargo);
      disposeTree(t.cargo);
      t.cargo = null;
      return true;
    },
    put() {
      const t = bay.parked;
      if (!t || t.loaded) return false;
      pair(t);
      t.loaded = true;
      t.cargo = cargoFactory.create();
      t.cargo.position.y = 0;
      t.model.carry.add(t.cargo);
      return true;
    },
  };
  // Погрузчик и транспортировщик после перегрузки разъезжаются, не блокируя друг друга.
  function pair(t) {
    const lift = bay.stand.owner;
    if (!lift) return;
    t.ignore = lift;
    lift.ignore = t;
  }
  bay.stand = servicePoint(spot.stand, { face: spot.park, hub: bay, partner: () => bay.parked });
  bay.park.partner = () => bay.stand.owner;
  // Ожидающие своей очереди — в карманах в стороне от линии A–B.
  bay.park.holds = (spot.holds ?? []).map((h) => servicePoint(h));
  bay.x = spot.stand.x;
  bay.z = spot.stand.z;
  bay.face = spot.park;
  return bay;
}

export function createShuttleFleet({
  group,
  shape,
  bays,
  count,
  direction, // 'in': грузят на A, снимают на B; 'out' — наоборот
  speedMps,
  metersPerUnit,
  cargo,
  energyProfile,
  traffic,
  blockedRects = [],
  robotFactory = makeTransporterRobot,
}) {
  // Транспортировщики не ездят через места погрузчиков у стоянок.
  const pad = (p) => ({ x: p.x, z: p.z, halfX: 0.6, halfZ: 0.6 });
  const nav = blockedNav(shape, [...blockedRects, pad(bays.a.stand), pad(bays.b.stand)]);
  const driver = createDriver({ nav, traffic });
  const cargoFactory = createCargoFactory(cargo);
  const bayA = makeBay(bays.a, cargoFactory);
  const bayB = makeBay(bays.b, cargoFactory);
  const loadBay = direction === "in" ? bayA : bayB;
  const unloadBay = direction === "in" ? bayB : bayA;
  const speed = speedMps / Math.max(1e-6, metersPerUnit);
  let delivered = 0;

  // Стартуют вдоль пути между местами стоянки, друг за другом — не у ворот.
  const startLine = { x: bayB.park.x - bayA.park.x, z: bayB.park.z - bayA.park.z };
  const startLen = Math.max(1, Math.hypot(startLine.x, startLine.z));
  const shuttles = Array.from({ length: Math.max(1, count) }, (_, i) => {
    const model = robotFactory();
    const t0 = Math.min(0.8, (i + 1) / (count + 1));
    const start = { x: bayA.park.x + startLine.x * t0, z: bayA.park.z + startLine.z * t0 };
    void startLen;
    model.group.position.set(start.x, 0, start.z);
    group.add(model.group);
    const t = {
      model,
      // Корпус платформы (2,1 × 2,9 ед.) — меньше погрузчика.
      pos: { ...start, heading: 0, body: { radius: 1.1, offsets: [-0.4, 0.4] } },
      state: "toLoad",
      loaded: false,
      cargo: null,
      meter: createEnergyMeter(energyProfile),
    };
    traffic.add(t);
    return t;
  });

  function park(t, bay) {
    bay.parked = t;
  }

  function leave(t, bay) {
    if (bay.parked === t) bay.parked = null;
    driver.release(t, bay.park);
  }

  // Едем к стоянке; занята — ждём в кармане (driver.js). true — встали.
  const approach = (t, bay, dt) => driver.drive(t, bay.park, dt, speed);

  function step(dt) {
    for (const t of shuttles) {
      switch (t.state) {
        case "toLoad":
          t.meter.consume(dt, "work");
          if (approach(t, loadBay, dt)) {
            park(t, loadBay);
            t.state = "waitLoad";
          }
          break;
        case "waitLoad":
          t.meter.consume(dt, "idle");
          // Погрузчик поставил груз (bay.put) — везём.
          if (t.loaded) {
            leave(t, loadBay);
            t.state = "toUnload";
          }
          break;
        case "toUnload":
          t.meter.consume(dt, "work");
          if (approach(t, unloadBay, dt)) {
            park(t, unloadBay);
            t.state = "waitUnload";
          }
          break;
        case "waitUnload":
          t.meter.consume(dt, "idle");
          if (!t.loaded) {
            delivered += 1;
            leave(t, unloadBay);
            t.state = "toLoad";
          }
          break;
        default:
          break;
      }
    }
  }

  function dispose() {
    for (const t of shuttles) {
      traffic.remove(t);
      if (t.cargo) disposeTree(t.cargo);
      group.remove(t.model.group);
      t.model.dispose?.();
    }
    cargoFactory.dispose();
  }

  return {
    step,
    dispose,
    bayA,
    bayB,
    meters: shuttles.map((t) => t.meter),
    getDelivered: () => delivered,
    getStats: () => ({ busyLoaders: shuttles.filter((t) => t.state.startsWith("to")).length, cycles: delivered }),
  };
}
