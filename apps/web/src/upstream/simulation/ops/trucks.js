import { makeTruck } from "../robots/truckRobot.js";
import { createMaterializeFade } from "../sceneUtils.js";
import { servicePoint } from "../loaders/driver.js";

// Фуры у ворот связи. Приёмка: фура привозит payload паллет, погрузчики их
// снимают; пустая — уезжает. Отгрузка: фура ждёт payload паллет; полная — уезжает.
// Следующая подъезжает через несколько секунд.

const DOCK = 3.2;
const APPROACH = 16;
const DRIVE_S = 3.5;
const GAP_MIN = 3;
const GAP_MAX = 6;
const FADE = 1.2;

const pointAt = (gate, d) => ({ x: gate.worldCenter.x + gate.normal[0] * d, z: gate.worldCenter.z + gate.normal[1] * d });

export function createTruckYard({ group, gates, payload, direction, truckFactory = makeTruck }) {
  const bays = gates.map((gate, i) => {
    const inward = { x: -gate.normal[0], z: -gate.normal[1] };
    // Погрузчик встаёт в проёме, вилами к фуре.
    const stand = { x: gate.worldCenter.x + inward.x * 3.2, z: gate.worldCenter.z + inward.z * 3.2 };
    return {
      gate,
      spot: servicePoint(stand, { face: pointAt(gate, DOCK) }),
      truck: null,
      timer: GAP_MIN * (i + 1) * 0.5,
      arrivals: 0,
    };
  });

  function spawn(bay) {
    const model = truckFactory();
    const from = pointAt(bay.gate, APPROACH);
    const to = pointAt(bay.gate, DOCK);
    model.group.position.set(from.x, 0, from.z);
    model.group.rotation.y = Math.atan2(bay.gate.normal[0], bay.gate.normal[1]);
    group.add(model.group);
    bay.arrivals += 1;
    bay.truck = {
      model,
      from,
      to,
      state: "arriving",
      t: 0,
      pallets: direction === "in" ? payload : 0,
      // Паллеты, уже закреплённые за заданиями (сняты/везутся), — чтобы не брать лишние.
      reserved: 0,
      fade: createMaterializeFade(model.group, FADE),
    };
  }

  function step(dt) {
    for (const bay of bays) {
      const truck = bay.truck;
      if (!truck) {
        bay.timer -= dt;
        if (bay.timer <= 0) spawn(bay);
        continue;
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
      } else if (truck.state === "docked") {
        const done = direction === "in" ? truck.pallets <= 0 && truck.reserved <= 0 : truck.pallets >= payload;
        if (done) {
          truck.state = "leaving";
          truck.t = 0;
          truck.model.setDoors?.(0);
          truck.fade.reverse(FADE);
        }
      } else if (truck.state === "leaving") {
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
    }
  }

  const docked = (bay) => bay.truck?.state === "docked";

  return {
    bays,
    step,
    payload,
    // Приёмка: у какой фуры есть незакреплённые паллеты.
    bayWithCargo: () => bays.find((b) => docked(b) && b.truck.pallets - b.truck.reserved > 0) ?? null,
    // Отгрузка: какой фуре ещё нужны паллеты (с учётом уже везущихся).
    bayNeedingCargo: () => bays.find((b) => docked(b) && b.truck.pallets + b.truck.reserved < payload) ?? null,
    reserve: (bay) => {
      bay.truck.reserved += 1;
    },
    // Снять с фуры паллету задания (приёмка).
    take(bay) {
      if (!docked(bay)) return false;
      bay.truck.reserved -= 1;
      bay.truck.pallets -= 1;
      return true;
    },
    // Погрузить паллету задания (отгрузка).
    put(bay) {
      if (!docked(bay)) return false;
      bay.truck.reserved -= 1;
      bay.truck.pallets += 1;
      return true;
    },
    trucksAtGates: () => bays.filter(docked).length,
    dispose() {
      for (const bay of bays) {
        if (!bay.truck) continue;
        group.remove(bay.truck.model.group);
        bay.truck.model.dispose?.();
      }
    },
  };
}
