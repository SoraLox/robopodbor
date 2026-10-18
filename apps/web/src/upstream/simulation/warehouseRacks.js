import * as THREE from "three";
import { PALETTE } from "./constants.js";
import { CELL, cellAt, cellWorldOrigin } from "./shape/shapeTypes.js";
import { CARGO_CRATE_COLOR } from "./loaders/cargo.js";

// Клетки-стеллажи, нарисованные в конструкторе формы склада (CELL.RACK),
// раньше были только плоской меткой на полу (floor.js/drawRackCells) — по
// просьбе пользователя здесь настоящая 3D-модель: каркас с ярусами и грузом
// на части полок, а не цветной квадрат.
const RACK_INSET = 0.3;
const POST_SIZE = 0.22;
// Ярусов по умолчанию; своё число — shape.rackTiers (из высоты потолка и паллеты,
// см. features/objects/layout/warehouseLayout.ts rackStorage), не выше стен.
const DEFAULT_TIERS = 3;
const MAX_TIERS = 5;
let TIERS = DEFAULT_TIERS;
const TIER_HEIGHT = 1.9;
const SHELF_THICKNESS = 0.12;
const PALLET_H = 0.35;
const CRATE_H = 1.2;

// Материалы и геометрии — свои на каждый вызов createRacks (а не общие на
// модуль), потому что возвращённую группу диспоузят через disposeTree при
// пересборке формы (как и стены, см. rebuildLevelWalls) — общие на модуль
// ресурсы такая диспоузка сломала бы при следующей пересборке.
function buildMaterials() {
  return {
    frame: new THREE.MeshStandardMaterial({ color: PALETTE.storage, flatShading: true, roughness: 0.6 }),
    // Груз на полках — тот же вид, что у паллет, которые возят роботы.
    crate: new THREE.MeshStandardMaterial({ color: CARGO_CRATE_COLOR, flatShading: true, roughness: 0.6 }),
    pallet: new THREE.MeshStandardMaterial({ color: PALETTE.cargoPallet, flatShading: true, roughness: 0.85 }),
    strap: new THREE.MeshStandardMaterial({ color: PALETTE.cargoStrap, flatShading: true, roughness: 0.7 }),
  };
}

// Стеллаж стыкуется с соседним вплотную (сплошной ряд, как на складе): отступ
// от края клетки — только с тех сторон, где соседа-стеллажа нет.
// edges — отступы {xMin, xMax, zMin, zMax} от краёв клетки.
function buildRackUnit(size, seed, materials, geometries, edges) {
  const group = new THREE.Group();
  const x0 = -size / 2 + edges.xMin;
  const x1 = size / 2 - edges.xMax;
  const z0 = -size / 2 + edges.zMin;
  const z1 = size / 2 - edges.zMax;

  for (const x of [x0, x1]) {
    for (const z of [z0, z1]) {
      const post = new THREE.Mesh(geometries.post, materials.frame);
      post.position.set(x, (TIERS * TIER_HEIGHT) / 2, z);
      post.castShadow = true;
      group.add(post);
    }
  }

  for (let tier = 0; tier <= TIERS; tier++) {
    const shelf = new THREE.Mesh(geometries.shelf, materials.frame);
    shelf.scale.set((x1 - x0) / size, 1, (z1 - z0) / size);
    shelf.position.set((x0 + x1) / 2, tier * TIER_HEIGHT, (z0 + z1) / 2);
    shelf.receiveShadow = true;
    group.add(shelf);
  }

  // Не все ярусы заняты — читается как настоящий рабочий склад, а не забитая
  // декорация. Паллета помечена клеткой и ярусом: диспетчер склада заменяет её
  // своими паллетами, которые ставят и снимают роботы.
  for (let tier = 0; tier < TIERS; tier++) {
    if ((seed + tier) % 3 === 2) continue;
    const goods = new THREE.Group();
    const y0 = tier * TIER_HEIGHT + SHELF_THICKNESS / 2;
    const parts = [
      [geometries.pallet, materials.pallet, PALLET_H / 2],
      [geometries.crate, materials.crate, PALLET_H + CRATE_H / 2],
      [geometries.strap, materials.strap, PALLET_H + CRATE_H / 2],
    ];
    for (const [geometry, material, y] of parts) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      goods.add(mesh);
    }
    goods.position.y = y0;
    goods.userData.rackGoods = { tier };
    group.add(goods);
  }

  return group;
}

export function createRacks(shape) {
  const group = new THREE.Group();
  if (!shape) return group;
  TIERS = Math.max(1, Math.min(MAX_TIERS, Math.round(shape.rackTiers ?? DEFAULT_TIERS)));

  const materials = buildMaterials();
  const half = shape.cellSize / 2 - RACK_INSET;
  const geometries = {
    post: new THREE.BoxGeometry(POST_SIZE, TIERS * TIER_HEIGHT, POST_SIZE),
    shelf: new THREE.BoxGeometry(shape.cellSize, SHELF_THICKNESS, shape.cellSize),
    pallet: new THREE.BoxGeometry(Math.min(2.7, half * 1.8), PALLET_H, Math.min(1.9, half * 1.3)),
    crate: new THREE.BoxGeometry(Math.min(2.6, half * 1.75), CRATE_H, Math.min(1.8, half * 1.25)),
    strap: new THREE.BoxGeometry(Math.min(2.64, half * 1.77), 0.18, Math.min(1.84, half * 1.27)),
  };

  let seed = 0;

  for (let gz = 0; gz < shape.gridSize; gz++) {
    for (let gx = 0; gx < shape.gridSize; gx++) {
      if (cellAt(shape, gx, gz) !== CELL.RACK) continue;

      const rackAt = (dx, dz) => cellAt(shape, gx + dx, gz + dz) === CELL.RACK;
      const edge = (dx, dz) => (rackAt(dx, dz) ? 0 : RACK_INSET);
      const unit = buildRackUnit(shape.cellSize, seed++, materials, geometries, {
        xMin: edge(-1, 0),
        xMax: edge(1, 0),
        zMin: edge(0, -1),
        zMax: edge(0, 1),
      });
      const origin = cellWorldOrigin(gx, gz);
      unit.position.set(origin.x + shape.cellSize / 2, 0, origin.z + shape.cellSize / 2);
      unit.userData.rackCell = { gx, gz };
      group.add(unit);
    }
  }

  return group;
}
