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
// aisle — только во внутреннем проходе: стеллажи по обе стороны (в пределах двух клеток).
function bayNear(nav, shape, point, { minCells = 2, preferRack = false, targetCells = null, standSign = 1, aisle = false, avoid = [] } = {}) {
  const from = cellOfPoint(nav, point);
  let best = null;
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      if (!isWalkable(nav, gx, gz) || nearGate(shape, gx, gz, 3)) continue;
      const here = cellCenter(nav, gx, gz);
      if (avoid.some((p) => Math.hypot(p.x - here.x, p.z - here.z) < 9)) continue;
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
      const rackAt = (dx, dz) => cellAt(shape, gx + dx, gz + dz) === CELL.RACK;
      const between =
        ((rackAt(0, -1) || rackAt(0, -2)) && (rackAt(0, 1) || rackAt(0, 2))) ||
        ((rackAt(-1, 0) || rackAt(-2, 0)) && (rackAt(1, 0) || rackAt(2, 0)));
      if (aisle && !between) continue;
      // Не в узком проходе между рядами: там разъехаться транспортировщикам негде.
      if (!aisle && between) continue;
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
      const rackAt = (dx, dz) => cellAt(shape, gx + dx, gz + dz) === CELL.RACK;
      if ((rackAt(0, -1) && rackAt(0, 1)) || (rackAt(-1, 0) && rackAt(1, 0))) continue;
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
// avoid — точки, у которых стоянку не ставить (карманы и стоянки станции приёмки).
export function planShuttleBays({ shape, blockedRects = [], gatePoint, routeUnits, holds = 3, avoid = [] }) {
  const nav = blockedNav(shape, blockedRects);
  const a = bayNear(nav, shape, gatePoint, { minCells: 2 });
  if (!a) return null;
  const b = bayNear(nav, shape, a.park, { minCells: 3, preferRack: true, targetCells: Math.max(3, routeUnits / nav.cellSize), standSign: -1, avoid });
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
// Груз — тот же объект сцены: снимают его (take → объект), ставят его (put(unit)).
function makeBay(spot, cargoFactory) {
  const bay = {
    park: servicePoint(spot.park),
    parked: null,
    lift: DECK_HEIGHT,
    adopts: true,
    take() {
      const t = bay.parked;
      if (!t || !t.loaded || t.state !== "waitUnload") return null;
      if (bay.stand) pair(t);
      t.loaded = false;
      const unit = t.cargo;
      t.cargo = null;
      unit.removeFromParent();
      return unit;
    },
    put(unit) {
      const t = bay.parked;
      if (!t || t.loaded || t.state !== "waitLoad") return false;
      if (bay.stand) pair(t);
      t.loaded = true;
      t.cargo = unit ?? cargoFactory.create();
      t.cargo.removeFromParent();
      t.cargo.position.set(0, 0, 0);
      t.cargo.rotation.set(0, 0, 0);
      t.model.carry.add(t.cargo);
      return true;
    },
    // Рука может ставить: пустой транспортировщик стоит и ждёт груз.
    readyForArm: () => Boolean(bay.parked && !bay.parked.loaded && bay.parked.state === "waitLoad"),
  };
  if (!spot.stand) {
    // Стоянка у руки (станция приёмки): без погрузчика, очередь — в общих карманах.
    bay.park.holds = spot.holds ?? [];
    return bay;
  }
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
  const nav = blockedNav(shape, [...blockedRects, ...[bays.a?.stand, bays.b.stand].filter(Boolean).map(pad)]);
  const driver = createDriver({ nav, traffic });
  const cargoFactory = createCargoFactory(cargo);
  // Станция приёмки: стоянки погрузки — под руками (bays.loads), карманы — общие.
  const holds = (bays.holds ?? []).map((h) => servicePoint(h));
  const loadBays = bays.loads ? bays.loads.map((spot) => makeBay({ park: spot, holds }, cargoFactory)) : null;
  const bayA = loadBays ? loadBays[0] : makeBay(bays.a, cargoFactory);
  const bayB = makeBay(bays.b, cargoFactory);
  const loadList = direction === "in" ? loadBays ?? [bayA] : [bayB];
  const unloadList = direction === "in" ? [bayB] : [bayA];
  const speed = speedMps / Math.max(1e-6, metersPerUnit);
  let delivered = 0;

  // Стартуют на свободных клетках у стоянок погрузки — не в стеллажах и не друг в друге.
  const starts = [];
  const home = loadList[0].park;
  const cells = [];
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      if (!isWalkable(nav, gx, gz)) continue;
      const c = cellCenter(nav, gx, gz);
      cells.push({ ...c, d: Math.hypot(c.x - home.x, c.z - home.z) });
    }
  }
  cells.sort((p, q) => p.d - q.d);
  const parks = [...loadList, ...unloadList].map((b) => b.park);
  for (const c of cells) {
    if (starts.length >= count) break;
    if (parks.some((b) => Math.hypot(b.x - c.x, b.z - c.z) < 3)) continue;
    if (starts.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 4)) continue;
    starts.push({ x: c.x, z: c.z });
  }
  const shuttles = Array.from({ length: Math.max(1, count) }, (_, i) => {
    const model = robotFactory();
    const start = starts[i] ?? { x: home.x, z: home.z };
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

  // Свободная стоянка из списка: занимаем и едем к ней; все заняты — ждём в
  // кармане (driver.js). Предыдущий, отъезжающий от стоянки, её ещё не освободил.
  function chooseBay(t, list) {
    if (t.bay && list.includes(t.bay) && t.bay.park.owner === t) return t.bay;
    for (const bay of list) {
      const p = bay.park;
      if (p.leaving && Math.hypot(p.leaving.pos.x - p.x, p.leaving.pos.z - p.z) > 7) p.leaving = null;
      if (!p.owner && !p.leaving) {
        p.owner = t;
        t.bay = bay;
        return bay;
      }
    }
    t.bay = null;
    return list[0];
  }

  // true — встали на стоянку.
  function approach(t, list, dt) {
    const bay = chooseBay(t, list);
    const arrived = driver.drive(t, bay.park, dt, speed);
    return arrived && bay.park.owner === t ? bay : null;
  }

  function step(dt) {
    for (const t of shuttles) {
      switch (t.state) {
        case "toLoad": {
          t.meter.consume(dt, "work");
          const bay = approach(t, loadList, dt);
          if (bay) {
            park(t, bay);
            t.state = "waitLoad";
          }
          break;
        }
        case "waitLoad":
          t.meter.consume(dt, "idle");
          // Погрузчик поставил груз (bay.put) — везём.
          if (t.loaded) {
            leave(t, t.bay);
            t.bay = null;
            t.state = "toUnload";
          }
          break;
        case "toUnload": {
          t.meter.consume(dt, "work");
          const bay = approach(t, unloadList, dt);
          if (bay) {
            park(t, bay);
            t.state = "waitUnload";
          }
          break;
        }
        case "waitUnload":
          t.meter.consume(dt, "idle");
          if (!t.loaded) {
            delivered += 1;
            leave(t, t.bay);
            t.bay = null;
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
    loadBays,
    meters: shuttles.map((t) => t.meter),
    getDelivered: () => delivered,
    getStats: () => ({ busyLoaders: shuttles.filter((t) => t.state.startsWith("to")).length, cycles: delivered }),
  };
}
