import * as THREE from "three";
import { cellCenter, isWalkable } from "../loaders/gridPath.js";
import { BELT_TOP, createBeltPath } from "../conveyors/beltPath.js";
import { crateMaterial } from "../loaders/cargo.js";
import { WALL_HEIGHT } from "../layout.js";
import { CELL, cellAt } from "../shape/shapeTypes.js";

// ════════════════════════════════════════════════════════════════════════════
// Станция отбора роборуками — у глухой стены (без ворот):
//
//   стена ▏ проём с туманом ◀── лента вдоль стены ◀── коробки
//          ▏ ряд 0: лента
//          ▏ ряд 1: роборуки
//          ▏ ряд 2: кучки — паллеты, которые привёз склад
//          ▏ ряд 3: погрузчик (снимает паллету с AMR и ставит в кучку)
//          ▏ ряд 4: стоянка AMR
//
// Паллету со стеллажа везут погрузчик и AMR, погрузчик ставит её кучкой у руки;
// рука по одной перекладывает коробки на ленту, лента уходит в проём в стене —
// дальше упаковка/отгрузка за стеной. Пустой поддон убирается.
// ════════════════════════════════════════════════════════════════════════════

const ROWS = 5;
const PITCH = 3; // клеток между руками
const GATE_CLEAR = 3; // клеток от ворот
const CARTONS = { across: 3, along: 2, layers: 2 };

const DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/**
 * Где поставить станцию: ряд клеток вдоль глухой стены, за которым 5 рядов
 * свободного пола, не у ворот и так, чтобы занятая полоса не отрезала проезды.
 * toward — направление на камеру: станция — у дальней стены (её видно, ближние
 * стены прозрачные), проём смотрит на зрителя. Возвращает план или null.
 */
export function planPickStation({ nav, shape, gates, armCount, toward = null }) {
  if (armCount <= 0) return null;
  const n = nav.n;
  const walk = (gx, gz) => gx >= 0 && gz >= 0 && gx < n && gz < n && isWalkable(nav, gx, gz);
  // За рядом ленты — стена: край сетки или пустая клетка вне склада.
  const outside = (gx, gz) => gx < 0 || gz < 0 || gx >= n || gz >= n || cellAt(shape, gx, gz) === CELL.EMPTY;
  const gateCells = gates.map((g) => ({ x: g.worldCenter.x, z: g.worldCenter.z }));
  let best = null;
  for (let want = Math.min(armCount, 6); want >= 1 && !best; want--) {
    const length = PITCH * want + 1;
    for (const [dx, dz] of DIRS) {
      const ex = Math.abs(dz);
      const ez = Math.abs(dx);
      for (let gz = 0; gz < n; gz++) {
        for (let gx = 0; gx < n; gx++) {
          const cell = (s, r) => ({ gx: gx + ex * s + dx * r, gz: gz + ez * s + dz * r });
          let ok = true;
          for (let s = 0; s < length && ok; s++) {
            const wall = cell(s, -1);
            if (!outside(wall.gx, wall.gz)) ok = false;
            for (let r = 0; r < ROWS && ok; r++) {
              const c = cell(s, r);
              if (!walk(c.gx, c.gz)) ok = false;
            }
          }
          if (!ok) continue;
          const mid = cellCenter(nav, cell(Math.floor(length / 2), 0).gx, cell(Math.floor(length / 2), 0).gz);
          const reach = nav.cellSize * (length / 2 + GATE_CLEAR);
          if (gateCells.some((g) => Math.hypot(g.x - mid.x, g.z - mid.z) < reach)) continue;
          const blocked = new Set();
          for (let s = 0; s < length; s++) for (let r = 0; r < 3; r++) blocked.add(cell(s, r).gz * n + cell(s, r).gx);
          if (!connected(nav, walk, blocked)) continue;
          // Куда лента уходит в стену: в стену за станцией или, если станция
          // упирается в угол, — в боковую стену. Проём — на видной (дальней) стене.
          const exits = [{ inward: { x: dx, z: dz }, end: null }];
          if (outside(cell(-1, 0).gx, cell(-1, 0).gz)) exits.push({ inward: { x: ex, z: ez }, end: 0 });
          if (outside(cell(length, 0).gx, cell(length, 0).gz)) exits.push({ inward: { x: -ex, z: -ez }, end: length - 1 });
          for (const exit of exits) {
            const score = toward ? -(exit.inward.x * toward.x + exit.inward.z * toward.z) : 0;
            if (!best || score < best.score - 1e-6) best = { score, gx, gz, dx, dz, ex, ez, length, arms: want, blocked, exit };
          }
        }
      }
    }
  }
  if (!best) return null;
  const { gx, gz, dx, dz, ex, ez, length } = best;
  const cell = (s, r) => ({ gx: gx + ex * s + dx * r, gz: gz + ez * s + dz * r });
  const center = (s, r) => {
    const c = cell(s, r);
    return { ...cellCenter(nav, c.gx, c.gz), ...c };
  };
  const inward = { x: dx, z: dz };
  const half = nav.cellSize / 2;
  // Лента — вдоль ряда 0 к выходу и сквозь стену.
  const exit = best.exit;
  const out = { x: -exit.inward.x, z: -exit.inward.z };
  const [from, to] = exit.end === length - 1 ? [0, length - 1] : [length - 1, 0];
  const first = center(from, 0);
  const last = center(to, 0);
  const portal = { x: last.x + out.x * (half + 0.2), z: last.z + out.z * (half + 0.2), inward: exit.inward };
  const belt = [
    { x: first.x, z: first.z },
    { x: last.x, z: last.z },
    { x: last.x + out.x * (half + 1.6), z: last.z + out.z * (half + 1.6) },
  ];
  const arms = Array.from({ length: best.arms }, (_, k) => {
    const s = 2 + PITCH * k;
    return { base: center(s, 1), belt: center(s, 0), heap: center(s, 2), fork: center(s, 3), amr: center(s, 4) };
  });
  return { arms, belt, portal, inward, along: { x: ex, z: ez }, blocked: best.blocked, requested: armCount };
}

