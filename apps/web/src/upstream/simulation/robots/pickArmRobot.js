import * as THREE from "three";
import { buildConveyors } from "./armRobot.js";
import { createGlbModel } from "./glbModel.js";

// Роборука отбора — модель пользователя (public/models/pick_arm.glb, исходник —
// assets-src/models/pick_arm.glb): шестиосевой манипулятор с вакуумным захватом.
// В файле детали лежат плоским списком, без иерархии и анимаций, поэтому при
// загрузке собираем из них цепочку звеньев по осям модели:
//   плита основания (неподвижна) → колонна A1 (поворот вокруг вертикали) →
//   плечо A2 → локоть A3 → кисть A5 с присосками (держим её вертикальной).
// Позу считает обратная кинематика в плоскости руки: присоски приходят точно
// в заданную точку (коробка на ленте), без «рука повернулась, коробка
// телепортировалась».

// Оси и точки — в координатах файла (метры модели, Y вверх, рука вытянута по +Z).
const A1 = { x: -0.168, z: -0.273 }; // вертикальная ось колонны
const FLOOR_Y = 0.12; // низ плиты основания
const BASE_SPLIT_Y = 0.36; // выше — поворотная колонна, ниже — плита
const SHOULDER = new THREE.Vector3(-0.31, 0.953, 0);
const ELBOW = new THREE.Vector3(-0.31, 2.558, 0);
const WRIST = new THREE.Vector3(-0.31, 2.585, 1.895);
const PAD = new THREE.Vector3(-0.31, 2.17, 1.895); // низ присосок

const BASE = "Это база";
const UPPER_ARM = ["Cube.001"];
const FOREARM = ["Cube.002", "Cube.003"];
const TOOL = ["Cube.005", "Cube.006", "Cylinder", "Cylinder.001", "Cylinder.002", "Cylinder.003"];

// Плоскость руки: радиус вперёд от оси A1 (u) и высота над полом (v).
const S_U = SHOULDER.z - A1.z;
const S_V = SHOULDER.y - FLOOR_Y;
const L1 = ELBOW.y - SHOULDER.y;
const L2 = Math.hypot(WRIST.z - ELBOW.z, WRIST.y - ELBOW.y);
const REST1 = Math.PI / 2;
const REST2 = Math.atan2(WRIST.y - ELBOW.y, WRIST.z - ELBOW.z);
const PAD_DROP = WRIST.y - PAD.y;
const LATERAL = PAD.x - A1.x; // присоски чуть в стороне от оси колонны

// Высоты захвата над полом ячейки (единицы руки = единицы ячейки armRobot):
// верх коробки на ленте и высота переноса над лентами.
export const PICK_HEIGHT = 0.82 + 0.34;
const CARRY_HEIGHT = 1.9;
const REACH = 2.0; // до оси ленты (ARM_BELT_X)

// Треугольники меша делим по высоте: плита остаётся на месте, колонна крутится.
function splitByHeight(mesh, splitY) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
  const low = [];
  const high = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    let y = 0;
    for (let k = 0; k < 3; k++) y += v.fromBufferAttribute(position, index[i + k]).applyMatrix4(mesh.matrixWorld).y;
    (y / 3 < splitY ? low : high).push(index[i], index[i + 1], index[i + 2]);
  }
  const part = (list) => {
    const g = geometry.clone();
    g.setIndex(list);
    const m = new THREE.Mesh(g, mesh.material);
    m.matrixAutoUpdate = false;
    m.matrix.copy(mesh.matrixWorld);
    m.matrixWorld.copy(mesh.matrixWorld);
    return m;
  };
  return [part(low), part(high)];
}

function pivotAt(parent, name, point) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.copy(point);
  parent.add(pivot);
  pivot.updateMatrixWorld(true);
  return pivot;
}

