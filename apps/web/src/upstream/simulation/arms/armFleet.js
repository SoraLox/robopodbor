import {
  MODEL_SCALE,
  ARM_PICKUP_Z,
  ARM_BELT_X,
  ARM_BELT_START_Z,
  ARM_BELT_END_Z,
  BOX_GAP,
  ARM_LEFT_ANGLE,
  ARM_RIGHT_ANGLE,
  ARM_PICKUP_Y,
  ARM_CARRY_Y,
} from "../constants.js";
import { easeInOut, disposeTree } from "../sceneUtils.js";
import { computeArmObstacles } from "../obstacles.js";
import { makeArmRobot } from "../robots/armRobot.js";
import { createEnergyMeter } from "../energy.js";
import { computeArmSlots } from "../layout.js";
import { activePalette } from "../studioLook.js";
import * as THREE from "three";
import { buildNetworkMeshes, NETWORK_BOX } from "./pickingNetwork.js";

// ============================================================
// Роборуки: стационарные, перекладывают коробки с входного конвейера на
// выходной. Питаются от сети, поэтому батарею не моделируем — только считаем
// энергию (энергопрофиль из каталога).
//
// armProd — оп/мин одной руки: от неё зависят скорость цикла и лент.
// Места рук — computeArmSlots (одна линия, а при большом числе — колонки).
// ============================================================

