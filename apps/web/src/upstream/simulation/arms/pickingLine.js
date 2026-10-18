import * as THREE from "three";
import { createBeltPath, BELT_TOP } from "../conveyors/beltPath.js";
import { createArmUnit } from "./armUnit.js";
import { ARM_REACH, ARM_SCALE } from "./armConstants.js";
import { activePalette } from "../studioLook.js";

// Участок отбора с роборуками без своих лент (pick_arm.glb): по одну сторону
// ряда рук — подача от торца стеллажей (выдача из хранения), по другую —
// сборный конвейер к воротам отгрузки (pickingNetwork.js planPickingNetwork с
// reach). Рука снимает коробку с подачи и ставит на сборный конвейер; у ворот
// коробка уходит в фуру.

const BOX = 1.1;

export function createPickingLine({ group, net, slots, rigFactory, beltTexture, opsPerMinute, energyProfile }) {
  const palette = activePalette();
  const geometry = new THREE.BoxGeometry(BOX, BOX, BOX);
  const materials = [palette.crateA, palette.crateB, palette.crateC].map(
    (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 })
  );
  let made = 0;
  let delivered = 0;
  const boxAt = () => {
    const mesh = new THREE.Mesh(geometry, materials[made++ % materials.length]);
    mesh.castShadow = true;
    // Начало координат — снизу, как у паллеты погрузчика.
    const holder = new THREE.Group();
    mesh.position.y = BOX / 2;
    holder.add(mesh);
    return holder;
  };

  const rows = net.rows.map((row) => {
    const feed = createBeltPath({ group, points: row.feed.points, speed: 1.3, width: 2.2, spacing: 1.8, beltTexture });
    const take = createBeltPath({ group, points: row.take.points, speed: 1.3, width: 2.2, spacing: 1.8, beltTexture });
    const units = row.arms.map((entry) => {
      const slot = slots[entry.index];
      const rig = rigFactory();
      rig.group.position.set(slot.x, 0, slot.z);
      rig.group.scale.setScalar(ARM_SCALE);
      group.add(rig.group);
      let unit = null;
      const pick = feed.addPickPoint(feed.project({ x: slot.x, z: slot.z - ARM_REACH }), () => unit?.readyToPick() ?? false);
      const placeD = take.project({ x: slot.x, z: slot.z + ARM_REACH });
      unit = createArmUnit({
        rig,
        scale: ARM_SCALE,
        from: { dir: { x: 0, z: -1 }, radius: ARM_REACH, height: () => BELT_TOP + BOX, pick },
        to: {
          dir: { x: 0, z: 1 },
          radius: ARM_REACH,
          height: () => BELT_TOP + BOX,
          ready: () => take.canPut(placeD),
          put: (box) => take.put(box, placeD),
        },
        opsPerMinute,
        energyProfile,
        itemHeight: BOX,
      });
      return { rig, unit };
    });
    // Выдача из хранения — в темпе рук ряда, пока в начале подачи есть окно.
    const rate = (units.length * opsPerMinute) / 60;
    return { feed, take, units, rate, credit: 0 };
  });

  function step(dt) {
    for (const row of rows) {
      row.credit = Math.min(row.credit + row.rate * 1.1 * dt, 2);
      if (row.credit >= 1 && row.feed.canPut(0)) {
        row.feed.put(boxAt(), 0);
        row.credit -= 1;
      }
      row.feed.step(dt);
      for (const u of row.units) u.unit.step(dt);
      row.take.step(dt);
      // У ворот — в фуру.
      const done = row.take.takeAtEnd();
      if (done) {
        done.removeFromParent();
        delivered += 1;
      }
    }
  }

  function dispose() {
    for (const row of rows) {
      row.feed.dispose();
      row.take.dispose();
      for (const u of row.units) group.remove(u.rig.group);
    }
    geometry.dispose();
    materials.forEach((m) => m.dispose());
  }

  return {
    // Площадки старых рук на полу не рисуем: руки стоят у общих лент.
    drawPads: false,
    step,
    dispose,
    obstacles: [
      ...rows.flatMap((r) => [...r.feed.obstacles, ...r.take.obstacles]),
      ...slots.map((s) => ({ x: s.x, z: s.z, halfX: 2.2, halfZ: 2.2 })),
    ],
    meters: rows.flatMap((r) => r.units.map((u) => u.unit.meter)),
    getOpsDone: () => rows.reduce((sum, r) => sum + r.units.reduce((s, u) => s + u.unit.getOps(), 0), 0),
    getDelivered: () => delivered,
  };
}