export function preparePickArm(gltfScene) {
  gltfScene.updateMatrixWorld(true);
  // GLTFLoader чистит имена узлов (PropertyBinding.sanitizeNodeName): пробел → «_», точки убирает.
  const byName = (name) => gltfScene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

  // Всё — в координатах файла; внешняя группа ставит ось A1 в начало, плиту на пол.
  const root = new THREE.Group();
  const frame = new THREE.Group();
  frame.position.set(-A1.x, -FLOOR_Y, -A1.z);
  root.add(frame);
  root.updateMatrixWorld(true);

  const turret = pivotAt(frame, "turret", new THREE.Vector3(A1.x, 0, A1.z));
  const shoulder = pivotAt(turret, "shoulder", SHOULDER.clone().sub(turret.position));
  const elbow = pivotAt(shoulder, "elbow", ELBOW.clone().sub(SHOULDER));
  const wrist = pivotAt(elbow, "wrist", WRIST.clone().sub(ELBOW));
  const grip = pivotAt(wrist, "grip", PAD.clone().sub(WRIST));

  // Меш кладём в звено с сохранением положения из файла: матрица файла
  // пересчитывается в систему звена (через frame, который сдвигает начало).
  const place = (object, parent) => {
    const matrix = frame.matrixWorld.clone().multiply(object.matrixWorld);
    object.removeFromParent();
    parent.updateMatrixWorld(true);
    object.matrixAutoUpdate = true;
    object.matrix.copy(parent.matrixWorld.clone().invert().multiply(matrix));
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    parent.add(object);
  };

  const base = byName(BASE);
  const baseMeshes = [];
  base.traverse((o) => o.isMesh && baseMeshes.push(o));
  for (const mesh of baseMeshes) {
    const [low, high] = splitByHeight(mesh, BASE_SPLIT_Y);
    place(low, frame);
    place(high, turret);
  }
  base.removeFromParent();

  for (const name of UPPER_ARM) place(byName(name), shoulder);
  for (const name of FOREARM) place(byName(name), elbow);
  for (const name of TOOL) place(byName(name), wrist);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

export const pickArmModel = createGlbModel("pick_arm.glb", preparePickArm);

// Поза руки: yaw — направление на цель (как угол пивота процедурной руки:
// 0 → +X, π → −X), radius — до цели по горизонтали от оси колонны, height —
// высота низа присосок над полом ячейки.
export function poseArm(joints, yaw, radius, height) {
  const u = Math.sqrt(Math.max(1e-6, radius * radius - LATERAL * LATERAL));
  const wu = u;
  const wv = height + PAD_DROP;
  const du = wu - S_U;
  const dv = wv - S_V;
  const d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, Math.hypot(du, dv)));
  const gamma = Math.atan2(dv, du);
  const beta = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const d1 = gamma + beta; // локоть вверх, как у промышленных манипуляторов
  const eu = S_U + L1 * Math.cos(d1);
  const ev = S_V + L1 * Math.sin(d1);
  const d2 = Math.atan2(wv - ev, wu - eu);

  // Направление на цель: (cos yaw, −sin yaw); рука вытянута по +Z колонны.
  const psi = yaw + Math.PI / 2;
  joints.turret.rotation.y = psi - Math.atan2(LATERAL, u);
  joints.shoulder.rotation.x = REST1 - d1;
  joints.elbow.rotation.x = REST2 - d2 - (REST1 - d1);
  // Кисть держит присоски вертикально при любом положении плеча и локтя.
  joints.wrist.rotation.x = -(joints.shoulder.rotation.x + joints.elbow.rotation.x);
}

export function makePickArmRig(accentColor, beltTexture) {
  const group = new THREE.Group();
  const model = pickArmModel.clone();
  group.add(model);
  const joints = {
    turret: model.getObjectByName("turret"),
    shoulder: model.getObjectByName("shoulder"),
    elbow: model.getObjectByName("elbow"),
    wrist: model.getObjectByName("wrist"),
  };
  const claw = model.getObjectByName("grip");

  const beltMat = new THREE.MeshStandardMaterial({ map: beltTexture, flatShading: true, roughness: 0.7, metalness: 0.0 });
  const boxes = buildConveyors(group, beltMat);

  // dip: 1 — присоски на коробке у ленты, 0 — рука поднята для переноса.
  const pose = (yaw, dip) => poseArm(joints, yaw, REACH, CARRY_HEIGHT + (PICK_HEIGHT - CARRY_HEIGHT) * dip);
  pose(Math.PI, 0);

  return { group, pivot: joints.turret, claw, boxes, pose };
}