// robotFactory(accentColor, beltTexture) — какую модель руки строить на каждом
// месте; по умолчанию процедурная ArmTech-модель, но тот же автомат состояний
// (конвейеры, захват/передача коробок, счётчик операций) подходит любой руке,
// у которой есть {group, pivot, claw, boxes} — см. makeWeldArmRig.js для
// альтернативы с настоящей моделью клешни.
// network — сеть участка отбора (pickingNetwork.js planPickingNetwork): коробки
// приходят с подающей ленты от стеллажей и уходят на сборный конвейер к воротам.
// Без неё — прежний демо-режим: у каждой руки свои замкнутые ленты.
export function createArmFleet({ group, zone, count, beltTexture, armProd, energyProfile, robotFactory = makeArmRobot, network = null, slots: givenSlots = null }) {
  const cycleDuration = 1 / Math.max(armProd / 60, 0.001);
  const beltRate = 1.45 * Math.max(1, armProd / 15);

  const slots = givenSlots ?? computeArmSlots(zone, count);

  const accents = activePalette().armAccents;
  const arms = slots.map((slot, i) => {
    const built = robotFactory(accents[i % accents.length], beltTexture);

    built.group.position.set(slot.x, 0, slot.z);
    built.group.scale.setScalar(MODEL_SCALE);
    group.add(built.group);

    return { ...built, phase: Math.random(), transferBox: null, lastGoingRight: undefined };
  });

  const meters = arms.map(() => createEnergyMeter(energyProfile));
  let opsDone = 0;

  // Роборуки стационарны — препятствия для объезда пылесосов считаются один раз.
  const obstacles = [...computeArmObstacles(arms), ...(network?.obstacles ?? [])];

  // ----------------------------------------------------------
  // Сеть участка отбора
  // ----------------------------------------------------------

  const net = network ? createNetworkFlow() : null;

  function createNetworkFlow() {
    // Свои коробки руки (демо-цикл) убираем — груз теперь приходит по подаче.
    const materials = [];
    for (const arm of arms) {
      for (const box of arm.boxes ?? []) {
        arm.group.remove(box);
        materials.push(box.material);
        box.geometry.dispose();
      }
      arm.boxes = [];
    }
    const geometry = new THREE.BoxGeometry(0.68, 0.68, 0.68);
    const meshes = buildNetworkMeshes(group, network.rows, beltTexture);
    const speed = beltRate * MODEL_SCALE;
    const rate = (arms.length * armProd) / 60;
    let made = 0;

    const rows = network.rows.map((row) => ({ ...row, feedBoxes: [], takeBoxes: [], credit: 0 }));

    const newBox = () => {
      const box = new THREE.Mesh(geometry, materials[made++ % Math.max(1, materials.length)]);
      box.castShadow = true;
      return box;
    };

    const placeOn = (line, box, d) => {
      const p = line.at(d);
      box.position.set(p.x, NETWORK_BOX.y, p.z);
    };

    // Сколько коробок уже идёт к руке или ждёт на её входной ленте.
    const pending = (row, entry) =>
      row.feedBoxes.filter((b) => b.target === entry).length +
      arms[entry.index].boxes.filter((b) => b.userData.side === -1 && b.userData.state !== "carried").length;

    const inputHasRoom = (arm) =>
      !arm.boxes.some((b) => b.userData.side === -1 && b.userData.state === "input" && b.userData.z < ARM_BELT_START_Z + BOX_GAP);

    function stepFeed(row, dt) {
      // Выдача из хранения — в темпе рук, пока в начале подачи есть место.
      row.credit = Math.min(row.credit + (rate * row.arms.length) / Math.max(1, arms.length) * 1.1 * dt, 2);
      const tail = row.feedBoxes[row.feedBoxes.length - 1];
      if (row.credit >= 1 && (!tail || tail.d > NETWORK_BOX.spacing)) {
        const target = row.arms.reduce((best, entry) => (pending(row, entry) < pending(row, best) ? entry : best));
        if (pending(row, target) < 4) {
          row.credit -= 1;
          const mesh = newBox();
          mesh.scale.setScalar(MODEL_SCALE);
          group.add(mesh);
          row.feedBoxes.push({ mesh, d: 0, target });
        }
      }
      let limit = Infinity;
      for (const box of [...row.feedBoxes]) {
        box.d = Math.min(box.d + speed * dt, limit, box.target.divertD);
        placeOn(row.feed, box.mesh, box.d);
        const arm = arms[box.target.index];
        if (box.d >= box.target.divertD - 1e-3 && inputHasRoom(arm)) {
          // Сход на входную ленту руки.
          row.feedBoxes.splice(row.feedBoxes.indexOf(box), 1);
          group.remove(box.mesh);
          box.mesh.scale.setScalar(1);
          box.mesh.userData = { state: "input", z: ARM_BELT_START_Z, side: -1 };
          box.mesh.position.set(-ARM_BELT_X, 0.82, ARM_BELT_START_Z);
          arm.group.add(box.mesh);
          arm.boxes.push(box.mesh);
          continue;
        }
        limit = box.d - NETWORK_BOX.spacing;
      }
    }

    // Коробка с конца выходной ленты руки — на сборный, если там есть окно.
    function merge(armIndex, box) {
      const row = rows.find((r) => r.arms.some((e) => e.index === armIndex));
      const entry = row.arms.find((e) => e.index === armIndex);
      if (row.takeBoxes.some((b) => Math.abs(b.d - entry.mergeD) < NETWORK_BOX.spacing)) return false;
      const arm = arms[armIndex];
      arm.group.remove(box);
      arm.boxes.splice(arm.boxes.indexOf(box), 1);
      box.scale.setScalar(MODEL_SCALE);
      box.rotation.set(0, 0, 0);
      group.add(box);
      row.takeBoxes.push({ mesh: box, d: entry.mergeD });
      row.takeBoxes.sort((a, b) => b.d - a.d);
      placeOn(row.take, box, entry.mergeD);
      return true;
    }

    function stepTake(row, dt) {
      let limit = Infinity;
      for (const box of [...row.takeBoxes]) {
        box.d = Math.min(box.d + speed * dt, limit);
        if (box.d >= row.take.total) {
          // Доехала до ворот — в фуру.
          row.takeBoxes.splice(row.takeBoxes.indexOf(box), 1);
          group.remove(box.mesh);
          flow.delivered += 1;
          continue;
        }
        placeOn(row.take, box.mesh, box.d);
        limit = box.d - NETWORK_BOX.spacing;
      }
    }

    const flow = {
      delivered: 0,
      merge,
      step(dt) {
        for (const row of rows) {
          stepFeed(row, dt);
          stepTake(row, dt);
        }
      },
      dispose() {
        for (const row of rows) for (const b of [...row.feedBoxes, ...row.takeBoxes]) group.remove(b.mesh);
        group.remove(meshes);
        disposeTree(meshes);
        geometry.dispose();
        new Set(materials).forEach((m) => m.dispose());
      },
    };
    return flow;
  }

  // ----------------------------------------------------------
  // Конвейеры
  // ----------------------------------------------------------

  function findWaitingBox(arm) {
    let best = null;
    let bestDistance = Infinity;

    for (const box of arm.boxes) {
      if (box.userData.state !== "waiting") continue;

      const distance = Math.abs(box.userData.z - ARM_PICKUP_Z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = box;
      }
    }

    return best;
  }

  function advanceInputQueue(boxes, dt) {
    const queue = boxes.filter((b) => b.userData.state === "input" || b.userData.state === "waiting");
    queue.sort((a, b) => b.userData.z - a.userData.z);

    let limit = ARM_PICKUP_Z;

    queue.forEach((box) => {
      let z = box.userData.z + beltRate * dt;
      if (z > limit) z = limit;

      box.userData.z = z;
      box.position.set(-ARM_BELT_X, 0.82, z);
      box.userData.state = z >= ARM_PICKUP_Z - 1e-3 ? "waiting" : "input";
      limit = z - BOX_GAP;
    });
  }

  function advanceOutputQueue(boxes, dt, armIndex) {
    if (net) {
      // Сеть: коробки копятся к концу выходной ленты и уходят на сборный конвейер.
      const queue = boxes.filter((b) => b.userData.state === "output").sort((a, b) => b.userData.z - a.userData.z);
      let limit = ARM_BELT_END_Z;
      for (const box of queue) {
        box.userData.z = Math.min(box.userData.z + beltRate * dt, limit);
        box.position.set(ARM_BELT_X, 0.82, box.userData.z);
        if (box.userData.z >= ARM_BELT_END_Z - 1e-3 && net.merge(armIndex, box)) continue;
        limit = box.userData.z - BOX_GAP;
      }
      return;
    }

    const queue = boxes.filter((b) => b.userData.state === "output");
    queue.sort((a, b) => a.userData.z - b.userData.z);

    let limit = -Infinity;

    queue.forEach((box) => {
      let z = box.userData.z + beltRate * dt;
      if (z < limit) z = limit;

      box.userData.z = z;
      box.position.set(ARM_BELT_X, 0.82, z);
      box.rotation.y += dt * 0.8;
      limit = z + BOX_GAP;

      if (box.userData.z >= ARM_BELT_END_Z) {
        box.userData.state = "input";
        box.userData.side = -1;
        box.userData.z = ARM_BELT_START_Z;
        box.position.set(-ARM_BELT_X, 0.82, ARM_BELT_START_Z);
        box.rotation.set(0, 0, 0);
      }
    });
  }

  // ----------------------------------------------------------
  // Рука
  // ----------------------------------------------------------

  function advanceArm(arm, dt, armIndex) {
    arm.phase = (arm.phase + dt / cycleDuration) % 1;
    if (arm.phase < 0) arm.phase += 1;

    const goingRight = arm.phase < 0.5;
    const legPhase = goingRight ? arm.phase * 2 : (arm.phase - 0.5) * 2;
    const eased = easeInOut(legPhase);

    const ARM_RIGHT_FAR = ARM_RIGHT_ANGLE + Math.PI * 2;

    const angle = goingRight
      ? ARM_LEFT_ANGLE + (ARM_RIGHT_FAR - ARM_LEFT_ANGLE) * eased
      : ARM_RIGHT_FAR - (ARM_RIGHT_FAR - ARM_LEFT_ANGLE) * eased;

    const dip = Math.cos(Math.PI * legPhase) ** 2;

    arm.pivot.rotation.y = angle;
    arm.claw.position.y = ARM_CARRY_Y + (ARM_PICKUP_Y - ARM_CARRY_Y) * dip;

    const boxes = arm.boxes;
    if (!boxes?.length) {
      arm.lastGoingRight = goingRight;
      return;
    }

    advanceInputQueue(boxes.filter((b) => b.userData.side === -1 && b.userData.state !== "carried"), dt);
    advanceOutputQueue(boxes.filter((b) => b.userData.side === 1 && b.userData.state !== "carried"), dt, armIndex);

    if (arm.lastGoingRight === undefined) arm.lastGoingRight = goingRight;

    // Передача: рука дошла до выходного конвейера и отпускает коробку.
    if (arm.lastGoingRight && !goingRight && arm.transferBox) {
      const box = arm.transferBox;

      arm.claw.remove(box);
      box.userData.state = "output";
      box.userData.side = 1;
      box.userData.z = ARM_PICKUP_Z;
      box.rotation.set(0, 0, 0);
      box.position.set(ARM_BELT_X, 0.82, ARM_PICKUP_Z);
      arm.group.add(box);
      arm.transferBox = null;
      opsDone += 1;
    }

    // Захват: рука вернулась ко входному конвейеру и берёт коробку.
    if (!arm.lastGoingRight && goingRight && !arm.transferBox) {
      const pickupBox = findWaitingBox(arm);

      if (pickupBox) {
        arm.transferBox = pickupBox;
        pickupBox.userData.state = "carried";
        arm.claw.add(pickupBox);
        pickupBox.position.set(0, -0.34, 0);
        pickupBox.rotation.set(0, 0, 0);
      }
    }

    arm.lastGoingRight = goingRight;
  }

  // ----------------------------------------------------------
  // Публичный интерфейс
  // ----------------------------------------------------------

  function step(dt) {
    net?.step(dt);
    arms.forEach((arm, i) => {
      meters[i].consume(dt, "work");
      advanceArm(arm, dt, i);
    });
  }

  // У каждой роборуки свои геометрии и материалы (текстура ленты общая).
  function dispose() {
    net?.dispose();
    for (const arm of arms) {
      group.remove(arm.group);
      disposeTree(arm.group);
    }
  }

  return { step, obstacles, meters, dispose, getOpsDone: () => opsDone, getDelivered: () => net?.delivered ?? 0 };
}
