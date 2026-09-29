import { computeGateClusters } from "../shape/shapeGeometry.js";
import { cellCenter, cellOfPoint, isWalkable, makeNavGrid } from "./gridPath.js";
import { createDriver, createTraffic, headingZForward, servicePoint } from "./driver.js";
import { CELL, cellAt, cellWorldOrigin } from "../shape/shapeTypes.js";
import { createCargoFactory } from "./cargo.js";
import { createEnergyMeter } from "../energy.js";
import { disposeTree, createMaterializeFade } from "../sceneUtils.js";
import { makeForkliftRobot } from "../robots/forkliftRobot.js";
import { makeTruck } from "../robots/truckRobot.js";
import { FORK_CARRY_LIFT, FORK_CLEARANCE, FORK_LIFT_SPEED, LOAD_SLOWDOWN } from "../constants.js";

// Работа вилами за цикл — 25 с, как в расчёте (warehouseEconomics loaderHandlingSeconds):
// половина у стеллажа, половина у ворот. Раньше было 1,4 с — сцена «обгоняла» расчёт.
const PAUSE_SECONDS = 12.5;
// Высоты вил: ярус стеллажа (warehouseRacks TIER_HEIGHT), лента конвейера, пол фуры.
const RACK_TIER_HEIGHT = 1.9;
const BELT_HEIGHT = 1.0;
const TRUCK_BED_HEIGHT = 1.1;
// Погрузчиков на одни ворота: стоят у проёма рядом, по ширине ворот.
export const LOADERS_PER_GATE = 3;

// Фуры на воротах конструктора формы склада: заезжают/уезжают по нормали к
// стене (та же сторона, что и проём) — упрощённо, без разворотов/полос,
// как и весь остальной маршрут в этом файле.
const TRUCK_DOCK_DISTANCE = 3.2;
const TRUCK_APPROACH_DISTANCE = 16;
const TRUCK_DRIVE_SECONDS = 3.5;
// Фура стоит у ворот, пока не обменяет свою загрузку (truckPayload единиц), но не
// дольше TRUCK_MAX_DOCKED_SECONDS; следующая подъезжает через 2–4 с — при пиковом
// потоке погрузчики не должны простаивать из-за случайного разрыва между фурами.
const TRUCK_MAX_DOCKED_SECONDS = 600;
const TRUCK_GAP_MIN_S = 2;
const TRUCK_GAP_MAX_S = 4;
const TRUCK_FADE_SECONDS = 1.2;

// Погрузчики для «своей» формы склада (конструктор): в отличие от штатного
// loaderSystem.js (проезды/полосы/LIFO-ячейки, roads.js/traffic.js), здесь
// упрощённый маршрут в 2 плеча — ворота ↔ ближайший назначенный стеллаж по
// прямой линии, без системы проездов. На зоне выгрузки (GATE_IN) поток идёт
// от ворот к стеллажу (фура привозит), на зоне загрузки (GATE_OUT) — от
// стеллажа к воротам (фура забирает); у ворот погрузчик ждёт, пока
// подъедет фура (см. stepGateTruck) — без неё передавать груз некому.

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Места хранения: у каждого стеллажа — клетка подъезда (проезжий сосед,
// ближайший к воротам), погрузчик встаёт там и поворачивается к стеллажу.
// Раньше целью был центр клетки стеллажа — погрузчик въезжал в сам стеллаж.
function collectStorage(shape, nav, gates, routeUnits) {
  const places = [];
  const gateCells = gates.map((gate) => cellOfPoint(nav, gate.worldCenter));
  const toGate = (gx, gz) => Math.min(...gateCells.map((c) => Math.abs(c.gx - gx) + Math.abs(c.gz - gz)));

  for (let gz = 0; gz < shape.gridSize; gz++) {
    for (let gx = 0; gx < shape.gridSize; gx++) {
      if (cellAt(shape, gx, gz) !== CELL.RACK) continue;
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dz]) => ({ gx: gx + dx, gz: gz + dz }))
        .filter((c) => isWalkable(nav, c.gx, c.gz))
        .sort((a, b) => toGate(a.gx, a.gz) - toGate(b.gx, b.gz));
      // Середина сплошного блока стеллажей — к ней не подъехать, ячейку пропускаем.
      if (!sides.length) continue;
      const approach = cellCenter(nav, sides[0].gx, sides[0].gz);
      places.push({ x: approach.x, z: approach.z, face: cellCenter(nav, gx, gz) });
    }
  }

  if (places.length) return places;

  // Стеллажи не нарисованы — напольное хранение на расчётном пути от ворот
  // (routeUnits — «Средняя протяжённость маршрута» расчёта), чтобы цикл сцены
  // совпадал с циклом, по которому посчитан парк. Без пути — дальняя половина пола.
  const floor = [];
  for (let gz = 0; gz < shape.gridSize; gz++) {
    for (let gx = 0; gx < shape.gridSize; gx++) {
      if (cellAt(shape, gx, gz) === CELL.FLOOR) floor.push({ gx, gz, d: toGate(gx, gz) });
    }
  }
  const targetCells = routeUnits ? routeUnits / nav.cellSize : null;
  if (targetCells) floor.sort((a, b) => Math.abs(a.d - targetCells) - Math.abs(b.d - targetCells));
  else floor.sort((a, b) => b.d - a.d);
  return floor
    .slice(0, Math.max(6, Math.ceil(floor.length / (targetCells ? 6 : 2))))
    .filter((_, i) => i % 2 === 0)
    .map((c) => {
      const point = cellCenter(nav, c.gx, c.gz);
      return { x: point.x, z: point.z, face: null };
    });
}