// Занятая станцией полоса — свободный пол остаётся связным.
function connected(nav, walk, blocked) {
  const n = nav.n;
  let start = -1;
  let total = 0;
  for (let k = 0; k < n * n; k++) {
    if (blocked.has(k) || !walk(k % n, Math.floor(k / n))) continue;
    total += 1;
    if (start < 0) start = k;
  }
  if (start < 0) return false;
  const seen = new Uint8Array(n * n);
  seen[start] = 1;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i];
    const x = k % n;
    const z = (k - x) / n;
    for (const [ddx, ddz] of DIRS) {
      const nx = x + ddx;
      const nz = z + ddz;
      const nk = nz * n + nx;
      if (!walk(nx, nz) || blocked.has(nk) || seen[nk]) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  return queue.length === total;
}

/** Что станция занимает на полу — для мобильных роботов (до создания станции). */
export function pickStationObstacles(plan, nav) {
  const h = nav.cellSize / 2;
  return [...plan.blocked].map((k) => {
    const c = cellCenter(nav, k % nav.n, Math.floor(k / nav.n));
    return { x: c.x, z: c.z, halfX: h - 0.05, halfZ: h - 0.05 };
  });
}

// Тёмный проём в стене с туманом: лента уходит за стену.
function makePortal(plan, width) {
  const group = new THREE.Group();
  const height = Math.min(WALL_HEIGHT - 0.4, 3.2);
  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x15161c }),
  );
  hole.position.y = height / 2;
  group.add(hole);
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  const ctx = canvas?.getContext?.("2d") ?? null;
  if (canvas) {
    canvas.width = 64;
    canvas.height = 64;
  }
  if (ctx) {
    const g = ctx.createRadialGradient(32, 40, 4, 32, 40, 32);
    g.addColorStop(0, "rgba(235,238,245,0.95)");
    g.addColorStop(1, "rgba(235,238,245,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const fogTexture = ctx ? new THREE.CanvasTexture(canvas) : null;
  for (let i = 0; i < 3; i++) {
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(width * (1.1 + i * 0.25), height * (0.9 + i * 0.2)),
      new THREE.MeshBasicMaterial({ map: fogTexture, color: 0xeef0f5, transparent: true, opacity: 0.45 - i * 0.1, depthWrite: false }),
    );
    fog.position.set(0, height * 0.45, 0.25 + i * 0.35);
    group.add(fog);
  }
  group.position.set(plan.portal.x, 0, plan.portal.z);
  // Плоскость проёма — вдоль стены, лицом внутрь склада.
  group.rotation.y = Math.atan2(plan.portal.inward.x, plan.portal.inward.z);
  return group;
}

/**
 * Станция: лента, руки, кучки. Кучка — поддон с коробками (из паллеты, которую
 * поставил погрузчик); рука берёт верхнюю коробку и ставит на ленту.
 */
