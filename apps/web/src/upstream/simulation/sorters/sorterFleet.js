import * as THREE from "three";
import { createEnergyMeter } from "../energy.js";
import { disposeTree } from "../sceneUtils.js";
import { activePalette } from "../studioLook.js";

// Статическая сортировочная система (кросс-белт / тилт-трей): замкнутая петля с
// каретками, станция подачи на одном торце и лотки-выходы вдоль прямых участков.
// Каретка забирает штуку на подаче, едет по петле и сбрасывает её в свой лоток.
// Темп подачи — паспортная производительность системы (шт/ч), число кареток —
// сколько нужно, чтобы петля успевала при этой скорости. Стационарна: для
// пылесосов — прямоугольное препятствие.

// Скорость кареток кросс-белт сортера, м/с — типовая 2–2,5 м/с.
const LOOP_SPEED_MPS = 2.5;
const LOOP_WIDTH = 8; // расстояние между прямыми участками петли
const CARRIER_SIZE = 0.85;
const MIN_CARRIER_GAP = 1.0;
const CHUTES_PER_SIDE = 5;
const DECK_Y = 1.1;

// Места систем в зоне: вдоль длинной стороны зоны, по одной в ряд.
export function sorterSlots(zone, count) {
  const zoneLength = zone.zMax - zone.zMin;
  const alongX = zone.width >= zoneLength;
  const long = Math.min(36, (alongX ? zone.width : zoneLength) - 4);
  const pitch = LOOP_WIDTH + 7;
  const across = alongX ? zoneLength : zone.width;
  const fit = Math.max(1, Math.floor(across / pitch));
  const n = Math.min(count, fit);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const offset = (i + 0.5) * (across / n);
    slots.push({
      x: alongX ? zone.xMin + zone.width / 2 : zone.xMin + offset,
      z: alongX ? zone.zMin + offset : zone.zMin + zoneLength / 2,
      alongX,
      length: Math.max(14, long),
    });
  }
  return slots;
}

export function maxSorterCount(zone) {
  const zoneLength = zone.zMax - zone.zMin;
  const across = zone.width >= zoneLength ? zoneLength : zone.width;
  return Math.max(1, Math.floor(across / (LOOP_WIDTH + 7)));
}

function buildLoop(slot, palette, beltTexture) {
  const group = new THREE.Group();
  const straight = slot.length - LOOP_WIDTH;
  const deckMaterial = new THREE.MeshStandardMaterial({ color: palette.belt, map: beltTexture ?? null, roughness: 0.7 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: palette.storage, flatShading: true, roughness: 0.6 });
  const chuteMaterial = new THREE.MeshStandardMaterial({ color: palette.wallTrim, flatShading: true, roughness: 0.5 });

  // Прямые участки и торцевые полукольца.
  for (const side of [-1, 1]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(straight, 0.25, 1.8), deckMaterial);
    deck.position.set(0, DECK_Y, (side * LOOP_WIDTH) / 2);
    deck.castShadow = true;
    group.add(deck);

    const ring = new THREE.Mesh(new THREE.RingGeometry(LOOP_WIDTH / 2 - 0.9, LOOP_WIDTH / 2 + 0.9, 24, 1, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), deckMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set((side * straight) / 2, DECK_Y + 0.13, 0);
    group.add(ring);
  }

  // Опоры.
  for (let i = 0; i <= 4; i++) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, DECK_Y, 0.25), frameMaterial);
      leg.position.set(-straight / 2 + (straight * i) / 4, DECK_Y / 2, (side * LOOP_WIDTH) / 2);
      group.add(leg);
    }
  }

  // Лотки-выходы наружу петли.
  const chutes = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < CHUTES_PER_SIDE; i++) {
      const x = -straight / 2 + (straight * (i + 0.5)) / CHUTES_PER_SIDE;
      const chute = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.4), chuteMaterial);
      chute.position.set(x, DECK_Y - 0.45, side * (LOOP_WIDTH / 2 + 1.9));
      chute.rotation.x = side * 0.42;
      group.add(chute);
      chutes.push({ x, side });
    }
  }

  // Станция подачи на торце.
  const induct = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 1.6), deckMaterial);
  induct.position.set(-straight / 2 - LOOP_WIDTH / 2 - 2.8, DECK_Y, 0);
  group.add(induct);

  group.position.set(slot.x, 0, slot.z);
  group.rotation.y = slot.alongX ? 0 : Math.PI / 2;
  return { group, straight, chutes, materials: [deckMaterial, frameMaterial, chuteMaterial] };
}

// Точка на петле по пройденному пути s (локальные координаты системы).
function loopPoint(s, straight) {
  const r = LOOP_WIDTH / 2;
  const half = Math.PI * r;
  const total = 2 * straight + 2 * half;
  let d = ((s % total) + total) % total;
  if (d < straight) return { x: -straight / 2 + d, z: r, side: 1 };
  d -= straight;
  if (d < half) {
    const a = d / r;
    return { x: straight / 2 + Math.sin(a) * r, z: Math.cos(a) * r, side: 0 };
  }
  d -= half;
  if (d < straight) return { x: straight / 2 - d, z: -r, side: -1 };
  d -= straight;
  const a = d / r;
  return { x: -straight / 2 - Math.sin(a) * r, z: -Math.cos(a) * r, side: 0 };
}