function nearestGateOf(point, gates) {
  let best = gates[0];
  let bestDist = Infinity;

  for (const gate of gates) {
    const d = Math.hypot(point.x - gate.worldCenter.x, point.z - gate.worldCenter.z);
    if (d < bestDist) {
      bestDist = d;
      best = gate;
    }
  }

  return best;
}

function truckPointAt(gate, distance) {
  return { x: gate.worldCenter.x + gate.normal[0] * distance, z: gate.worldCenter.z + gate.normal[1] * distance };
}

export function createCustomLoaderFleet({
  group,
  shape,
  count,
  capacityKg,
  cargoWeightKg,
  speedMps,
  metersPerUnit,
  cargo,
  energyProfile,
  truckPayload = 18,
  routeLengthM,
  robotFactory = makeForkliftRobot,
  // Сценарий склада: связь приёмки или отгрузки.
  //   gateIds — ворота этой связи (нет — все); direction — 'in' | 'out' для всех
  //   погрузчиков флота; handoffs — концы конвейера у зоны хранения (по одному на
  //   ворота): погрузчик берёт/сдаёт груз там, а не у фуры, и фуру не ждёт.
  //   showTrucks — фуры у ворот рисует только один флот связи.
  gateIds = null,
  direction = null,
  handoffs = null,
  showTrucks = true,
  // Стационарное оборудование (ленты, сеть участка отбора) — проезд закрыт.
  blockedRects = [],
  // Общий реестр движения уровня (driver.js): роботы разных флотов не въезжают друг в друга.
  traffic = createTraffic(),
  // Челночная схема (shuttleFleet.js): вместо стеллажей — место стоянки
  // транспортировщика {stand, take, put}: погрузчик ставит груз на него / снимает.
  storageHub = null,
  // Погрузчики у зоны хранения: стеллажи — ближайшие rackLimit мест к точке rackNear.
  rackNear = null,
  rackLimit = 8,
  truckFactory = makeTruck,
  // Точки, которые не могут быть местом хранения (стоянки транспортировщиков и т. п.).
  reservedPoints = [],
}) {
  const allGates = computeGateClusters(shape);
  const gates = gateIds ? allGates.filter((gate) => gateIds.includes(gate.id)) : allGates;
  for (const gate of gates) {
    gate.truck = null;
    gate.truckTimer = TRUCK_GAP_MIN_S + Math.random() * (TRUCK_GAP_MAX_S - TRUCK_GAP_MIN_S);
  }

  const cargoFactory = createCargoFactory(cargo);
  const speedUnitsPerSec = speedMps / Math.max(1e-6, metersPerUnit);
  const loadSlowFactor = 1 - LOAD_SLOWDOWN * Math.min(1, cargoWeightKg / Math.max(1, capacityKg));

  const nav = makeNavGrid(shape);
  // Стоянки транспортировщиков — не проезд для погрузчиков.
  const bayParks = [storageHub?.park, ...Object.values(handoffs ?? {}).map((h) => h.park)].filter(Boolean);
  blockedRects = [...blockedRects, ...bayParks.map((p) => ({ x: p.x, z: p.z, halfX: 0.6, halfZ: 0.6 }))];
  for (let gz = 0; gz < nav.n; gz++) {
    for (let gx = 0; gx < nav.n; gx++) {
      const c = cellCenter(nav, gx, gz);
      const h = nav.cellSize / 2;
      if (blockedRects.some((r) => Math.abs(c.x - r.x) < r.halfX + h - 0.5 && Math.abs(c.z - r.z) < r.halfZ + h - 0.5)) {
        nav.walkable[gz * nav.n + gx] = 0;
      }
    }
  }
  const reserved = [
    ...reservedPoints,
    ...(storageHub ? [storageHub.park, storageHub.stand] : []),
    ...Object.values(handoffs ?? {}).flatMap((h) => (h.park ? [h.park, h.stand] : [])),
  ];
  const storage = collectStorage(shape, nav, gates, routeLengthM ? routeLengthM / Math.max(1e-6, metersPerUnit) : null)
    .filter((place) => !reserved.some((r) => Math.hypot(r.x - place.x, r.z - place.z) < 3.5))
    .map((place) => servicePoint(place));
  const driver = createDriver({ nav, traffic });
  const drivePath = driver.drive;
  const near = rackNear
    ? [...storage].sort((a, b) => Math.hypot(a.x - rackNear.x, a.z - rackNear.z) - Math.hypot(b.x - rackNear.x, b.z - rackNear.z)).slice(0, rackLimit)
    : null;
  // Одна точка передачи на конец ленты: погрузчики у неё — по очереди.
  const hubStops = new Map();
  const starts = [];

  const racksByGate = new Map(gates.map((gate) => [gate.id, []]));
  for (const place of storage) {
    racksByGate.get(nearestGateOf(place, gates).id).push(place);
  }
  // Ворота, к которым ни один стеллаж не ближе остальных, не простаивают:
  // берут ближайшие места хранения со всего склада.
  for (const gate of gates) {
    const own = racksByGate.get(gate.id);
    if (own.length || !storage.length) continue;
    const byDistance = [...storage].sort(
      (a, b) =>
        Math.hypot(a.x - gate.worldCenter.x, a.z - gate.worldCenter.z) - Math.hypot(b.x - gate.worldCenter.x, b.z - gate.worldCenter.z)
    );
    own.push(...byDistance.slice(0, Math.max(1, Math.ceil(storage.length / gates.length))));
  }

  const loaderCount = Math.min(count, Math.max(1, gates.length * LOADERS_PER_GATE));
  const loaders = gates.length ? Array.from({ length: loaderCount }, (_, i) => createLoader(i)) : [];

  // Точка у ворот для погрузчика: несколько на одних воротах встают рядом по ширине
  // проёма, чуть внутри склада, а не в одну точку.
  function gateStopOf(gate, slot, slots) {
    const inward = { x: -gate.normal[0], z: -gate.normal[1] };
    const along = { x: Math.abs(gate.normal[1]), z: Math.abs(gate.normal[0]) };
    const span = gate.worldSpan.max - gate.worldSpan.min;
    const offset = slots > 1 ? (slot / (slots - 1) - 0.5) * span * 0.6 : 0;
    return {
      x: gate.worldCenter.x + along.x * offset + inward.x * nav.cellSize * 0.5,
      z: gate.worldCenter.z + along.z * offset + inward.z * nav.cellSize * 0.5,
    };
  }

  function createLoader(index) {
    const gate = gates[index % gates.length];
    const slot = Math.floor(index / gates.length);
    const slots = Math.ceil((loaderCount - (index % gates.length)) / gates.length);
    const handoff = handoffs?.[gate.id];
    // Место стоянки транспортировщика (shuttleFleet) — тот же объект, что у его флота.
    if (handoff && !hubStops.has(handoff))
      hubStops.set(handoff, handoff.stand ?? servicePoint({ x: handoff.x, z: handoff.z, face: handoff.face }));
    const gateStop = handoff ? hubStops.get(handoff) : servicePoint(gateStopOf(gate, slot, slots));
    const model = robotFactory();
    // Стартуют на свободных клетках рядом с точкой — не в ней и не друг в друге.
    const start = freeStart(gateStop);

    model.group.position.set(start.x, 0, start.z);
    group.add(model.group);

    // Несколько погрузчиков на одних воротах начинают с разных стеллажей.
    const myRacks = storageHub ? [storageHub.stand] : near ?? racksByGate.get(gate.id);
    const loader = {
      model,
      gate,
      gateStop,
      // 'in' — выгрузка (ворота→стеллаж), иначе — загрузка (стеллаж→ворота). Двусторонние
      // ворота (стандартная форма) делят погрузчиков поровну на приёмку и отгрузку.
      kind: direction ?? (gate.kind === "generic" ? (index % 2 === 0 ? "in" : "out") : gate.kind),
      // У конца конвейера груз ждать не надо: его подаёт/забирает лента.
      viaConveyor: Boolean(handoff),
      handoff: handoff ?? null,
      myRacks,
      rackIndex: myRacks.length ? Math.floor((slot * myRacks.length) / Math.max(1, slots)) : 0,
      path: null,
      state: "idle",
      timer: 0,
      carrying: false,
      cargoUnit: null,
      meter: createEnergyMeter(energyProfile),
      pos: { x: start.x, z: start.z, heading: 0 },
      legTarget: null,
      rackTarget: null,
      forkLift: 0,
      forkTarget: 0,
    };
    traffic.add(loader);
    return loader;
  }

  // Свободная проезжая клетка у точки, подальше от уже занятых стартов и роботов.
  function freeStart(point) {
    const taken = [...starts, ...traffic.list().map((a) => a.pos)];
    let best = null;
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        if (!isWalkable(nav, gx, gz)) continue;
        const c = cellCenter(nav, gx, gz);
        const d = Math.hypot(c.x - point.x, c.z - point.z);
        // Не на самой точке и не там, куда смотрит погрузчик (лента, стоянка транспортировщика).
        const face = point.face ? Math.hypot(c.x - point.face.x, c.z - point.face.z) : Infinity;
        if (d < 3 || face < 4 || taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 4)) continue;
        if (!best || d < best.d) best = { d, x: c.x, z: c.z };
      }
    }
    const start = best ?? { x: point.x, z: point.z };
    starts.push(start);
    return start;
  }

  // Следующее место хранения, которое не занято другим погрузчиком.
  function nextRack(loader) {
    const list = loader.myRacks;
    for (let k = 0; k < list.length; k++) {
      const place = list[(loader.rackIndex + k) % list.length];
      if (!place.owner || place.owner === loader) {
        loader.rackIndex += k;
        return place;
      }
    }
    return list[loader.rackIndex % list.length];
  }

  function attachCargo(loader) {
    loader.carrying = true;
    loader.cargoUnit = cargoFactory.create();
    loader.cargoUnit.position.y = 0;
    loader.model.carry.add(loader.cargoUnit);
  }

  function detachCargo(loader) {
    loader.carrying = false;

    if (loader.cargoUnit) {
      loader.model.carry.remove(loader.cargoUnit);
      disposeTree(loader.cargoUnit);
      loader.cargoUnit = null;
    }
  }

  let cyclesOut = 0; // забрано со стеллажа и сдано в фуру (загрузка)
  let cyclesIn = 0; // забрано из фуры и поставлено на стеллаж (выгрузка)
  let simSeconds = 0;

  // Вилы едут к цели с паспортной скоростью подъёма; true — доехали.
  function moveFork(loader, dt) {
    const diff = loader.forkTarget - loader.forkLift;
    const stepSize = FORK_LIFT_SPEED * dt;
    loader.forkLift += Math.abs(diff) <= stepSize ? diff : Math.sign(diff) * stepSize;
    loader.model.setForkLift(loader.forkLift);
    return Math.abs(loader.forkTarget - loader.forkLift) < 1e-3;
  }

  // Ярус стеллажа для очередной паллеты: по кругу нижний–средний–верхний.
  const rackLift = (loader) => (loader.rackIndex % 3) * RACK_TIER_HEIGHT + FORK_CLEARANCE;
  const gateLift = (loader) => loader.handoff?.lift ?? (loader.viaConveyor ? BELT_HEIGHT : TRUCK_BED_HEIGHT);
  const travelLift = (loader) => (loader.carrying ? FORK_CARRY_LIFT : 0);

  // Операция у стеллажа, ленты или фуры — PAUSE_SECONDS, как в расчёте: вилы
  // поднимаются до нужной высоты, груз берут/ставят, вилы опускаются в
  // транспортное положение. Готово — когда прошло время и вилы опущены.
  // ready() — можно ли сейчас передать груз (фура у ворот, место на ленте).
  function handle(loader, dt, lift, ready, act) {
    if (!loader.acted) {
      loader.forkTarget = lift;
      const raised = moveFork(loader, dt);
      loader.timer += dt;
      if (!raised || loader.timer < PAUSE_SECONDS / 2 || !ready()) return false;
      act();
      loader.acted = true;
    }
    loader.forkTarget = travelLift(loader);
    loader.timer += dt;
    return moveFork(loader, dt) && loader.timer >= PAUSE_SECONDS;
  }

  function arrive(loader, state) {
    loader.state = state;
    loader.timer = 0;
    loader.acted = false;
  }

  function doneAtRack(loader) {
    driver.release(loader, loader.rackTarget);
    loader.rackTarget = null;
    loader.rackIndex++;
  }

  const truckReady = (loader) => loader.viaConveyor || loader.gate.truck?.state === "docked";

  function updateLoader(loader, dt) {
    if (loader.myRacks.length === 0) {
      loader.state = "idle";
      loader.meter.consume(dt, "idle");
      return;
    }

    const speed = speedUnitsPerSec * (loader.carrying ? loadSlowFactor : 1);
    const outbound = loader.kind !== "in";

    switch (loader.state) {
      case "idle":
        loader.state = outbound ? "toRack" : "toGateEmpty";
        break;

      // --- отгрузка: стеллаж → ворота (фура или лента отгрузки) ---
      case "toRack": {
        loader.meter.consume(dt, "work");
        const target = (loader.rackTarget ??= nextRack(loader));
        if (drivePath(loader, target, dt, speed)) arrive(loader, "atRackPickup");
        break;
      }

      case "atRackPickup": {
        loader.meter.consume(dt, "work");
        const hub = loader.rackTarget.hub;
        // С транспортировщика снимают, только когда он стоит на месте с грузом.
        if (handle(loader, dt, hub ? hub.lift : rackLift(loader), () => (hub ? hub.take() : true), () => attachCargo(loader))) {
          doneAtRack(loader);
          loader.state = "toGateDrop";
        }
        break;
      }

      case "toGateDrop":
        loader.meter.consume(dt, "work");
        if (drivePath(loader, loader.gateStop, dt, speed)) arrive(loader, "atGateDrop");
        break;

      case "atGateDrop":
        loader.meter.consume(dt, loader.acted || truckReady(loader) ? "work" : "idle");
        if (
          handle(
            loader,
            dt,
            gateLift(loader),
            // Ставим, когда у ворот фура, а у ленты отгрузки — когда в начале есть место.
            () => truckReady(loader) && (!loader.handoff?.put || loader.handoff.put()),
            () => {
              detachCargo(loader);
              if (loader.gate.truck) loader.gate.truck.exchanged++;
              cyclesOut++;
            }
          )
        ) {
          driver.release(loader, loader.gateStop);
          loader.state = "toRack";
        }
        break;

      // --- приёмка: ворота (фура или конец ленты приёмки) → стеллаж ---
      case "toGateEmpty":
        loader.meter.consume(dt, "work");
        if (drivePath(loader, loader.gateStop, dt, speed)) arrive(loader, "atGatePickup");
        break;

      case "atGatePickup":
        loader.meter.consume(dt, loader.acted || truckReady(loader) ? "work" : "idle");
        if (
          handle(
            loader,
            dt,
            gateLift(loader),
            // С ленты забирают паллету, что доехала до конца; нет её — ждём с поднятыми вилами.
            () => truckReady(loader) && (!loader.handoff?.take || loader.handoff.take()),
            () => {
              attachCargo(loader);
              if (loader.gate.truck) loader.gate.truck.exchanged++;
            }
          )
        ) {
          driver.release(loader, loader.gateStop);
          loader.state = "toRackDrop";
        }
        break;

      case "toRackDrop": {
        loader.meter.consume(dt, "work");
        const target = (loader.rackTarget ??= nextRack(loader));
        if (drivePath(loader, target, dt, speed)) arrive(loader, "atRackDrop");
        break;
      }

      case "atRackDrop": {
        loader.meter.consume(dt, "work");
        const hub = loader.rackTarget.hub;
        // На транспортировщик ставят, только когда он пустой стоит на месте.
        if (
          handle(loader, dt, hub ? hub.lift : rackLift(loader), () => (hub ? hub.put() : true), () => {
            detachCargo(loader);
            cyclesIn++;
          })
        ) {
          doneAtRack(loader);
          loader.state = "toGateEmpty";
        }
        break;
      }

      default:
        break;
    }
  }

  function spawnTruckFor(gate) {
    const model = truckFactory();
    const heading = headingZForward(gate.normal[0], gate.normal[1]); // кабина смотрит наружу — фура «пятится» к воротам
    const from = truckPointAt(gate, TRUCK_APPROACH_DISTANCE);
    const to = truckPointAt(gate, TRUCK_DOCK_DISTANCE);

    model.group.position.set(from.x, 0, from.z);
    model.group.rotation.y = heading;
    group.add(model.group);

    return {
      model,
      state: "arriving",
      from,
      to,
      t: 0,
      timer: 0,
      exchanged: 0,
      fade: createMaterializeFade(model.group, TRUCK_FADE_SECONDS),
    };
  }

  function removeTruck(gate) {
    const truck = gate.truck;
    group.remove(truck.model.group);
    truck.model.dispose();
    truck.fade.disposeMaterials();
    gate.truck = null;
    gate.truckTimer = TRUCK_GAP_MIN_S + Math.random() * (TRUCK_GAP_MAX_S - TRUCK_GAP_MIN_S);
  }

  function stepGateTruck(gate, dt) {
    if (!gate.truck) {
      gate.truckTimer -= dt;
      if (gate.truckTimer <= 0) gate.truck = spawnTruckFor(gate);
      return;
    }

    const truck = gate.truck;
    truck.fade.update(dt);

    if (truck.state === "arriving") {
      truck.t += dt;
      const p = Math.min(1, truck.t / TRUCK_DRIVE_SECONDS);
      truck.model.group.position.set(lerp(truck.from.x, truck.to.x, p), 0, lerp(truck.from.z, truck.to.z, p));

      if (p >= 1) {
        truck.state = "docked";
        truck.timer = 0;
        truck.model.setDoors(1);
      }
    } else if (truck.state === "docked") {
      truck.timer += dt;
      // С конвейером фуру разгружает/загружает лента — стоит минуту, погрузчики её не считают.
      if (truck.exchanged >= truckPayload || truck.timer >= (handoffs ? 60 : TRUCK_MAX_DOCKED_SECONDS)) {
        truck.state = "leaving";
        truck.t = 0;
        truck.model.setDoors(0);
        truck.fade.reverse(TRUCK_FADE_SECONDS);
      }
    } else if (truck.state === "leaving") {
      truck.t += dt;
      const p = Math.min(1, truck.t / TRUCK_DRIVE_SECONDS);
      truck.model.group.position.set(lerp(truck.to.x, truck.from.x, p), 0, lerp(truck.to.z, truck.from.z, p));

      if (p >= 1) removeTruck(gate);
    }
  }

  function step(dt) {
    simSeconds += dt;
    for (const loader of loaders) updateLoader(loader, dt);
    if (showTrucks) for (const gate of gates) stepGateTruck(gate, dt);
  }

  function getStats() {
    const hours = simSeconds / 3600;
    const cycles = cyclesIn + cyclesOut;
    const movedPerHour = hours > 0 ? Math.round(cycles / hours) : 0;

    return {
      phase: "mixed",
      cycles,
      storedKg: 0,
      fillPercent: 0,
      dockUnits: 0,
      trucksAtGates: gates.filter((g) => g.truck?.state === "docked").length,
      trucksWaiting: 0,
      trucksIn: 0,
      trucksOut: 0,
      receivedKg: Math.round(cyclesIn * cargoWeightKg),
      shippedKg: Math.round(cyclesOut * cargoWeightKg),
      movedPerHour,
      receivedPerHour: hours > 0 ? Math.round(cyclesIn / hours) : 0,
      shippedPerHour: hours > 0 ? Math.round(cyclesOut / hours) : 0,
      avgRouteM: driver.stats().routeLegs ? Math.round((driver.stats().routeUnits / driver.stats().routeLegs) * metersPerUnit) : 0,
      busyLoaders: loaders.filter((l) => l.state !== "idle").length,
    };
  }

  function dispose() {
    cargoFactory.dispose();

    for (const loader of loaders) {
      traffic.remove(loader);
      if (loader.cargoUnit) disposeTree(loader.cargoUnit);
      group.remove(loader.model.group);
      loader.model.dispose?.();
    }

    for (const gate of gates) {
      if (gate.truck) removeTruck(gate);
    }
  }

  return { step, getStats, dispose, meters: loaders.map((l) => l.meter) };
}
