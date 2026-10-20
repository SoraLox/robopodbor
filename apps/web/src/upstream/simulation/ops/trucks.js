import { makeTruck } from "../robots/truckRobot.js";
import { createMaterializeFade } from "../sceneUtils.js";
import { cellCenter, cellOfPoint, isWalkable } from "../loaders/gridPath.js";

// Ворота связи: фура и «горка» груза перед проёмом.
//   Приёмка: фура встаёт к воротам, коробки по одной вылетают из неё и ложатся
//   горкой перед входом; погрузчики разбирают горку. Пустая фура уезжает.
//   Отгрузка: погрузчики ставят паллеты в горку у ворот; пришедшая фура забирает
//   их по одной; полная — уезжает.
// Горка — две клетки сразу за проёмом: в каждой 2 паллеты вглубь × 2 яруса;
// погрузчик подъезжает из соседней клетки со стороны склада, вилами к столбику.

const DOCK = 3.2;
const APPROACH = 16;
const DRIVE_S = 3.5;
const GAP_MIN = 3;
const GAP_MAX = 6;
const FADE = 1.2;
const UNLOAD_EVERY_S = 1.4; // одна коробка из фуры / в фуру
const FLY_S = 0.9;

const at = (gate, d, side = 0) => {
  const along = { x: Math.abs(gate.normal[1]), z: Math.abs(gate.normal[0]) };
  return {
    x: gate.worldCenter.x + gate.normal[0] * d + along.x * side,
    z: gate.worldCenter.z + gate.normal[1] * d + along.z * side,
  };
};

