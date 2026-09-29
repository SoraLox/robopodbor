import { cellOfPoint, isWalkable } from "../loaders/gridPath.js";
import { servicePoint } from "../loaders/driver.js";
import { createBeltPath, BELT_TOP } from "../conveyors/beltPath.js";
import { createArmUnit } from "./armUnit.js";

// Станция приёмки (рекомендуемая схема):
//   фура → погрузчик ставит груз на кольцевой конвейер (карусель едет по кругу)
//   → роборука снимает с карусели и ставит на транспортировщика (они ждут в
//   очереди) → транспортировщик везёт к стеллажам → погрузчик ставит в стеллаж.
//
// Раскладка — вдоль стены с воротами приёмки, в полосе между воротами и
// стеллажами (координаты s — вдоль стены, w — вглубь склада от стены):
//   w0+12  верхняя сторона карусели — сюда ставят погрузчики от ворот;
//   w0+16  нижняя сторона — отсюда берут руки;
//   +R     руки;  +R — стоянки транспортировщиков; дальше — их проезд.

export const ARM_SCALE = 2.6; // рука крупнее — вровень с погрузчиком и стеллажом
const R = 4.6; // от основания руки до ленты и до стоянки, мир
const ARM_PITCH = 9.5;
const W_NORTH = 12;
const W_SOUTH = 16;
const LANE_CLEAR = 4;
export const DECK_HEIGHT = 0.7;

function frameOf(gates) {
  const g = gates[Math.floor(gates.length / 2)];
  const n = { x: -g.normal[0], z: -g.normal[1] };
  const a = { x: Math.abs(n.z), z: Math.abs(n.x) };
  const w0 = g.worldCenter.x * n.x + g.worldCenter.z * n.z;
  const world = (s, w) => ({ x: a.x * s + n.x * w, z: a.z * s + n.z * w });
  const sOf = (p) => p.x * a.x + p.z * a.z;
  return { n, a, w0, world, sOf };
}

// Раскладка станции или null, если в полосе у ворот её не поставить.
export function planInboundStation({ nav, gates, armCount }) {
  if (!gates.length || armCount <= 0) return null;
  const f = frameOf(gates);
  const ss = gates.map((g) => f.sOf(g.worldCenter));
  const sMin = Math.min(...ss) - 5;
  const sMax = Math.max(...ss) + 5;
  const wNorth = f.w0 + W_NORTH;
  const wSouth = f.w0 + W_SOUTH;
  const wArm = wSouth + R;
  const wPark = wArm + R;
  const wLane = wPark + LANE_CLEAR;

  // Вся полоса от карусели до проезда транспортировщиков — проезжий пол.
  const free = (s, w) => {
    const c = cellOfPoint(nav, f.world(s, w));
    return isWalkable(nav, c.gx, c.gz);
  };
  for (let s = sMin; s <= sMax; s += 2) {
    for (let w = wNorth - 6; w <= wLane; w += 2) if (!free(s, w)) return null;
  }

  const count = Math.max(1, Math.min(armCount, Math.floor((sMax - sMin - 4) / ARM_PITCH)));
  const arms = Array.from({ length: count }, (_, i) => {
    const s = sMin + 2 + ((i + 0.5) * (sMax - sMin - 4)) / count;
    return {
      base: f.world(s, wArm),
      pick: f.world(s, wSouth),
      park: f.world(s, wPark),
    };
  });
  // Кольцо: по верхней стороне — к одному краю, по нижней — обратно.
  const loop = [f.world(sMin, wNorth), f.world(sMax, wNorth), f.world(sMax, wSouth), f.world(sMin, wSouth)];
  // Точки, куда погрузчики ставят груз: напротив каждых ворот, погрузчик — со стороны ворот.
  const drops = gates.map((g) => {
    const s = f.sOf(g.worldCenter);
    return { at: f.world(s, wNorth), stand: f.world(s, wNorth - 4.8), gateId: g.id };
  });
  // Разгрузка у стеллажей (стоянка B): на проезде перед стеллажами, за краем
  // станции — транспортировщики не толкутся у стоянок под руками. Погрузчик
  // стоит дальше от станции, карманы B — ближе к стене с воротами.
  const rackBay = [1, -1]
    .map((side) => {
      const sPark = side > 0 ? sMax + 10 : sMin - 10;
      const spots = [
        [sPark, wLane],
        [sPark + side * 4.5, wLane],
        [sPark, wLane - 6],
        [sPark - side * 6, wLane - 6],
      ];
      if (!spots.every(([s, w]) => free(s, w))) return null;
      return {
        park: f.world(sPark, wLane),
        stand: f.world(sPark + side * 4.5, wLane),
        holds: [f.world(sPark, wLane - 6), f.world(sPark - side * 6, wLane - 6)],
      };
    })
    .find(Boolean);
  if (!rackBay) return null;
  // Карманы ожидания у стоянок под руками — у концов их ряда.
  const holds = [f.world(sMin - 3, wPark), f.world(sMax + 3, wPark)];
  return { loop, arms, drops, holds, rackBay, dirToBelt: { x: -f.n.x, z: -f.n.z }, dirToPark: f.n, requested: armCount };
}

