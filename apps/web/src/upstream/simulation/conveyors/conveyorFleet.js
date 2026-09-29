import * as THREE from "three";
import { createEnergyMeter } from "../energy.js";
import { disposeTree } from "../sceneUtils.js";
import { activePalette } from "../studioLook.js";

// Конвейерные линии: лента от зоны ворот вглубь склада. Груз появляется у
// ворот с темпом паспортной производительности линии (ед./ч), едет по ленте и
// уходит на хранение в дальнем конце. Линии стационарны — для пылесосов это
// прямоугольные препятствия. Где проложить линии, решает layout.conveyorLines.

const DEFAULT_BELT_WIDTH = 2.4;
const BELT_Y = 1.0;
// Скорость паллетного конвейера, м/с — типовая для роликовых и цепных линий.
const BELT_SPEED_MPS = 0.5;
const UNIT_GAP = 1.6; // минимальный зазор между единицами груза на ленте
const DEFAULT_PALLET_SIZE = 1.5;

// size — габарит в ед. сцены: ширина ленты (из каталога) и паллета 1,2 м (европаллета).
export function createConveyorFleet({ group, lines, throughputPerHour, beltTexture, energyProfile, metersPerUnit = 1, size }) {
  const BELT_WIDTH = size?.widthUnits ?? DEFAULT_BELT_WIDTH;
  const PALLET_SIZE = size ? Math.min(BELT_WIDTH * 0.95, 1.2 / Math.max(1e-6, metersPerUnit)) : DEFAULT_PALLET_SIZE;
  const UNIT_GAP_UNITS = size ? 0.3 / Math.max(1e-6, metersPerUnit) : UNIT_GAP;
  const beltSpeed = BELT_SPEED_MPS / Math.max(1e-6, metersPerUnit);
  const palette = activePalette();
  const beltMaterial = new THREE.MeshStandardMaterial({ color: palette.belt, map: beltTexture ?? null, roughness: 0.7 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: palette.storage, flatShading: true, roughness: 0.6 });
  const palletGeometry = new THREE.BoxGeometry(PALLET_SIZE, Math.min(0.9, PALLET_SIZE * 0.7), PALLET_SIZE);
  const palletMaterials = [palette.cargoCrate, palette.crateA, palette.crateB].map(
    (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 })
  );

  const built = lines.map((line) => {
    const dx = line.end.x - line.start.x;
    const dz = line.end.z - line.start.z;
    const length = Math.max(2, Math.hypot(dx, dz));
    const dir = { x: dx / length, z: dz / length };
    const heading = Math.atan2(dx, dz);

    const lineGroup = new THREE.Group();
    lineGroup.position.set(line.start.x, 0, line.start.z);
    lineGroup.rotation.y = heading;
    group.add(lineGroup);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(BELT_WIDTH, 0.22, length), beltMaterial);
    belt.position.set(0, BELT_Y, length / 2);
    belt.castShadow = true;
    lineGroup.add(belt);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, length), frameMaterial);
      rail.position.set((side * BELT_WIDTH) / 2, BELT_Y + 0.12, length / 2);
      lineGroup.add(rail);
    }
    for (let d = 0; d <= length; d += 4) {
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, BELT_Y, 0.2), frameMaterial);
        leg.position.set((side * (BELT_WIDTH - 0.3)) / 2, BELT_Y / 2, Math.min(d, length - 0.1));
        lineGroup.add(leg);
      }
    }

    return {
      group: lineGroup,
      // 'out' — отгрузка: груз едет от дальнего конца (хранение) к началу (ворота).
      reverse: line.direction === "out",
      length,
      dir,
      start: line.start,
      units: [],
      credit: 0,
      perSecond: Math.max(0.01, (throughputPerHour || 0) / 3600),
      meter: createEnergyMeter(energyProfile),
    };
  });

  let unitsMoved = 0;

  function step(dt) {
    for (const line of built) {
      line.meter.consume(dt, line.units.length ? "work" : "idle");
      line.credit += line.perSecond * dt;

      // Новая единица груза у ворот — если есть место в начале ленты.
      const tail = line.units[line.units.length - 1];
      if (line.credit >= 1 && (!tail || tail.d > PALLET_SIZE + UNIT_GAP_UNITS)) {
        line.credit -= 1;
        const mesh = new THREE.Mesh(palletGeometry, palletMaterials[unitsMoved % palletMaterials.length]);
        line.group.add(mesh);
        line.units.push({ mesh, d: 0 });
      }
      line.credit = Math.min(line.credit, 3);

      let limit = Infinity;
      for (const unit of line.units) {
        unit.d = Math.min(unit.d + beltSpeed * dt, limit - (PALLET_SIZE + UNIT_GAP_UNITS));
        limit = unit.d;
        unit.mesh.position.set(0, BELT_Y + 0.56, line.reverse ? line.length - unit.d : unit.d);
      }
      // Дошла до конца — сдана на хранение.
      while (line.units.length && line.units[0].d >= line.length - PALLET_SIZE / 2) {
        const done = line.units.shift();
        line.group.remove(done.mesh);
        unitsMoved += 1;
      }
    }
  }

  const obstacles = built.map((line) => {
    const cx = line.start.x + (line.dir.x * line.length) / 2;
    const cz = line.start.z + (line.dir.z * line.length) / 2;
    const alongX = Math.abs(line.dir.x) > Math.abs(line.dir.z);
    return {
      x: cx,
      z: cz,
      halfX: alongX ? line.length / 2 : BELT_WIDTH / 2 + 1,
      halfZ: alongX ? BELT_WIDTH / 2 + 1 : line.length / 2,
    };
  });

  function dispose() {
    for (const line of built) {
      group.remove(line.group);
      disposeTree(line.group);
    }
    palletGeometry.dispose();
    palletMaterials.forEach((m) => m.dispose());
  }

  return {
    step,
    dispose,
    obstacles,
    meters: built.map((line) => line.meter),
    getUnitsMoved: () => unitsMoved,
    lengthUnits: built.reduce((sum, line) => sum + line.length, 0),
  };
}
