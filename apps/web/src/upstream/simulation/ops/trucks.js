import { makeTruck } from "../robots/truckRobot.js";
import { createMaterializeFade } from "../sceneUtils.js";
import { cellCenter, cellOfPoint } from "../loaders/gridPath.js";

// Ворота связи: фура и «горка» груза перед проёмом.
//   Приёмка: фура встаёт к воротам, коробки по одной вылетают из неё и ложатся
//   горкой перед входом; погрузчики разбирают горку. Пустая фура уезжает.
//   Отгрузка: погрузчики ставят паллеты в горку у ворот; пришедшая фура забирает
//   их по одной; полная — уезжает.
// Горка занимает одну клетку у проёма: 3 × 2 места в 2 яруса; погрузчик подъезжает
// к ней из соседней клетки со стороны склада, вилами к нужному столбику.

const DOCK = 3.2;
const APPROACH = 16;
const DRIVE_S = 3.5;
const GAP_MIN = 3;
const GAP_MAX = 6;
const FADE = 1.2;
const PILE_SIDE = [-1.3, 0, 1.3]; // столбики горки поперёк проёма
const PILE_DEPTH = [-0.6, 0.6]; // ряды горки
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
    // Клетка горки — вторая от стены; центр горки — центр клетки.
    const pileCell = cellOfPoint(nav, at(gate, -nav.cellSize * 1.5));
    const center = cellCenter(nav, pileCell.gx, pileCell.gz);
    const point = (depth, side) => ({ x: center.x + inward.x * depth + along.x * side, z: center.z + inward.z * depth + along.z * side });
    const slots = [];
    for (let layer = 0; layer < 2; layer++) {
      for (const depth of PILE_DEPTH) {
        for (const side of PILE_SIDE) {
          const p = point(depth, side);
          slots.push({ x: p.x, y: layer * unitHeight, z: p.z, side, layer, unit: null, reserved: false, ready: false });
        }
      }
    }
    const heading = Math.atan2(gate.normal[0], gate.normal[1]);
    // У каждого столбика — своя поза: погрузчик в соседней клетке, вилы напротив столбика.
    const standCell = { gx: pileCell.gx + Math.round(inward.x), gz: pileCell.gz + Math.round(inward.z) };
    const spotOf = (side) => {
      const front = point(PILE_DEPTH[1], side);
      return { gx: standCell.gx, gz: standCell.gz, pose: { x: front.x + inward.x * reach, z: front.z + inward.z * reach, heading } };
    };
    const sideSpots = new Map(PILE_SIDE.map((side) => [side, spotOf(side)]));
    for (const s of slots) s.spot = sideSpots.get(s.side);
    const pileCells = [[pileCell.gx, pileCell.gz]];
    return {
      gate,
      label: `горка у ворот ${gate.id + 1}`,
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

  const freeSlot = (bay) => bay.slots.find((s) => !s.unit && !s.reserved && (s.layer === 0 || bay.slots.some((b) => b.layer === 0 && !b.reserved && b.unit && Math.hypot(b.x - s.x, b.z - s.z) < 0.1)));
  // Груз в горке, который можно взять: верхний ярус первым.
  const covered = (bay, s) => bay.slots.some((o) => o.layer > s.layer && (o.unit || o.reserved) && Math.hypot(o.x - s.x, o.z - s.z) < 0.1);
  const topUnit = (bay) => [...bay.slots].sort((a, b) => b.layer - a.layer).find((s) => s.unit && s.ready && !s.reserved && !covered(bay, s)) ?? null;
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
          const slot = freeSlot(bay);
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
          const slot = topUnit(bay);
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
    claimUnit() {
      for (const bay of bays) {
        const slot = topUnit(bay);
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
    claimSlot() {
      for (const bay of bays) {
        const slot = freeSlot(bay);
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