// Что станция занимает на полу — для объезда мобильными роботами (до её создания).
export function stationObstacles(plan) {
  const rects = [];
  const pts = [...plan.loop, plan.loop[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    rects.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, halfX: Math.abs(b.x - a.x) / 2 + 2.1, halfZ: Math.abs(b.z - a.z) / 2 + 2.1 });
  }
  for (const arm of plan.arms) rects.push({ x: arm.base.x, z: arm.base.z, halfX: 2.2, halfZ: 2.2 });
  return rects;
}

// Карусель, руки и точки передачи. loadBays — стоянки транспортировщиков под
// руками (shuttleFleet создаёт их по plan.arms[i].park); rigFactory — модель руки.
export function createInboundStation({ group, plan, beltTexture, rigFactory, opsPerMinute, energyProfile, itemHeight, loadBays }) {
  const belt = createBeltPath({ group, points: plan.loop, closed: true, speed: 1.4, width: 3, spacing: 3.4, beltTexture });

  const units = plan.arms.map((spot, i) => {
    const rig = rigFactory();
    rig.group.position.set(spot.base.x, 0, spot.base.z);
    rig.group.scale.setScalar(ARM_SCALE);
    group.add(rig.group);
    const bay = loadBays[i];
    let unitRef = null;
    const pick = belt.addPickPoint(belt.project(spot.pick), () => unitRef?.readyToPick() ?? false);
    unitRef = createArmUnit({
      rig,
      scale: ARM_SCALE,
      from: { dir: plan.dirToBelt, radius: R, height: () => BELT_TOP + itemHeight, pick },
      to: {
        dir: plan.dirToPark,
        radius: R,
        height: () => DECK_HEIGHT + itemHeight,
        ready: () => bay.readyForArm(),
        put: (unit) => bay.put(unit),
      },
      opsPerMinute,
      energyProfile,
      itemHeight,
    });
    return { rig, unit: unitRef };
  });

  // Точки, куда погрузчики ставят груз на карусель (storageHub для customLoaderFleet).
  const drops = plan.drops.map((drop) => {
    const d = belt.project(drop.at);
    return {
      gateId: drop.gateId,
      lift: BELT_TOP,
      adopts: true,
      stand: servicePoint({ x: drop.stand.x, z: drop.stand.z, face: drop.at }),
      put: (unit) => belt.put(unit, d),
      take: () => null,
    };
  });
  for (const drop of drops) drop.stand.hub = drop;

  function step(dt) {
    belt.step(dt);
    for (const u of units) u.unit.step(dt);
  }

  function dispose() {
    belt.dispose();
    for (const u of units) group.remove(u.rig.group);
  }

  return {
    step,
    dispose,
    drops,
    obstacles: [
      ...belt.obstacles,
      ...plan.arms.map((a) => ({ x: a.base.x, z: a.base.z, halfX: 2.2, halfZ: 2.2 })),
    ],
    meters: units.map((u) => u.unit.meter),
    getOpsDone: () => units.reduce((sum, u) => sum + u.unit.getOps(), 0),
    armsShown: units.length,
  };
}
