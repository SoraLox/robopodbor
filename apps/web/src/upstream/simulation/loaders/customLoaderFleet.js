import { computeGateClusters } from "../shape/shapeGeometry.js";
import { cellCenter, cellOfPoint, findPath, isWalkable, makeNavGrid, pathLength } from "./gridPath.js";
import { CELL, cellAt, cellWorldOrigin } from "../shape/shapeTypes.js";
import { createCargoFactory } from "./cargo.js";
import { createEnergyMeter } from "../energy.js";
import { disposeTree, createMaterializeFade } from "../sceneUtils.js";
import { makeForkliftRobot } from "../robots/forkliftRobot.js";
import { makeTruck } from "../robots/truckRobot.js";
import { LOAD_SLOWDOWN } from "../constants.js";

// Работа вилами за цикл — 25 с, как в расчёте (warehouseEconomics loaderHandlingSeconds):
// половина у стеллажа, половина у ворот. Раньше было 1,4 с — сцена «обгоняла» расчёт.
const PAUSE_SECONDS = 12.5;
const FORK_LIFT_HEIGHT = 1.1;
const ARRIVE_EPS = 0.15;
const TURN_RATE = 6; // рад/с
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
const headingZForward = (dx, dz) => Math.atan2(dx, dz);

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
  const storage = collectStorage(shape, nav, gates, routeLengthM ? routeLengthM / Math.max(1e-6, metersPerUnit) : null);

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
    const gateStop = handoff
      ? { x: handoff.x + (slot - (slots - 1) / 2) * nav.cellSize * 0.5, z: handoff.z }
      : gateStopOf(gate, slot, slots);
    const model = robotFactory();

    model.group.position.set(gateStop.x, 0, gateStop.z);
    group.add(model.group);

    // Несколько погрузчиков на одних воротах начинают с разных стеллажей.
    const myRacks = racksByGate.get(gate.id);
    return {
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
      pos: { x: gateStop.x, z: gateStop.z },
      heading: 0,
      legTarget: null,
      legWaypoint: null,
    };
  }

  function placeAt(loader, x, z) {
    loader.pos.x = x;
    loader.pos.z = z;
    loader.model.group.position.set(x, 0, z);
  }

  function driveToward(loader, target, dt, speed) {
    const dx = target.x - loader.pos.x;
    const dz = target.z - loader.pos.z;
    const distance = Math.hypot(dx, dz);

    if (distance < ARRIVE_EPS) {
      placeAt(loader, target.x, target.z);
      return true;
    }

    const step = speed * dt;

    if (distance <= step) {
      placeAt(loader, target.x, target.z);
      return true;
    }

    loader.pos.x += (dx / distance) * step;
    loader.pos.z += (dz / distance) * step;
    loader.heading = turnToward(loader.heading, headingZForward(dx, dz), TURN_RATE * dt);
    placeAt(loader, loader.pos.x, loader.pos.z);
    loader.model.group.rotation.y = loader.heading;

    return false;
  }

  function turnToward(heading, target, maxTurn) {
    const diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
    return heading + (Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn);
  }

  let routeUnits = 0;
  let routeLegs = 0;

  // Едем к цели по пути A* (gridPath.js): путь строится один раз на новую цель.
  function drivePath(loader, target, dt, speed) {
    if (loader.legTarget !== target) {
      loader.legTarget = target;
      loader.path = findPath(nav, loader.pos, target);
      routeUnits += pathLength(loader.pos, loader.path);
      routeLegs += 1;
    }

    while (loader.path.length) {
      if (!driveToward(loader, loader.path[0], dt, speed)) return false;
      loader.path.shift();
    }

    // У стеллажа — повернуться к нему вилами.
    if (target.face) {
      const want = headingZForward(target.face.x - loader.pos.x, target.face.z - loader.pos.z);
      loader.heading = turnToward(loader.heading, want, TURN_RATE * dt);
      loader.model.group.rotation.y = loader.heading;
    }
    return true;
  }

  function attachCargo(loader) {
    loader.carrying = true;
    loader.model.setForkLift(FORK_LIFT_HEIGHT);
    loader.cargoUnit = cargoFactory.create();
    loader.cargoUnit.position.y = 0;
    loader.model.carry.add(loader.cargoUnit);
  }

  function detachCargo(loader) {
    loader.carrying = false;
    loader.model.setForkLift(0);

    if (loader.cargoUnit) {
      loader.model.carry.remove(loader.cargoUnit);
      disposeTree(loader.cargoUnit);
      loader.cargoUnit = null;
    }
  }

  let cyclesOut = 0; // забрано со стеллажа и сдано в фуру (загрузка)
  let cyclesIn = 0; // забрано из фуры и поставлено на стеллаж (выгрузка)
  let simSeconds = 0;

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

      // --- загрузка (GATE_OUT / generic): стеллаж → ворота → фура ---
      case "toRack": {
        loader.meter.consume(dt, "work");
        const target = loader.myRacks[loader.rackIndex % loader.myRacks.length];
        if (drivePath(loader, target, dt, speed)) {
          loader.state = "atRackPickup";
          loader.timer = 0;
        }
        break;
      }

      case "atRackPickup":
        loader.meter.consume(dt, "idle");
        loader.timer += dt;
        if (loader.timer >= PAUSE_SECONDS) {
          attachCargo(loader);
          loader.rackIndex++;
          loader.state = "toGateDrop";
        }
        break;

      case "toGateDrop":
        loader.meter.consume(dt, "work");
        if (drivePath(loader, loader.gateStop, dt, speed)) {
          loader.state = "atGateDrop";
          loader.timer = 0;
        }
        break;

      case "atGateDrop":
        loader.meter.consume(dt, "idle");
        if (!loader.viaConveyor && (!loader.gate.truck || loader.gate.truck.state !== "docked")) break; // ждём фуру

        loader.timer += dt;
        // У ленты отгрузки паллету ставят, только когда в начале ленты есть место.
        if (loader.timer >= PAUSE_SECONDS && (!loader.handoff?.put || loader.handoff.put())) {
          detachCargo(loader);
          if (loader.gate.truck) loader.gate.truck.exchanged++;
          cyclesOut++;
          loader.state = "toRack";
        }
        break;

      // --- выгрузка (GATE_IN): фура → ворота → стеллаж ---
      case "toGateEmpty":
        loader.meter.consume(dt, "work");
        if (drivePath(loader, loader.gateStop, dt, speed)) {
          loader.state = "atGatePickup";
          loader.timer = 0;
        }
        break;

      case "atGatePickup":
        loader.meter.consume(dt, "idle");
        if (!loader.viaConveyor && (!loader.gate.truck || loader.gate.truck.state !== "docked")) break; // ждём фуру

        loader.timer += dt;
        // С ленты приёмки забирают ту паллету, что доехала до конца, — нет её, ждём.
        if (loader.timer >= PAUSE_SECONDS && (!loader.handoff?.take || loader.handoff.take())) {
          attachCargo(loader);
          if (loader.gate.truck) loader.gate.truck.exchanged++;
          loader.state = "toRackDrop";
        }
        break;

      case "toRackDrop": {
        loader.meter.consume(dt, "work");
        const target = loader.myRacks[loader.rackIndex % loader.myRacks.length];
        if (drivePath(loader, target, dt, speed)) {
          loader.state = "atRackDrop";
          loader.timer = 0;
        }
        break;
      }

      case "atRackDrop":
        loader.meter.consume(dt, "idle");
        loader.timer += dt;
        if (loader.timer >= PAUSE_SECONDS) {
          detachCargo(loader);
          loader.rackIndex++;
          cyclesIn++;
          loader.state = "toGateEmpty";
        }
        break;

      default:
        break;
    }
  }

  function spawnTruckFor(gate) {
    const model = makeTruck();
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
      avgRouteM: routeLegs ? Math.round((routeUnits / routeLegs) * metersPerUnit) : 0,
      busyLoaders: loaders.filter((l) => l.state !== "idle").length,
    };
  }

  function dispose() {
    cargoFactory.dispose();

    for (const loader of loaders) {
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