export function createPickStation({ group, plan, beltTexture, rigFactory, armScale, createArmUnit, tweens, cargoFactory, opsPerMinute, energyProfile }) {
  const belt = createBeltPath({ group, points: plan.belt, speed: 1.3, width: 2.4, spacing: 1.4, beltTexture });
  const portal = makePortal(plan, 3.4);
  group.add(portal);
  // Коробка — доля ящика паллеты.
  const crateH = cargoFactory.unitHeight - 0.37;
  const size = {
    x: (cargoFactory.width - 0.1) / CARTONS.across - 0.06,
    y: crateH / CARTONS.layers - 0.04,
    z: (cargoFactory.depth - 0.1) / CARTONS.along - 0.06,
  };
  const cartonGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  cartonGeometry.translate(0, size.y / 2, 0);
  let shipped = 0;

  const yawOf = (dir) => Math.atan2(-dir.z, dir.x);
  const dirTo = (from, to) => {
    const l = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    return { x: (to.x - from.x) / l, z: (to.z - from.z) / l };
  };

  const arms = plan.arms.map((spot, k) => {
    const rig = rigFactory();
    rig.group.position.set(spot.base.x, 0, spot.base.z);
    rig.group.scale.setScalar(armScale);
    group.add(rig.group);
    const heap = { unit: null, cartons: [], ready: false, reserved: false };
    const beltD = belt.project(spot.belt);
    // Высота верхней коробки кучки (низ присосок).
    const heapTop = () => {
      const top = heap.cartons[heap.cartons.length - 1];
      return top ? 0.35 + top.position.y + size.y : 0.35 + crateH;
    };
    const unit = createArmUnit({
      rig,
      scale: armScale,
      tweens,
      from: {
        dir: dirTo(spot.base, spot.heap),
        radius: Math.hypot(spot.heap.x - spot.base.x, spot.heap.z - spot.base.z),
        height: heapTop,
        pick: {
          waiting: () => heap.ready && heap.cartons.length > 0,
          take() {
            const carton = heap.cartons.pop();
            if (!heap.cartons.length) clearHeap(heap);
            return carton ?? null;
          },
        },
      },
      to: {
        dir: dirTo(spot.base, spot.belt),
        radius: Math.hypot(spot.belt.x - spot.base.x, spot.belt.z - spot.base.z),
        height: () => BELT_TOP + size.y,
        ready: () => belt.canPut(beltD),
        put: (carton) => {
          belt.put(carton, beltD);
          return true;
        },
      },
      opsPerMinute,
      energyProfile,
      itemHeight: size.y,
    });
    return { id: k + 1, spot, rig, heap, unit, label: `рука ${k + 1}` };
  });

  // Поддон пустой — убрать его (кучка свободна для следующей паллеты).
  function clearHeap(heap) {
    const pallet = heap.unit;
    heap.unit = null;
    heap.ready = false;
    heap.reserved = false;
    if (pallet) tweens.move(pallet, group, { x: pallet.position.x, y: -0.5, z: pallet.position.z, rotY: pallet.rotation.y }, 0.8, { onDone: () => pallet.removeFromParent() });
  }

  /** Погрузчик ставит паллету в кучку руки: ящик раскладывается на коробки. */
  function placeHeap(arm, palletUnit) {
    const heap = arm.heap;
    heap.unit = palletUnit;
    const rotY = Math.atan2(plan.along.x, plan.along.z);
    tweens.move(palletUnit, group, { x: arm.spot.heap.x, y: 0, z: arm.spot.heap.z, rotY }, 0.7, {
      onDone: () => {
        // Ящик с обвязкой — это коробки: прячем общий ящик, ставим коробки.
        for (const child of palletUnit.children.slice(1)) child.visible = false;
        heap.cartons = [];
        for (let layer = 0; layer < CARTONS.layers; layer++) {
          for (let a = 0; a < CARTONS.across; a++) {
            for (let b = 0; b < CARTONS.along; b++) {
              const carton = new THREE.Mesh(cartonGeometry, crateMaterial);
              carton.castShadow = true;
              carton.position.set((a - (CARTONS.across - 1) / 2) * (size.x + 0.06), 0.35 + layer * (size.y + 0.04), (b - (CARTONS.along - 1) / 2) * (size.z + 0.06));
              palletUnit.add(carton);
              heap.cartons.push(carton);
            }
          }
        }
        heap.ready = true;
      },
    });
    return true;
  }

  function step(dt) {
    belt.step(dt);
    for (const arm of arms) arm.unit.step(dt);
    // Доехала до проёма — ушла за стену.
    for (let item = belt.takeAtEnd(); item; item = belt.takeAtEnd()) {
      item.removeFromParent();
      shipped += 1;
    }
  }

  return {
    arms,
    belt,
    placeHeap,
    step,
    getOps: () => arms.reduce((s, a) => s + a.unit.getOps(), 0),
    shipped: () => shipped,
    meters: arms.map((a) => a.unit.meter),
    obstacles: belt.obstacles,
    dispose() {
      belt.dispose();
      for (const arm of arms) {
        group.remove(arm.rig.group);
        arm.heap.unit?.removeFromParent();
      }
      group.remove(portal);
      cartonGeometry.dispose();
    },
  };
}