export function createSorterFleet({ group, zone, count, throughputPerHour, beltTexture, energyProfile, metersPerUnit = 1 }) {
  const LOOP_SPEED = LOOP_SPEED_MPS / Math.max(1e-6, metersPerUnit);
  const palette = activePalette();
  const crateColors = [palette.crateA, palette.crateB, palette.crateC];
  const crateGeometry = new THREE.BoxGeometry(0.6, 0.45, 0.6);
  const crateMaterials = crateColors.map((color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 }));
  const carrierGeometry = new THREE.BoxGeometry(CARRIER_SIZE, 0.2, CARRIER_SIZE);
  const carrierMaterial = new THREE.MeshStandardMaterial({ color: palette.robotBody, flatShading: true, roughness: 0.5 });

  const systems = sorterSlots(zone, count).map((slot) => {
    const loop = buildLoop(slot, palette, beltTexture);
    group.add(loop.group);
    const total = 2 * loop.straight + 2 * Math.PI * (LOOP_WIDTH / 2);
    const loopSeconds = total / LOOP_SPEED;
    const perSecond = Math.max(0.05, (throughputPerHour || 0) / 3600);
    // Кареток столько, чтобы за один оборот петли успеть принять весь поток.
    const carrierCount = Math.max(6, Math.min(Math.floor(total / MIN_CARRIER_GAP), Math.ceil(perSecond * loopSeconds * 1.2)));
    const carriers = Array.from({ length: carrierCount }, (_, i) => {
      const mesh = new THREE.Mesh(carrierGeometry, carrierMaterial);
      loop.group.add(mesh);
      return { mesh, s: (total * i) / carrierCount, item: null, chute: null };
    });
    return { loop, total, carriers, perSecond, credit: 0, falling: [], meter: createEnergyMeter(energyProfile) };
  });

  let itemsDone = 0;

  function step(dt) {
    for (const sys of systems) {
      sys.meter.consume(dt, "work");
      sys.credit += sys.perSecond * dt;

      for (const carrier of sys.carriers) {
        const before = carrier.s % sys.total;
        carrier.s += LOOP_SPEED * dt;
        const after = carrier.s % sys.total;
        const p = loopPoint(carrier.s, sys.loop.straight);
        carrier.mesh.position.set(p.x, DECK_Y + 0.25, p.z);

        // Подача — на левом торце петли (начало пути): пустая каретка берёт штуку.
        const passedInduct = after < before;
        if (passedInduct && !carrier.item && sys.credit >= 1) {
          sys.credit -= 1;
          const item = new THREE.Mesh(crateGeometry, crateMaterials[itemsDone % crateMaterials.length]);
          sys.loop.group.add(item);
          carrier.item = item;
          carrier.chute = sys.loop.chutes[Math.floor(Math.random() * sys.loop.chutes.length)];
        }

        if (carrier.item) {
          carrier.item.position.set(p.x, DECK_Y + 0.65, p.z);
          const chute = carrier.chute;
          if (p.side === chute.side && Math.abs(p.x - chute.x) < LOOP_SPEED * dt + 0.2) {
            // Сброс в лоток: штука съезжает наружу и исчезает.
            sys.falling.push({ mesh: carrier.item, side: chute.side, t: 0 });
            carrier.item = null;
            carrier.chute = null;
            itemsDone += 1;
          }
        }
      }

      for (const fall of sys.falling) {
        fall.t += dt;
        fall.mesh.position.z += fall.side * dt * 3;
        fall.mesh.position.y -= dt * 1.4;
      }
      for (const fall of sys.falling.filter((f) => f.t > 0.8)) {
        sys.loop.group.remove(fall.mesh);
      }
      sys.falling = sys.falling.filter((f) => f.t <= 0.8);
      // Не копим бесконечный «долг» подачи, если каретки не успевают.
      sys.credit = Math.min(sys.credit, sys.carriers.length);
    }
  }

  // Препятствия для пылесосов — прямоугольник каждой системы с запасом.
  const obstacles = systems.map((sys) => {
    const slot = sys.loop.group.position;
    const alongX = sys.loop.group.rotation.y === 0;
    const halfLong = (sys.loop.straight + LOOP_WIDTH) / 2 + 6;
    const halfShort = LOOP_WIDTH / 2 + 3.5;
    return { x: slot.x, z: slot.z, halfX: alongX ? halfLong : halfShort, halfZ: alongX ? halfShort : halfLong };
  });

  function dispose() {
    for (const sys of systems) {
      group.remove(sys.loop.group);
      disposeTree(sys.loop.group);
    }
    crateGeometry.dispose();
    carrierGeometry.dispose();
    carrierMaterial.dispose();
    crateMaterials.forEach((m) => m.dispose());
  }

  return {
    step,
    dispose,
    obstacles,
    meters: systems.map((sys) => sys.meter),
    getItemsDone: () => itemsDone,
    systemsShown: systems.length,
  };
}
