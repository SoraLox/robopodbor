import * as THREE from "three";
import { makeStorageCubeRobot } from "../robots/storageCubeRobot.js";
import { makeStorageShuttle, makeCarriedCrate } from "../robots/storageShuttleRobot.js";
import { createEnergyMeter } from "../energy.js";
import { disposeTree } from "../sceneUtils.js";
import { WALL_HEIGHT } from "../layout.js";

const CUBE_SCALE = 2.4;
const SHUTTLE_CLEARANCE = 0.35; // насколько шаттл едет выше макушек башен, чтобы не проваливаться в геометрию
const SHUTTLE_SPEED = 2.2; // ед. сцены/с — переезд между башнями
const RISE_SECONDS = 2.2; // подъём/спуск коробки внутри шахты
const AT_TOWER_PAUSE_S = 0.6;
const INWARD_STEP = 10; // насколько сетка отступает от ворот внутрь помещения
const BOX_RISE_LOCAL = 1.4; // локальный ход узла "БОКС" вверх — визуально подобранное значение, см. createTower

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// СтойкаБокс, версия 3: плотная сетка стационарных башен, по которой ездят
// шаттлы-роботы (как в настоящем AutoStore). Башни — ёмкость хранения, их
// число задаёт towerCount (из паллетомест паспорта, в сцене не больше
// MAX_TOWERS); шаттлы — роботы расчёта, их count. Раньше count задавал башни,
// а шаттл был один на всех — число роботов в расчёте и в сцене расходилось.
// Шаттл забирает коробку из башни с грузом и везёт в пустую; одну башню не
// берут два шаттла сразу. Пропускная способность в статистике — по реальным
// циклам шаттлов.
export const MAX_TOWERS = 64;