export function createTruckYard({ group, gates, payload, direction, nav, reach, unitHeight, cargoFactory, tweens, truckFactory = makeTruck }) {
  const inbound = direction === "in";
  const bays = gates.map((gate, i) => {
    const inward = { x: -gate.normal[0], z: -gate.normal[1] };
    const along = { x: Math.abs(gate.normal[1]), z: Math.abs(gate.normal[0]) };
    const step = { gx: Math.round(along.x), gz: Math.round(along.z) };
    // Горка — сразу за проёмом: первая клетка внутри и соседняя вдоль стены
    // (к центру ворот). В каждой клетке — столбик: 2 паллеты вглубь × 2 яруса.
    const first = cellOfPoint(nav, at(gate, -nav.cellSize * 0.5));
    const c0 = cellCenter(nav, first.gx, first.gz);
    const toGate = (gate.worldCenter.x - c0.x) * along.x + (gate.worldCenter.z - c0.z) * along.z;
    const sides = toGate >= 0 ? [1, -1] : [-1, 1];
    const free = (c) => isWalkable(nav, c.gx, c.gz);
    const second = sides.map((d) => ({ gx: first.gx + step.gx * d, gz: first.gz + step.gz * d })).find(free);
    const columns = [first, ...(second ? [second] : [])].filter(free);
    const heading = Math.atan2(gate.normal[0], gate.normal[1]);
    const rowGap = (cargoFactory.depth ?? 1.8) / 2 + 0.06;
    const slots = [];
    const sideSpots = new Map();
    columns.forEach((cell, col) => {
      const center = cellCenter(nav, cell.gx, cell.gz);
      // Погрузчик — в соседней клетке со стороны склада, вилами к ближнему ряду.
      const front = { x: center.x + inward.x * rowGap, z: center.z + inward.z * rowGap };
      sideSpots.set(col, {
        gx: cell.gx + Math.round(inward.x),
        gz: cell.gz + Math.round(inward.z),
        pose: { x: front.x + inward.x * reach, z: front.z + inward.z * reach, heading },
      });
      for (let layer = 0; layer < 2; layer++) {
        for (const depth of [rowGap, -rowGap]) {
          slots.push({
            x: center.x + inward.x * depth,
            y: layer * unitHeight,
            z: center.z + inward.z * depth,
            side: col,
            layer,
            unit: null,
            reserved: false,
            ready: false,
            front: depth > 0,
            spot: sideSpots.get(col),
          });
        }
      }
    });
    const pileCells = columns.map((c) => [c.gx, c.gz]);
    return {
      gate,
      label: `груз у ворот ${gate.id + 1}`,
      slots,
      pileCells,
      sideSpots,
      truck: null,
      timer: GAP_MIN * (i + 1) * 0.5,
      unloadTimer: 0,
    };
  });

  function spawn(bay) {
    const model = truckFactory();
    const from = at(bay.gate, APPROACH);
    const to = at(bay.gate, DOCK);
    model.group.position.set(from.x, 0, from.z);
    model.group.rotation.y = Math.atan2(bay.gate.normal[0], bay.gate.normal[1]);
    group.add(model.group);
    bay.truck = { model, from, to, state: "arriving", t: 0, pallets: inbound ? payload : 0, fade: createMaterializeFade(model.group, FADE) };
  }

  // Горка разбирается и собирается по-честному: верхний ярус — первым, дальний ряд
  // доступен со стороны склада, только когда ближний ряд столбика пуст (и наоборот
  // со стороны фуры).
  const busy = (s) => s.unit || s.reserved;
  const sameColumn = (a, b) => a.side === b.side;
  const below = (bay, s) => bay.slots.find((o) => o.layer === s.layer - 1 && o.front === s.front && sameColumn(o, s));
  const covered = (bay, s) => bay.slots.some((o) => o.layer > s.layer && o.front === s.front && sameColumn(o, s) && busy(o));
  const rowEmpty = (bay, s, front) => !bay.slots.some((o) => o.front === front && sameColumn(o, s) && busy(o));
  const supported = (bay, s) => s.layer === 0 || Boolean(below(bay, s)?.unit && !below(bay, s)?.reserved);
  const byLayer = (list, dir) => [...list].sort((a, b) => dir * (a.layer - b.layer));
  // Куда положить. Фура — от проёма: сначала дальний (у ворот) ряд; погрузчик —
  // дальний ряд только через пустой ближний.
  const freeSlot = (bay, fromTruck) => {
    const ok = (s) =>
      !busy(s) &&
      supported(bay, s) &&
      (fromTruck || (s.front ? !bay.slots.some((o) => !o.front && sameColumn(o, s) && o.reserved) : rowEmpty(bay, s, true)));
    return byLayer(bay.slots.filter((s) => !s.front && ok(s)), 1)[0] ?? byLayer(bay.slots.filter((s) => s.front && ok(s)), 1)[0] ?? null;
  };
  // Что взять. Погрузчик — ближний ряд сверху; фура — дальний ряд сверху.
  const takeable = (bay, fromTruck) => {
    const ok = (s) => s.unit && s.ready && !s.reserved && !covered(bay, s);
    const near = bay.slots.filter((s) => s.front !== fromTruck && ok(s));
    const far = bay.slots.filter((s) => s.front === fromTruck && ok(s) && rowEmpty(bay, s, !fromTruck));
    return byLayer(near, -1)[0] ?? byLayer(far, -1)[0] ?? null;
  };
  const doorPoint = (bay) => ({ ...at(bay.gate, 1.5), y: 1.2 });

  function stepTruck(bay, dt) {
    const truck = bay.truck;
    if (!truck) {
      bay.timer -= dt;
      if (bay.timer <= 0) spawn(bay);
      return;
    }
    truck.fade.update(dt);
    if (truck.state === "arriving") {
      truck.t += dt;
      const p = Math.min(1, truck.t / DRIVE_S);
      truck.model.group.position.set(truck.from.x + (truck.to.x - truck.from.x) * p, 0, truck.from.z + (truck.to.z - truck.from.z) * p);
      if (p >= 1) {
        truck.state = "docked";
        truck.model.setDoors?.(1);
      }
      return;
    }
    if (truck.state === "docked") {
      bay.unloadTimer -= dt;
      if (bay.unloadTimer <= 0) {
        bay.unloadTimer = UNLOAD_EVERY_S;
        if (inbound && truck.pallets > 0) {
          // Коробка вылетает из фуры и ложится в горку.
          const slot = freeSlot(bay, true);
          if (slot) {
            const unit = cargoFactory.create();
            const door = doorPoint(bay);
            unit.position.set(door.x, door.y, door.z);
            group.add(unit);
            slot.unit = unit;
            slot.ready = false;
            truck.pallets -= 1;
            tweens.move(unit, group, { x: slot.x, y: slot.y, z: slot.z, rotY: Math.atan2(bay.gate.normal[0], bay.gate.normal[1]) }, FLY_S, {
              arc: 2.5,
              onDone: () => {
                slot.ready = true;
              },
            });
          }
        } else if (!inbound && truck.pallets < payload) {
          // Паллета из горки улетает в фуру.
          const slot = takeable(bay, true);
          if (slot) {
            const unit = slot.unit;
            slot.unit = null;
            slot.ready = false;
            truck.pallets += 1;
            const door = doorPoint(bay);
            tweens.move(unit, group, { x: door.x, y: door.y, z: door.z }, FLY_S, { arc: 2.5, onDone: () => unit.removeFromParent() });
          }
        }
      }
      const done = inbound ? truck.pallets <= 0 : truck.pallets >= payload;
      if (done) {
        truck.state = "leaving";
        truck.t = 0;
        truck.model.setDoors?.(0);
        truck.fade.reverse(FADE);
      }
      return;
    }
    truck.t += dt;
    const p = Math.min(1, truck.t / DRIVE_S);
    truck.model.group.position.set(truck.to.x + (truck.from.x - truck.to.x) * p, 0, truck.to.z + (truck.from.z - truck.to.z) * p);
    if (p >= 1) {
      group.remove(truck.model.group);
      truck.model.dispose?.();
      truck.fade.disposeMaterials?.();
      bay.truck = null;
      bay.timer = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    }
  }

  return {
    bays,
    payload,
    step(dt) {
      for (const bay of bays) stepTruck(bay, dt);
    },
    // Приёмка: горка, где есть груз для нового задания (закрепляется за ним).
    claimUnit(only = null) {
      for (const bay of only ? [only] : bays) {
        const slot = takeable(bay, false);
        if (slot) {
          slot.reserved = true;
          return { bay, slot };
        }
      }
      return null;
    },
    // Снять закреплённый груз с горки (погрузчик подцепил).
    takeUnit(claim) {
      const unit = claim.slot.unit;
      claim.slot.unit = null;
      claim.slot.reserved = false;
      claim.slot.ready = false;
      return unit;
    },
    // Отгрузка: место в горке под паллету задания.
    claimSlot(only = null) {
      for (const bay of only ? [only] : bays) {
        const slot = freeSlot(bay, false);
        if (slot) {
          slot.reserved = true;
          return { bay, slot };
        }
      }
      return null;
    },
    // Погрузчик ставит паллету в горку — плавно, на своё место.
    putUnit(claim, unit) {
      const { slot, bay } = claim;
      slot.unit = unit;
      slot.reserved = false;
      slot.ready = false;
      tweens.move(unit, group, { x: slot.x, y: slot.y, z: slot.z, rotY: Math.atan2(bay.gate.normal[0], bay.gate.normal[1]) }, 0.7, {
        onDone: () => {
          slot.ready = true;
        },
      });
      return true;
    },
    pileCells: () => bays.flatMap((b) => b.pileCells),
    trucksAtGates: () => bays.filter((b) => b.truck?.state === "docked").length,
    dispose() {
      for (const bay of bays) {
        if (bay.truck) {
          group.remove(bay.truck.model.group);
          bay.truck.model.dispose?.();
        }
        for (const s of bay.slots) s.unit?.removeFromParent();
      }
    },
  };
}