export function createStorageCubeFleet({ group, gates, area, count, towerCount, energyProfile }) {
  const anchor = anchorOf(gates);
  const wanted = Math.max(2, Math.min(MAX_TOWERS, Math.round(towerCount ?? count * 6)));
  // Шаг сетки — по габариту модели башни; сетка растёт от ворот внутрь склада и
  // не выходит за свободный пол (раньше центрировалась на воротах и половиной
  // стояла за стеной). Сколько не помещается — не рисуем.
  const span = towerSpan();
  const grid = gridOf(wanted, span, anchor, area);
  const towers = gates.length ? grid.cells.map((cell) => createTower(cell)) : [];

  // Кому изначально есть что везти: часть башен стартует с коробкой, часть
  // пустая — иначе шаттлу не из чего/некуда было бы возить с самого начала.
  for (let i = 0; i < towers.length; i++) {
    const hasBox = towers.length < 2 ? true : i % 5 !== 4; // примерно 4 из 5 полны, минимум одна пустая
    setTowerBox(towers[i], hasBox, towers[i].restY);
  }

  const topY = towers.length ? Math.max(...towers.map((t) => t.topWorldY)) : 0;
  const shuttles = towers.length
    ? Array.from({ length: Math.max(1, count) }, (_, i) => {
        const model = makeStorageShuttle();
        const start = towers[Math.floor((i * towers.length) / Math.max(1, count))];
        model.position.set(start.x, topY + SHUTTLE_CLEARANCE, start.z);
        group.add(model);
        return { model, state: "idle", t: 0, source: null, dest: null, crate: null, from: null, duration: 0, meter: createEnergyMeter(energyProfile) };
      })
    : [];

  function anchorOf(gateList) {
    if (!gateList.length) return { x: 0, z: 0, inward: { x: 0, z: -1 } };
    const gate = gateList[0];
    const [nx, nz] = gate.normal;
    return { x: gate.worldCenter.x, z: gate.worldCenter.z, inward: { x: -nx, z: -nz } };
  }

  function towerSpan() {
    const probe = makeStorageCubeRobot();
    probe.scale.setScalar(CUBE_SCALE);
    const node = probe.getObjectByName("БОКС");
    // Габариты каркаса без узла "БОКС": в исходном файле он стоит в стороне
    // от остальной модели на много единиц ниже (похоже на огрех самого
    // файла) — если мерить границы вместе с ним, вся башня (и, значит, высота
    // езды шаттла) улетает на десятки единиц вверх.
    if (node) node.visible = false;
    let box = new THREE.Box3().setFromObject(probe);
    // Башня не выше стен склада: исходный масштаб давал башни втрое выше здания.
    const scale = CUBE_SCALE * Math.min(1, (WALL_HEIGHT * 0.9) / Math.max(0.1, box.max.y));
    probe.scale.setScalar(scale);
    probe.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(probe);
    return {
      scale,
      x: Math.max(0.1, box.max.x - box.min.x) + 0.05,
      z: Math.max(0.1, box.max.z - box.min.z) + 0.05,
      top: box.max.y,
    };
  }

  // Места башен: вдоль стены ворот (along) и вглубь склада (inward), в пределах area.
  function gridOf(total, size, anchorPoint, bounds) {
    const inward = anchorPoint.inward;
    const along = { x: Math.abs(inward.z), z: Math.abs(inward.x) };
    const stepAlong = along.x ? size.x : size.z;
    const stepIn = inward.x ? size.x : size.z;
    const margin = 2;
    const b = bounds ?? { xMin: -50, xMax: 50, zMin: -50, zMax: 50 };
    const alongMin = (along.x ? b.xMin : b.zMin) + margin;
    const alongMax = (along.x ? b.xMax : b.zMax) - margin;
    const start = { x: anchorPoint.x + inward.x * INWARD_STEP, z: anchorPoint.z + inward.z * INWARD_STEP };
    // Сколько рядов влезает вглубь до противоположного края свободного пола.
    const depthLimit = inward.x
      ? (inward.x > 0 ? b.xMax - start.x : start.x - b.xMin)
      : (inward.z > 0 ? b.zMax - start.z : start.z - b.zMin);
    const maxRows = Math.max(1, Math.floor((depthLimit - margin) / stepIn));
    const maxCols = Math.max(1, Math.floor((alongMax - alongMin) / stepAlong));
    const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(total))));
    const rows = Math.min(maxRows, Math.ceil(total / cols));
    const centerAlong = Math.min(
      alongMax - (cols * stepAlong) / 2,
      Math.max(alongMin + (cols * stepAlong) / 2, along.x ? anchorPoint.x : anchorPoint.z)
    );
    const cells = [];
    for (let i = 0; i < Math.min(total, cols * rows); i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const a = centerAlong + (col - (cols - 1) / 2) * stepAlong;
      const d = (row + 0.5) * stepIn;
      cells.push({
        x: along.x ? a : start.x + inward.x * d,
        z: along.x ? start.z + inward.z * d : a,
      });
    }
    return { cells };
  }

  function createTower(cell) {
    const model = makeStorageCubeRobot();
    model.scale.setScalar(span.scale);
    group.add(model);
    const node = model.getObjectByName("БОКС") ?? null;
    model.position.set(cell.x, 0, cell.z);
    const restY = node ? node.position.y : 0;
    const localTopY = restY + BOX_RISE_LOCAL;
    return { model, node, restY, localTopY, topWorldY: span.top, x: cell.x, z: cell.z, hasBox: true };
  }

  function setTowerBox(tower, hasBox, atLocalY) {
    tower.hasBox = hasBox;
    if (tower.node) {
      tower.node.visible = hasBox;
      tower.node.position.y = atLocalY;
    }
  }

  let cyclesDone = 0;
  let simSeconds = 0;

  // Башни, которые сейчас обслуживает какой-то шаттл, — не отдаём второму.
  const busy = new Set();

  function pickPair() {
    const withBox = towers.filter((t) => t.hasBox && !busy.has(t));
    const empty = towers.filter((t) => !t.hasBox && !busy.has(t));
    if (!withBox.length || !empty.length) return null;

    return {
      source: withBox[Math.floor(Math.random() * withBox.length)],
      dest: empty[Math.floor(Math.random() * empty.length)],
    };
  }

  function travelDuration(from, to) {
    return Math.max(0.2, Math.hypot(to.x - from.x, to.z - from.z) / SHUTTLE_SPEED);
  }

  function startTravel(shuttle, to) {
    shuttle.from = { x: shuttle.model.position.x, z: shuttle.model.position.z };
    shuttle.duration = travelDuration(shuttle.from, to);
    shuttle.t = 0;
  }

  function stepShuttle(shuttle, dt) {
    shuttle.meter.consume(dt, shuttle.state === "idle" || shuttle.state === "atRestPause" ? "idle" : "work");
    shuttle.t += dt;

    switch (shuttle.state) {
      case "idle": {
        const pair = pickPair();
        if (!pair) break;
        shuttle.source = pair.source;
        shuttle.dest = pair.dest;
        busy.add(pair.source);
        busy.add(pair.dest);
        shuttle.state = "toSource";
        startTravel(shuttle, shuttle.source);
        break;
      }

      case "toSource": {
        const p = Math.min(1, shuttle.t / shuttle.duration);
        shuttle.model.position.x = lerp(shuttle.from.x, shuttle.source.x, p);
        shuttle.model.position.z = lerp(shuttle.from.z, shuttle.source.z, p);
        if (p >= 1) {
          shuttle.state = "boxUp";
          shuttle.t = 0;
        }
        break;
      }

      case "boxUp": {
        const source = shuttle.source;
        const p = Math.min(1, shuttle.t / RISE_SECONDS);
        if (source.node) source.node.position.y = lerp(source.restY, source.localTopY, p);
        if (p >= 1) {
          setTowerBox(source, false, source.restY);
          busy.delete(source);
          shuttle.crate = makeCarriedCrate(pickCrateColor(cyclesDone));
          shuttle.crate.position.y = 0.05;
          shuttle.model.add(shuttle.crate);
          shuttle.state = "toDest";
          startTravel(shuttle, shuttle.dest);
        }
        break;
      }

      case "toDest": {
        const p = Math.min(1, shuttle.t / shuttle.duration);
        shuttle.model.position.x = lerp(shuttle.from.x, shuttle.dest.x, p);
        shuttle.model.position.z = lerp(shuttle.from.z, shuttle.dest.z, p);
        if (p >= 1) {
          if (shuttle.crate) {
            shuttle.model.remove(shuttle.crate);
            disposeTree(shuttle.crate);
            shuttle.crate = null;
          }
          setTowerBox(shuttle.dest, true, shuttle.dest.localTopY);
          shuttle.state = "boxDown";
          shuttle.t = 0;
        }
        break;
      }

      case "boxDown": {
        const dest = shuttle.dest;
        const p = Math.min(1, shuttle.t / RISE_SECONDS);
        if (dest.node) dest.node.position.y = lerp(dest.localTopY, dest.restY, p);
        if (p >= 1) {
          cyclesDone += 1;
          busy.delete(dest);
          shuttle.source = null;
          shuttle.dest = null;
          shuttle.state = "atRestPause";
          shuttle.t = 0;
        }
        break;
      }

      case "atRestPause": {
        if (shuttle.t >= AT_TOWER_PAUSE_S) {
          shuttle.state = "idle";
          shuttle.t = 0;
        }
        break;
      }

      default:
        break;
    }
  }

  function step(dt) {
    simSeconds += dt;
    for (const shuttle of shuttles) stepShuttle(shuttle, dt);
  }

  function pickCrateColor(seed) {
    const keys = ["crateA", "crateB", "crateC"];
    return keys[seed % keys.length];
  }

  function getStats() {
    const hours = simSeconds / 3600;
    return {
      phase: "storage",
      cycles: cyclesDone,
      storedKg: 0,
      fillPercent: towers.length ? Math.round((towers.filter((t) => t.hasBox).length / towers.length) * 100) : 0,
      dockUnits: 0,
      trucksAtGates: 0,
      trucksWaiting: 0,
      trucksIn: 0,
      trucksOut: 0,
      receivedKg: 0,
      shippedKg: 0,
      movedPerHour: hours > 0 ? Math.round(cyclesDone / hours) : 0,
      receivedPerHour: 0,
      shippedPerHour: 0,
      avgRouteM: 0,
      busyLoaders: shuttles.filter((sh) => sh.state !== "idle" && sh.state !== "atRestPause").length,
    };
  }

  function dispose() {
    for (const tower of towers) {
      group.remove(tower.model);
      disposeTree(tower.model);
    }
    for (const shuttle of shuttles) {
      if (shuttle.crate) disposeTree(shuttle.crate);
      group.remove(shuttle.model);
      disposeTree(shuttle.model);
    }
  }

  return {
    step,
    getStats,
    dispose,
    meters: shuttles.map((sh) => sh.meter),
    payload: 1,
    storageCapacityUnits: 0,
  };
}
