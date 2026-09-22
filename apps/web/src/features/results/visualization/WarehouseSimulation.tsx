/**
 * WarehouseSimulation — изометрическая 3D-иллюстрация того, как автоматизация
 * работает на площадке: роботы-уборщики едут галсами по зоне пола, роборуки
 * снимают и укладывают коробки на конвейер. Условная площадка 100×100 м —
 * это демонстрация механики автоматизации, а не отрисовка конкретного
 * расчёта: числа (CAPEX, сроки) считаются независимо и здесь не участвуют.
 *
 * Помимо ручного управления (масштаб, поворот, число роботов, скорость),
 * сцена реагирует на то, что читает пользователь в отчёте рядом — это её
 * роль «живого спутника» отчёта, а не отдельного виджета:
 *  - `sceneVariant` — наведение на строку сценария гасит роботов («как есть»)
 *    или подсвечивает аренду тёплым светом («RaaS»);
 *  - `highlightZone` — наведение на статью затрат зажигает прожектор над
 *    нужной зоной площадки;
 *  - `sensitivityPulse` — наведение на фактор чувствительности заставляет
 *    сцену слегка «дышать» пропорционально силе влияния;
 *  - `flashSignal` — инкремент на каждый экспорт даёт короткую вспышку,
 *    как будто в отчёт попадает кадр из симуляции;
 *  - сцена также ускоряется на быстрой прокрутке страницы — типичный
 *    «сканирующий» жест читателя отчёта отражается в темпе анимации.
 *
 * Портировано и переработано из прототипа команды симуляции (репозиторий
 * bam-low/lct, src/simulation/WarehouseScene.jsx): сохранена вся механика
 * анимации и раскладки, восстановлена типизация и заменена палитра — как
 * и остальная 3D-графика продукта (см. RobotArmHero.tsx), корпуса нейтральны,
 * акцент несёт только один синий цвет плюс временные смысловые подсветки.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  Maximize,
  Minimize,
  Minus,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  RotateCw,
  Sparkles,
  Users,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FLOOR, LANE_MIN_X, MARGIN, Z_MAX, Z_MIN, computeZoneWidths, type SimMode } from './layout';

const GRID = FLOOR;
const CANVAS_PX = 512;
const PX_PER_M = CANVAS_PX / FLOOR;
const CANVAS_HEIGHT = 420;

const MODEL_SCALE = 1.7;

// Пылесос — загруженная glb-модель (~1 м шириной, низ на y = 0).
// VACUUM_MODEL_SCALE — во сколько раз увеличиваем её в сцене.
const VACUUM_MODEL_SCALE = 3.0;
// Пылесос всегда ориентирован вдоль оси Z, поэтому для объезда роборук важна
// половина его ширины (по X).
const VACUUM_HALF_WIDTH = 0.5 * VACUUM_MODEL_SCALE;
// Ширина захвата = ширина корпуса — соседние пылесосы у границ чанков не наезжают друг на друга.
const VACUUM_SWATH = 2 * VACUUM_HALF_WIDTH;
// Лёгкий зазор над полом, чтобы колёса не мерцали вместе с плоскостью следа.
const VACUUM_FLOOR_OFFSET = 0.03;
// Прозрачность белого следа — общая для всего слоя, задаётся на материале.
const TRAIL_OPACITY = 0.6;

// Роборуки
const ARM_BELT_X = 2.0;
const ARM_BELT_HALF_WIDTH = 1.45 / 2;
const ARM_BELT_HALF_LENGTH = 6;
const ARM_BELT_START_Z = -5.85;
const ARM_BELT_END_Z = 5.85;
const ARM_PICKUP_Z = 0;
const ARM_LENGTH = 2.0;
const BOX_GAP = 0.85;
const ARM_LEFT_ANGLE = Math.PI;
const ARM_RIGHT_ANGLE = 0;
const ARM_PICKUP_Y = -0.92;
const ARM_CARRY_Y = -0.15;

// Габариты препятствия «роборука» (основание + оба конвейера, с учётом
// MODEL_SCALE и небольшого запаса) — чтобы пылесосы визуально объезжали
// роборуки, а не проезжали сквозь их модельки.
const ARM_OBSTACLE_HALF_X = (ARM_BELT_X + ARM_BELT_HALF_WIDTH) * MODEL_SCALE + 0.5;
const ARM_OBSTACLE_HALF_Z = ARM_BELT_HALF_LENGTH * MODEL_SCALE + 0.5;
// Ширина зоны (по Z), на которой манёвр объезда плавно включается/выключается.
const DODGE_TRANSITION_Z = 1.2;

// Сколько реального времени (не игрового, не зависящего от speedMult) занимает
// полное растворение следа после того, как робот закончил свой участок.
const TRAIL_FADE_SECONDS = 1.4;
const FADE_RATE = 3.2; // экспоненциальная скорость растворения

// Условная производительность демо-робота по каждому процессу — фиксированные
// иллюстративные значения, не связанные с решениями из конкретного расчёта.
const VACUUM_PROD_M2_PER_H = 1800;
const ARM_PROD_OPS_PER_H = 900;
const AUTO_VACUUM_COUNT = 3;
const AUTO_ARM_COUNT = 2;

// Нейтральный металл + один синий акцент — та же логика, что у RobotArmHero:
// корпуса не спорят цветом, акцент несёт только смысловую подсветку.
const PALETTE = {
  floor: '#43465E',
  storage: '#3A3D52',
  armZone: '#454A66',
  pad: '#2E76D6',
  crateA: '#C7CCDA',
  crateB: '#AEB4C6',
  crateC: '#8B92A8',
  robotBody: '#F4F1EA',
  armAccents: ['#2E76D6', '#5C8FDD', '#8AABE6'],
  belt: '#2A2C3D',
  beltStripe: '#6B7CA8',
  spotlight: '#EAF1FB',
  raas: '#F2B25C',
} as const;

const ISO_ELEV = Math.atan(1 / Math.sqrt(2));
const SPOT_TARGET_ON = 9;
const SPOT_TARGET_PARTIAL = 4.5;

/** Раздел отчёта, который сейчас «читает» пользователь. */
export type SimSceneVariant = 'as-is' | 'raas' | null;
export type SimHighlightZone = 'vacuum' | 'arm' | 'all' | null;

export interface WarehouseSimulationProps {
  className?: string;
  /** Наведение на строку сценария: гасит роботов («как есть») или подсвечивает аренду. */
  sceneVariant?: SimSceneVariant;
  /** Наведение на статью затрат или сценарий: включает прожектор над зоной. */
  highlightZone?: SimHighlightZone;
  /** Сила наведения на фактор чувствительности, 0..1 — сцена «дышит» пропорционально. */
  sensitivityPulse?: number;
  /** Увеличивайте при каждом экспорте — короткая вспышка «снимка» сцены. */
  flashSignal?: number;
}

// ============================================================
// Геометрия и утилиты
// ============================================================

interface Chunk {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  row: number;
  col: number;
}

function computeChunks(count: number, zoneWidth: number, zoneOffsetX: number): Chunk[] {
  const zoneLength = Z_MAX - Z_MIN;
  const cols = Math.max(1, Math.round(Math.sqrt((count * zoneWidth) / zoneLength)));
  const fullRows = Math.floor(count / cols);
  const remainder = count - fullRows * cols;
  const totalRows = fullRows + (remainder > 0 ? 1 : 0);
  const rowHeight = zoneLength / totalRows;

  const chunks: Chunk[] = [];

  for (let row = 0; row < totalRows; row++) {
    const colsInRow = row < fullRows ? cols : remainder;
    if (colsInRow <= 0) continue;

    const colWidth = zoneWidth / colsInRow;

    for (let c = 0; c < colsInRow; c++) {
      chunks.push({
        xMin: zoneOffsetX + c * colWidth,
        xMax: zoneOffsetX + (c + 1) * colWidth,
        zMin: Z_MIN + row * rowHeight,
        zMax: Z_MIN + (row + 1) * rowHeight,
        row,
        col: c,
      });
    }
  }

  return chunks;
}

function buildRowCenters(chunk: Chunk): number[] {
  const width = chunk.xMax - chunk.xMin;
  const numRows = Math.max(1, Math.ceil(width / VACUUM_SWATH));
  const centers: number[] = [];

  for (let i = 0; i < numRows; i++) {
    let rx = chunk.xMin + VACUUM_SWATH * (i + 0.5);
    if (rx > chunk.xMax - VACUUM_SWATH / 2) rx = chunk.xMax - VACUUM_SWATH / 2;
    centers.push(rx);
  }

  return centers;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function applyColorSpace(target: THREE.WebGLRenderer | THREE.Texture, isRenderer: boolean) {
  if (isRenderer) {
    (target as THREE.WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
  } else {
    (target as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  }
}

function at<T>(arr: readonly T[], index: number, fallback: T): T {
  return arr[((index % arr.length) + arr.length) % arr.length] ?? fallback;
}

// ============================================================
// Объезд препятствий и след — роборуки стационарны, поэтому их препятствия
// считаются один раз при пересборке сцены; пылесосы визуально огибают их,
// не наезжая моделькой, но покрытие/след продолжают использовать номинальную
// (необъезжающую) траекторию.
// ============================================================

interface ObstacleRect {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

function computeArmObstacles(arms: ArmRobotState[]): ObstacleRect[] {
  return arms.map((a) => ({
    x: a.group.position.x,
    z: a.group.position.z,
    halfX: ARM_OBSTACLE_HALF_X,
    halfZ: ARM_OBSTACLE_HALF_Z,
  }));
}

function dodgeX(x: number, z: number, obstacles: ObstacleRect[], clearance: number): number {
  let result = x;

  for (const ob of obstacles) {
    const padX = ob.halfX + clearance;
    if (Math.abs(x - ob.x) >= padX) continue;

    const outerZ = ob.halfZ + DODGE_TRANSITION_Z;
    const dz = Math.abs(z - ob.z);
    if (dz >= outerZ) continue;

    const side = x >= ob.x ? 1 : -1;
    const targetX = ob.x + side * padX;

    let t = 1;
    if (dz > ob.halfZ) {
      t = 1 - (dz - ob.halfZ) / DODGE_TRANSITION_Z;
    }

    result = x + (targetX - x) * t;
  }

  return result;
}

interface PixelRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function toPx(worldX: number, worldZ: number) {
  return { x: (worldX + FLOOR / 2) * PX_PER_M, z: (worldZ + FLOOR / 2) * PX_PER_M };
}

function chunkToPixelRect(chunk: Chunk): PixelRect {
  const a = toPx(chunk.xMin, chunk.zMin);
  const b = toPx(chunk.xMax, chunk.zMax);
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
}

/** След — ровная белая полоса; полупрозрачность задаётся один раз на материале слоя. */
function drawTrailSegment(
  ctx: CanvasRenderingContext2D,
  fromWorld: { x: number; z: number },
  toWorld: { x: number; z: number },
  clipRectPx: PixelRect,
) {
  const from = toPx(fromWorld.x, fromWorld.z);
  const to = toPx(toWorld.x, toWorld.z);

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipRectPx.x0, clipRectPx.z0, clipRectPx.x1 - clipRectPx.x0, clipRectPx.z1 - clipRectPx.z0);
  ctx.clip();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = VACUUM_SWATH * PX_PER_M;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(from.x, from.z);
  ctx.lineTo(to.x, to.z);
  ctx.stroke();

  ctx.restore();
}

/** Постепенно стирает след в пределах прямоугольника через destination-out. */
function fadeTrailRect(ctx: CanvasRenderingContext2D, rectPx: PixelRect, dt: number) {
  const alpha = 1 - Math.exp(-FADE_RATE * dt);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(rectPx.x0, rectPx.z0, rectPx.x1 - rectPx.x0, rectPx.z1 - rectPx.z0);
  ctx.restore();
}

function clearTrailRect(ctx: CanvasRenderingContext2D, rectPx: PixelRect) {
  ctx.clearRect(rectPx.x0, rectPx.z0, rectPx.x1 - rectPx.x0, rectPx.z1 - rectPx.z0);
}

// ============================================================
// Внутреннее состояние робота-уборщика и роборуки
// ============================================================

interface VacuumRobotState {
  group: THREE.Group;
  chunk: Chunk;
  chunkPx: PixelRect;
  rowCenters: number[];
  rowIdx: number;
  x: number;
  z: number;
  lastRenderX: number;
  lastZ: number;
  dirZ: 1 | -1;
  done: boolean;
  fading: boolean;
  fadeTime: number;
}

interface BoxUserData {
  state: 'input' | 'waiting' | 'carried' | 'output';
  z: number;
  side: 1 | -1;
}

interface ArmRobotState {
  group: THREE.Group;
  pivot: THREE.Group;
  claw: THREE.Mesh;
  boxes: THREE.Mesh[];
  phase: number;
  transferBox: THREE.Mesh | null;
  lastGoingRight: boolean | undefined;
}

interface SceneRefs {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  trailCtx: CanvasRenderingContext2D;
  trailTexture: THREE.CanvasTexture;
  camDist: number;
  beltTexture: THREE.CanvasTexture;
  vacuumGroup: THREE.Group;
  armGroup: THREE.Group;
  vacuums: VacuumRobotState[];
  arms: ArmRobotState[];
  armObstacles: ObstacleRect[];
  grid: Uint8Array;
  raf: number;
  theta: number;
  thetaTarget: number;
  opsAcc: number;
  simAcc: number;
  lastDone: number;
  camZoom: number;
  lastTime: number;
  updateCamera: () => void;
  applyFrustum: () => void;
  // --- «живой спутник»: подсветки, свет, темп ---
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;
  baseAmbientIntensity: number;
  baseHemiIntensity: number;
  raasLight: THREE.PointLight;
  raasLightTarget: number;
  spotVacuum: THREE.SpotLight;
  spotArm: THREE.SpotLight;
  spotVacuumTarget: number;
  spotArmTarget: number;
  dimTarget: number;
  dimCurrent: number;
  sensitivityMagnitude: number;
  scrollBoost: number;
}

// ============================================================
// Модель пылесоса — glb, загружается один раз на всё приложение.
// ============================================================

const VACUUM_MODEL_URL = `${import.meta.env.BASE_URL}models/vacuum.glb`;

let vacuumTemplate: THREE.Group | null = null;
let vacuumLoadingPromise: Promise<void> | null = null;

// Центрирует модель по XZ и ставит низ (колёса) на y = 0 — так же, как
// у прочих групп на сцене, независимо от того, как экспортирован сам файл.
function prepareVacuumTemplate(gltfScene: THREE.Group): THREE.Group {
  gltfScene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(gltfScene);
  const center = box.getCenter(new THREE.Vector3());
  gltfScene.position.set(-center.x, -box.min.y, -center.z);

  const root = new THREE.Group();
  root.add(gltfScene);
  return root;
}

function loadVacuumModel(): Promise<void> {
  if (!vacuumLoadingPromise) {
    vacuumLoadingPromise = new GLTFLoader().loadAsync(VACUUM_MODEL_URL).then((gltf) => {
      vacuumTemplate = prepareVacuumTemplate(gltf.scene);
    });
  }
  return vacuumLoadingPromise;
}

/** Вызывать только после loadVacuumModel(): геометрия и материалы общие у всех клонов. */
function makeVacuumRobot(): THREE.Group {
  if (!vacuumTemplate) throw new Error('Модель пылесоса ещё не загружена');
  return vacuumTemplate.clone(true);
}

// ============================================================
// Основной компонент
// ============================================================

export function WarehouseSimulation({
  className,
  sceneVariant = null,
  highlightZone = null,
  sensitivityPulse = 0,
  flashSignal = 0,
}: WarehouseSimulationProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const st = useRef<Partial<SceneRefs>>({}).current;

  const [mode, setMode] = useState<SimMode>('both');
  const [manualVacuumCount, setManualVacuumCount] = useState(AUTO_VACUUM_COUNT);
  const [manualArmCount, setManualArmCount] = useState(AUTO_ARM_COUNT);
  const [running, setRunning] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [coverage, setCoverage] = useState(0);
  const [opsDone, setOpsDone] = useState(0);
  const [simSeconds, setSimSeconds] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [camZoom, setCamZoom] = useState(52);
  const [speedMult, setSpeedMult] = useState(1);
  // glb-модель пылесоса грузится асинхронно; роботов собираем только после неё.
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [flashing, setFlashing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const useVacuum = mode === 'vacuum' || mode === 'both';
  const useArm = mode === 'arm' || mode === 'both';
  const vacuumCount = useVacuum ? manualVacuumCount : 0;
  const armCount = useArm ? manualArmCount : 0;

  const { vacuumZoneWidth, armZoneWidth, zoneSplitX, vacuumZoneAreaM2 } = computeZoneWidths(mode);

  const vacuumProd = VACUUM_PROD_M2_PER_H;
  const armProdPerMin = ARM_PROD_OPS_PER_H / 60;

  const vacuumSpeed = useVacuum ? vacuumProd / (VACUUM_SWATH * 3600) : 0;
  const armCycleHz = useArm ? armProdPerMin / 60 : 0;
  const totalOpsCapacity = useArm ? armCount * armProdPerMin * 60 : 0;

  // ==========================================================
  // Сцена — создаётся один раз
  // ==========================================================

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight || CANVAS_HEIGHT;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x777a8f, 145, 245);

    const hemiLight = new THREE.HemisphereLight(0xe9e3ff, 0x35384e, 3);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0x777b9d, 0.17);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffdca2, 3);
    keyLight.position.set(38, 90, 32);
    keyLight.castShadow = true;
    keyLight.shadow.camera.left = -70;
    keyLight.shadow.camera.right = 70;
    keyLight.shadow.camera.top = 70;
    keyLight.shadow.camera.bottom = -70;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 230;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.00012;
    keyLight.shadow.normalBias = 0.035;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8498d4, 0.3);
    fillLight.position.set(-45, 48, -42);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffb36f, 0.22);
    rimLight.position.set(-25, 34, 58);
    scene.add(rimLight);

    // Тёплый точечный свет аренды (RaaS) — гасится нулевой интенсивностью по умолчанию.
    const raasLight = new THREE.PointLight(PALETTE.raas, 0, 90, 1.8);
    raasLight.position.set(0, 26, 0);
    scene.add(raasLight);

    // Два «музейных прожектора» — над зоной уборки и зоной сортировки.
    // Наведение на статью затрат/сценарий зажигает нужный, гасит другой.
    const spotVacuum = new THREE.SpotLight(PALETTE.spotlight, 0, 130, Math.PI / 7, 0.55, 1.4);
    const spotArm = new THREE.SpotLight(PALETTE.spotlight, 0, 130, Math.PI / 7, 0.55, 1.4);
    [spotVacuum, spotArm].forEach((spot) => {
      spot.position.set(0, 48, 0);
      scene.add(spot);
      scene.add(spot.target);
    });

    // Текстура пола
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    applyColorSpace(texture, false);

    const floorMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      flatShading: true,
      roughness: 0.68,
      metalness: 0.04,
    });

    const floorTop = new THREE.Mesh(new THREE.BoxGeometry(FLOOR, 2, FLOOR), floorMaterial);
    floorTop.position.y = -1;
    floorTop.receiveShadow = true;
    scene.add(floorTop);

    // Отдельный прозрачный слой поверх пола — на нём рисуется след пылесосов.
    // Раздельный слой нужен, чтобы след можно было стереть/растворить для
    // одного робота, не трогая статичный рисунок пола и площадку роборук.
    const trailCanvas = document.createElement('canvas');
    trailCanvas.width = CANVAS_PX;
    trailCanvas.height = CANVAS_PX;
    const trailCtx = trailCanvas.getContext('2d');
    if (!trailCtx) return;
    const trailTexture = new THREE.CanvasTexture(trailCanvas);
    trailTexture.anisotropy = 8;
    applyColorSpace(trailTexture, false);

    const trailMaterial = new THREE.MeshBasicMaterial({
      map: trailTexture,
      transparent: true,
      opacity: TRAIL_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });

    const trailPlane = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR, FLOOR), trailMaterial);
    trailPlane.rotation.x = -Math.PI / 2;
    trailPlane.position.y = 0.02;
    scene.add(trailPlane);

    const floorBase = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR + 6, 6, FLOOR + 6),
      new THREE.MeshStandardMaterial({ color: 0x2b2d3e, flatShading: true, roughness: 0.92 }),
    );
    floorBase.position.y = -5.35;
    floorBase.receiveShadow = true;
    scene.add(floorBase);

    // Боковые складские блоки
    const crateColors = [PALETTE.crateA, PALETTE.crateB, PALETTE.crateC];

    ([-1, 1] as const).forEach((side) => {
      for (let i = 0; i < 5; i++) {
        const h = 3 + ((i * 7) % 5);

        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(MARGIN - 3, h, 6),
          new THREE.MeshStandardMaterial({
            color: at(crateColors, i, PALETTE.crateA),
            flatShading: true,
            roughness: 0.6,
          }),
        );
        crate.position.set(side * (FLOOR / 2 - MARGIN / 2), h / 2, -40 + i * 18);
        crate.castShadow = true;
        crate.receiveShadow = true;
        scene.add(crate);

        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(MARGIN - 3.05, 0.08, 6.05),
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, roughness: 0.58 }),
        );
        edge.position.y = h / 2 + 0.05;
        crate.add(edge);
      }
    });

    // Текстура конвейеров
    const beltCanvas = document.createElement('canvas');
    beltCanvas.width = 128;
    beltCanvas.height = 32;
    const bctx = beltCanvas.getContext('2d');
    if (bctx) {
      bctx.fillStyle = PALETTE.belt;
      bctx.fillRect(0, 0, 128, 32);
      bctx.fillStyle = PALETTE.beltStripe;

      for (let i = -32; i < 128; i += 24) {
        bctx.beginPath();
        bctx.moveTo(i, 32);
        bctx.lineTo(i + 12, 0);
        bctx.lineTo(i + 17, 0);
        bctx.lineTo(i + 5, 32);
        bctx.fill();
      }
    }

    const beltTexture = new THREE.CanvasTexture(beltCanvas);
    beltTexture.wrapS = THREE.RepeatWrapping;
    beltTexture.wrapT = THREE.RepeatWrapping;
    beltTexture.repeat.set(3, 1);
    beltTexture.anisotropy = 8;
    applyColorSpace(beltTexture, false);

    // Камера (ортографическая, изометрия)
    const camDist = 108;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    applyColorSpace(renderer, true);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const vacuumGroup = new THREE.Group();
    const armGroup = new THREE.Group();
    scene.add(vacuumGroup, armGroup);

    Object.assign(st, {
      scene,
      renderer,
      camera,
      ctx,
      texture,
      trailCtx,
      trailTexture,
      camDist,
      beltTexture,
      vacuumGroup,
      armGroup,
      vacuums: [],
      arms: [],
      armObstacles: [],
      grid: new Uint8Array(GRID * GRID),
      raf: 0,
      theta: Math.PI / 4,
      thetaTarget: Math.PI / 4,
      opsAcc: 0,
      simAcc: 0,
      lastDone: 0,
      camZoom: 52,
      lastTime: 0,
      ambientLight,
      hemiLight,
      baseAmbientIntensity: ambientLight.intensity,
      baseHemiIntensity: hemiLight.intensity,
      raasLight,
      raasLightTarget: 0,
      spotVacuum,
      spotArm,
      spotVacuumTarget: 0,
      spotArmTarget: 0,
      dimTarget: 1,
      dimCurrent: 1,
      sensitivityMagnitude: 0,
      scrollBoost: 0,
    } satisfies Omit<SceneRefs, 'updateCamera' | 'applyFrustum'>);

    const updateCamera = () => {
      const t = st.theta ?? 0;
      const d = st.camDist ?? camDist;

      camera.position.set(
        d * Math.cos(ISO_ELEV) * Math.sin(t),
        d * Math.sin(ISO_ELEV),
        d * Math.cos(ISO_ELEV) * Math.cos(t),
      );

      camera.lookAt(0, 0, 0);
    };

    const applyFrustum = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight || CANVAS_HEIGHT;
      const a = w / h;
      const hh = st.camZoom ?? 40;

      camera.left = -hh * a;
      camera.right = hh * a;
      camera.top = hh;
      camera.bottom = -hh;
      camera.updateProjectionMatrix();
    };

    st.updateCamera = updateCamera;
    st.applyFrustum = applyFrustum;
    updateCamera();
    applyFrustum();

    loadVacuumModel()
      .then(() => setModelState('ready'))
      .catch((error: unknown) => {
        console.error('Не удалось загрузить модель пылесоса:', error);
        setModelState('error');
      });

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight || CANVAS_HEIGHT);
      applyFrustum();
    };

    window.addEventListener('resize', onResize);

    // Меняется не только окно: разворот в полный экран и рост панели при
    // прилипании тоже двигают размеры контейнера без события resize.
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      window.removeEventListener('resize', onResize);
      resizeObserver.disconnect();
      cancelAnimationFrame(st.raf ?? 0);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================
  // Ускорение от скорости прокрутки страницы — «сканирующий» жест
  // читателя разгоняет анимацию, спокойное чтение её не трогает.
  // ==========================================================

  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();

    const onScroll = () => {
      const now = performance.now();
      const dt = Math.max(now - lastT, 1);
      const dy = Math.abs(window.scrollY - lastY);
      const velocity = dy / dt;

      st.scrollBoost = Math.min((st.scrollBoost ?? 0) + velocity * 6, 2.5);
      lastY = window.scrollY;
      lastT = now;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [st]);

  // ==========================================================
  // Zoom
  // ==========================================================

  useEffect(() => {
    if (!st.scene) return;
    st.camZoom = camZoom;
    st.applyFrustum?.();
  }, [camZoom, st]);

  // ==========================================================
  // Сценарий наведения: «как есть» гасит роботов, «RaaS» подсвечивает
  // тёплым — то, что справа читает пользователь, физически видно в сцене.
  // ==========================================================

  useEffect(() => {
    if (!st.vacuumGroup || !st.armGroup) return;

    const isIdle = sceneVariant === 'as-is';
    st.vacuumGroup.visible = !isIdle;
    st.armGroup.visible = !isIdle;
    st.dimTarget = isIdle ? 0.42 : 1;
    st.raasLightTarget = sceneVariant === 'raas' ? 1.4 : 0;
  }, [sceneVariant, st]);

  // ==========================================================
  // Прожектор над зоной — наведение на статью затрат или строку сценария.
  // ==========================================================

  useEffect(() => {
    st.spotVacuumTarget =
      highlightZone === 'vacuum' ? SPOT_TARGET_ON : highlightZone === 'all' ? SPOT_TARGET_PARTIAL : 0;
    st.spotArmTarget = highlightZone === 'arm' ? SPOT_TARGET_ON : highlightZone === 'all' ? SPOT_TARGET_PARTIAL : 0;
  }, [highlightZone, st]);

  // ==========================================================
  // Пульс от наведения на фактор чувствительности — сцена «дышит».
  // ==========================================================

  useEffect(() => {
    st.sensitivityMagnitude = Math.max(0, Math.min(1, sensitivityPulse));
  }, [sensitivityPulse, st]);

  // ==========================================================
  // Вспышка-«снимок» при экспорте.
  // ==========================================================

  const flashSignalRef = useRef(flashSignal);
  useEffect(() => {
    if (flashSignal === flashSignalRef.current) return;
    flashSignalRef.current = flashSignal;
    setFlashing(true);
    const timeout = window.setTimeout(() => setFlashing(false), 550);
    return () => window.clearTimeout(timeout);
  }, [flashSignal]);

  // ==========================================================
  // Пересборка роботов при смене режима/количества
  // ==========================================================

  useEffect(() => {
    if (!st.scene || !st.vacuumGroup || !st.armGroup || !st.ctx || !st.texture || !st.grid) return;
    if (!st.trailCtx || !st.trailTexture) return;
    // Роботы ждут загрузку glb-модели — иначе собирать нечего.
    if (modelState !== 'ready') return;

    st.vacuumGroup.clear();
    st.armGroup.clear();
    st.vacuums = [];
    st.arms = [];

    if (useArm && armCount > 0 && st.beltTexture) {
      const armX = zoneSplitX + armZoneWidth / 2;
      const spacing = (Z_MAX - Z_MIN) / armCount;

      for (let i = 0; i < armCount; i++) {
        const z = Z_MIN + spacing * (i + 0.5);
        const built = makeArmRobot(at(PALETTE.armAccents, i, PALETTE.armAccents[0]), st.beltTexture);

        built.group.position.set(armX, 0, z);
        built.group.scale.setScalar(MODEL_SCALE);
        st.armGroup?.add(built.group);

        st.arms?.push({ ...built, phase: Math.random(), transferBox: null, lastGoingRight: undefined });
      }
    }

    // Роборуки стационарны — их препятствия для объезда считаются один раз,
    // сразу после того, как они расставлены.
    st.armObstacles = computeArmObstacles(st.arms ?? []);

    let vacuumChunks: Chunk[] = [];

    if (useVacuum && vacuumCount > 0) {
      vacuumChunks = computeChunks(vacuumCount, vacuumZoneWidth, LANE_MIN_X);

      vacuumChunks.forEach((chunk) => {
        const rowCenters = buildRowCenters(chunk);
        const startX = rowCenters[0] ?? chunk.xMin;
        const g = makeVacuumRobot();

        g.scale.setScalar(VACUUM_MODEL_SCALE);
        g.position.set(startX, VACUUM_FLOOR_OFFSET, chunk.zMin);
        st.vacuumGroup?.add(g);

        st.vacuums?.push({
          group: g,
          chunk,
          chunkPx: chunkToPixelRect(chunk),
          rowCenters,
          rowIdx: 0,
          x: startX,
          z: chunk.zMin,
          lastRenderX: startX,
          lastZ: chunk.zMin,
          dirZ: 1,
          done: false,
          fading: false,
          fadeTime: 0,
        });
      });
    }

    // Прожекторы целятся в центр своей зоны — актуально при каждом пересчёте раскладки.
    if (st.spotVacuum && st.spotArm) {
      const vacuumCenterX = LANE_MIN_X + vacuumZoneWidth / 2;
      const armCenterX = zoneSplitX + armZoneWidth / 2;
      const centerZ = (Z_MIN + Z_MAX) / 2;

      st.spotVacuum.position.set(vacuumCenterX, 48, centerZ);
      st.spotVacuum.target.position.set(vacuumCenterX, 0, centerZ);
      st.spotVacuum.target.updateMatrixWorld();

      st.spotArm.position.set(armCenterX, 48, centerZ);
      st.spotArm.target.position.set(armCenterX, 0, centerZ);
      st.spotArm.target.updateMatrixWorld();
    }

    // След — отдельный слой поверх статичного пола, чистим его при каждой
    // пересборке, иначе старые следы останутся видны после сброса/смены режима.
    st.trailCtx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
    st.trailTexture.needsUpdate = true;

    st.grid.fill(0);
    drawBaseFloor(st.ctx, { armZoneWidth, zoneSplitX, armCount });
    st.texture.needsUpdate = true;

    st.opsAcc = 0;
    st.simAcc = 0;
    st.lastDone = 0;

    setCoverage(0);
    setOpsDone(0);
    setSimSeconds(0);
    setDoneCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, vacuumCount, armCount, resetKey, modelState]);

  // ==========================================================
  // Анимация
  // ==========================================================

  useEffect(() => {
    if (!st.scene || !st.renderer || !st.camera) return;

    const EPS = 1e-6;
    const MARK_RADIUS = (VACUUM_SWATH / 2) * 1.2;

    const advanceVacuum = (dt: number): number => {
      let newly = 0;

      for (const r of st.vacuums ?? []) {
        if (!r.done) {
          r.z += r.dirZ * vacuumSpeed * dt;

          const atMax = r.dirZ > 0 && r.z >= r.chunk.zMax;
          const atMin = r.dirZ < 0 && r.z <= r.chunk.zMin;

          if (atMax || atMin) {
            r.z = atMax ? r.chunk.zMax : r.chunk.zMin;
            r.rowIdx++;

            const nextX = r.rowCenters[r.rowIdx];
            if (nextX === undefined) {
              r.done = true;
              r.fading = true;
              r.fadeTime = 0;
            } else {
              r.dirZ = (r.dirZ * -1) as 1 | -1;
              r.x = nextX;
            }
          }

          // Пылесос физически чистит номинальную клетку (r.x/r.z), но
          // визуально слегка объезжает роборуки, если те попадаются на пути —
          // модельки не должны наезжать друг на друга.
          const renderX = dodgeX(r.x, r.z, st.armObstacles ?? [], VACUUM_HALF_WIDTH);

          r.group.position.set(renderX, VACUUM_FLOOR_OFFSET, r.z);
          r.group.rotation.y = r.dirZ > 0 ? 0 : Math.PI;

          if (Math.abs(renderX - r.lastRenderX) > 0.0001 || Math.abs(r.z - r.lastZ) > 0.0001) {
            if (st.trailCtx) {
              drawTrailSegment(st.trailCtx, { x: r.lastRenderX, z: r.lastZ }, { x: renderX, z: r.z }, r.chunkPx);
            }
            r.lastRenderX = renderX;
            r.lastZ = r.z;
            if (st.trailTexture) st.trailTexture.needsUpdate = true;
          }
        }

        // Расчёт покрытия — по номинальной траектории, без объезда.
        const c = r.chunk;
        const minGX = Math.max(0, Math.floor(Math.max(r.x - MARK_RADIUS, c.xMin) + FLOOR / 2));
        const maxGX = Math.min(GRID - 1, Math.ceil(Math.min(r.x + MARK_RADIUS, c.xMax) + FLOOR / 2));
        const minGZ = Math.max(0, Math.floor(Math.max(r.z - MARK_RADIUS, c.zMin) + FLOOR / 2));
        const maxGZ = Math.min(GRID - 1, Math.ceil(Math.min(r.z + MARK_RADIUS, c.zMax) + FLOOR / 2));

        for (let gx = minGX; gx <= maxGX; gx++) {
          for (let gz = minGZ; gz <= maxGZ; gz++) {
            const wx = gx - FLOOR / 2 + 0.5;
            const wz = gz - FLOOR / 2 + 0.5;

            if (wx < c.xMin - EPS || wx > c.xMax + EPS || wz < c.zMin - EPS || wz > c.zMax + EPS) continue;

            if ((wx - r.x) ** 2 + (wz - r.z) ** 2 <= MARK_RADIUS ** 2) {
              const idx = gz * GRID + gx;
              if (st.grid && !st.grid[idx]) {
                st.grid[idx] = 1;
                newly++;
              }
            }
          }
        }
      }

      return newly;
    };

    // Как только робот заканчивает участок, его след начинает растворяться —
    // в реальном времени, независимо от множителя скорости симуляции.
    const updateFades = (dt: number) => {
      for (const r of st.vacuums ?? []) {
        if (!r.fading || !st.trailCtx) continue;

        r.fadeTime += dt;
        fadeTrailRect(st.trailCtx, r.chunkPx, dt);
        if (st.trailTexture) st.trailTexture.needsUpdate = true;

        if (r.fadeTime >= TRAIL_FADE_SECONDS) {
          clearTrailRect(st.trailCtx, r.chunkPx);
          if (st.trailTexture) st.trailTexture.needsUpdate = true;
          r.fading = false;
        }
      }
    };

    const findWaitingBox = (a: ArmRobotState): THREE.Mesh | null => {
      let best: THREE.Mesh | null = null;
      let bestDistance = Infinity;

      for (const box of a.boxes) {
        const data = box.userData as BoxUserData;
        if (data.state !== 'waiting') continue;

        const distance = Math.abs(data.z - ARM_PICKUP_Z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = box;
        }
      }

      return best;
    };

    const advanceInputQueue = (boxesSide: THREE.Mesh[], dt: number, rate: number) => {
      const queue = boxesSide.filter((b) => {
        const data = b.userData as BoxUserData;
        return data.state === 'input' || data.state === 'waiting';
      });
      queue.sort((a, b) => (b.userData as BoxUserData).z - (a.userData as BoxUserData).z);

      let limit = ARM_PICKUP_Z;

      queue.forEach((box) => {
        const data = box.userData as BoxUserData;
        let z = data.z + rate * dt;
        if (z > limit) z = limit;

        data.z = z;
        box.position.set(-ARM_BELT_X, 0.82, z);
        data.state = z >= ARM_PICKUP_Z - 1e-3 ? 'waiting' : 'input';
        limit = z - BOX_GAP;
      });
    };

    const advanceOutputQueue = (boxesSide: THREE.Mesh[], dt: number, rate: number) => {
      const queue = boxesSide.filter((b) => (b.userData as BoxUserData).state === 'output');
      queue.sort((a, b) => (a.userData as BoxUserData).z - (b.userData as BoxUserData).z);

      let limit = -Infinity;

      queue.forEach((box) => {
        const data = box.userData as BoxUserData;
        let z = data.z + rate * dt;
        if (z < limit) z = limit;

        data.z = z;
        box.position.set(ARM_BELT_X, 0.82, z);
        box.rotation.y += dt * 0.8;
        limit = z + BOX_GAP;

        if (data.z >= ARM_BELT_END_Z) {
          data.state = 'input';
          data.side = -1;
          data.z = ARM_BELT_START_Z;
          box.position.set(-ARM_BELT_X, 0.82, ARM_BELT_START_Z);
          box.rotation.set(0, 0, 0);
        }
      });
    };

    const advanceArm = (dt: number) => {
      for (const a of st.arms ?? []) {
        const cycleDuration = 1 / Math.max(armCycleHz, 0.001);
        a.phase = (a.phase + dt / cycleDuration) % 1;
        if (a.phase < 0) a.phase += 1;

        const phase = a.phase;
        const goingRight = phase < 0.5;
        const legPhase = goingRight ? phase * 2 : (phase - 0.5) * 2;
        const eased = easeInOut(legPhase);

        const ARM_RIGHT_FAR = ARM_RIGHT_ANGLE + Math.PI * 2;

        const angle = goingRight
          ? ARM_LEFT_ANGLE + (ARM_RIGHT_FAR - ARM_LEFT_ANGLE) * eased
          : ARM_RIGHT_FAR - (ARM_RIGHT_FAR - ARM_LEFT_ANGLE) * eased;

        const dip = Math.cos(Math.PI * legPhase) ** 2;
        const clawY = ARM_CARRY_Y + (ARM_PICKUP_Y - ARM_CARRY_Y) * dip;

        a.pivot.rotation.y = angle;
        a.claw.position.y = clawY;

        const boxes = a.boxes;
        if (!boxes.length) continue;

        const rate = 1.45 * Math.max(1, armProdPerMin / 15);

        const inputSide = boxes.filter((b) => {
          const data = b.userData as BoxUserData;
          return data.side === -1 && data.state !== 'carried';
        });
        const outputSide = boxes.filter((b) => {
          const data = b.userData as BoxUserData;
          return data.side === 1 && data.state !== 'carried';
        });

        advanceInputQueue(inputSide, dt, rate);
        advanceOutputQueue(outputSide, dt, rate);

        if (a.lastGoingRight === undefined) a.lastGoingRight = goingRight;

        if (a.lastGoingRight && !goingRight) {
          if (a.transferBox) {
            const box = a.transferBox;
            a.claw.remove(box);
            const data = box.userData as BoxUserData;
            data.state = 'output';
            data.side = 1;
            data.z = ARM_PICKUP_Z;
            box.rotation.set(0, 0, 0);
            box.position.set(ARM_BELT_X, 0.82, ARM_PICKUP_Z);
            a.group.add(box);
            a.transferBox = null;
            if (st.opsAcc !== undefined) st.opsAcc += 1;
          }
        }

        if (!a.lastGoingRight && goingRight) {
          if (!a.transferBox) {
            const pickupBox = findWaitingBox(a);

            if (pickupBox) {
              a.transferBox = pickupBox;
              (pickupBox.userData as BoxUserData).state = 'carried';
              a.claw.add(pickupBox);
              pickupBox.position.set(0, -0.34, 0);
              pickupBox.rotation.set(0, 0, 0);
            }
          }
        }

        a.lastGoingRight = goingRight;
      }
    };

    const tick = (timestamp: number) => {
      st.raf = requestAnimationFrame(tick);

      const last = st.lastTime || timestamp;
      const realDt = Math.min((timestamp - last) / 1000, 0.1);
      st.lastTime = timestamp;

      st.theta = (st.theta ?? 0) + ((st.thetaTarget ?? 0) - (st.theta ?? 0)) * 0.12;
      st.updateCamera?.();

      // Затухающее ускорение от прокрутки — считается каждый кадр, даже на паузе.
      st.scrollBoost = (st.scrollBoost ?? 0) * 0.92;
      const dtScale = 1 + Math.min(st.scrollBoost ?? 0, 2);

      // Плавные переходы света и подсветок — не дёргаются даже при частой смене наведения.
      st.dimCurrent = lerp(st.dimCurrent ?? 1, st.dimTarget ?? 1, 0.08);
      if (st.ambientLight && st.baseAmbientIntensity !== undefined) {
        st.ambientLight.intensity = st.baseAmbientIntensity * st.dimCurrent;
      }
      if (st.hemiLight && st.baseHemiIntensity !== undefined) {
        st.hemiLight.intensity = st.baseHemiIntensity * lerp(0.5, 1, st.dimCurrent);
      }
      if (st.raasLight) {
        st.raasLight.intensity = lerp(st.raasLight.intensity, st.raasLightTarget ?? 0, 0.08);
      }
      if (st.spotVacuum) {
        st.spotVacuum.intensity = lerp(st.spotVacuum.intensity, st.spotVacuumTarget ?? 0, 0.1);
      }
      if (st.spotArm) {
        st.spotArm.intensity = lerp(st.spotArm.intensity, st.spotArmTarget ?? 0, 0.1);
      }

      // «Дыхание» сцены при наведении на фактор чувствительности.
      const pulse = st.sensitivityMagnitude ? Math.sin(timestamp / 140) * st.sensitivityMagnitude * 0.05 : 0;
      st.vacuumGroup?.scale.setScalar(1 + pulse);
      st.armGroup?.scale.setScalar(1 + pulse);

      if (running) {
        const mult = speedMult;
        const boostedDt = realDt * dtScale;

        if (st.beltTexture) {
          st.beltTexture.offset.y -= 0.45 * boostedDt * mult;
        }

        let newlyTotal = 0;
        st.simAcc = (st.simAcc ?? 0) + boostedDt * mult;

        for (let step = 0; step < mult; step++) {
          if (useVacuum) newlyTotal += advanceVacuum(boostedDt);
          if (useArm) advanceArm(boostedDt);
        }

        // Угасание следа — в реальном времени, один раз за кадр (не за суб-шаг).
        updateFades(realDt);

        setSimSeconds(st.simAcc);

        if (useVacuum) {
          if (newlyTotal > 0 && st.grid) {
            let total = 0;
            for (let i = 0; i < st.grid.length; i++) total += st.grid[i] ?? 0;

            setCoverage(vacuumZoneAreaM2 > 0 ? Math.min(100, (total / vacuumZoneAreaM2) * 100) : 0);
          }

          const nowDone = (st.vacuums ?? []).filter((r) => r.done).length;

          if (nowDone !== st.lastDone) {
            st.lastDone = nowDone;
            setDoneCount(nowDone);
          }
        }

        if (useArm) {
          setOpsDone(Math.floor(st.opsAcc ?? 0));
        }
      }

      st.renderer?.render(st.scene as THREE.Scene, st.camera as THREE.OrthographicCamera);
    };

    st.raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(st.raf ?? 0);
  }, [running, vacuumSpeed, armCycleHz, useVacuum, useArm, armCount, armProdPerMin, vacuumZoneAreaM2, speedMult, st]);

  // ==========================================================
  // Во весь экран — сцена и её управление разворачиваются на весь монитор,
  // не только на канвас: та же 3D-сцена продолжает рендериться в тот же
  // <div>, ResizeObserver выше сам подгонит камеру под новые габариты.
  // ==========================================================

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === cardRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void cardRef.current?.requestFullscreen();
    }
  };

  // ==========================================================
  // Меню «ещё»: всё, кроме базовых кнопок, спрятано за круглой кнопкой —
  // сцена должна доминировать, а не тонуть в панелях управления.
  // ==========================================================

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // ==========================================================
  // Управление
  // ==========================================================

  const rotate = (dir: number) => {
    if (st.thetaTarget === undefined) return;
    st.thetaTarget += dir * (Math.PI / 2);
  };

  const zoomBy = (delta: number) => setCamZoom((z) => Math.max(22, Math.min(60, z + delta)));

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const allVacuumsDone = useVacuum && vacuumCount > 0 && doneCount === vacuumCount;

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative h-[520px] overflow-hidden rounded-xl bg-canvas lg:h-full',
        className,
      )}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {/* Вспышка-«снимок» при экспорте отчёта */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-500"
        style={{ opacity: flashing ? 0.85 : 0 }}
      />

      {sceneVariant === 'as-is' ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-foreground/85 px-3 py-1.5 text-[11px] font-semibold text-background backdrop-blur-sm">
          <Users className="size-3.5" strokeWidth={2} />
          Ручной процесс, без автоматизации
        </div>
      ) : null}

      {sceneVariant === 'raas' ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#8a5a1f] px-3 py-1.5 text-[11px] font-semibold text-white">
          <Repeat className="size-3.5" strokeWidth={2} />
          Сценарий «Аренда» (RaaS)
        </div>
      ) : null}

      {modelState === 'error' ? (
        <div className="absolute left-3 top-3 rounded-full bg-status-danger px-3 py-1.5 text-[11px] font-semibold text-white">
          Не удалось загрузить модель пылесоса
        </div>
      ) : null}

      {/* Круглая кнопка «ещё» — всё, кроме базовых кнопок ниже, спрятано здесь. */}
      <div ref={menuRef} className="absolute right-3 top-3">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Ещё настройки"
          aria-expanded={menuOpen}
          className="grid size-9 place-items-center rounded-full bg-background/90 text-foreground shadow-soft backdrop-blur-sm transition-colors hover:bg-background"
        >
          <MoreVertical className="size-4" strokeWidth={2} />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 mt-2 w-[300px] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-lift">
            <div className="grid grid-cols-2 gap-2.5">
              {useVacuum ? <Stat label="Убрано площади" value={`${coverage.toFixed(1)}%`} /> : null}
              {useVacuum ? <Stat label="Роботов закончило" value={`${doneCount}/${vacuumCount}`} /> : null}
              {useArm ? <Stat label="Обработано, шт" value={String(opsDone)} /> : null}
              {useArm ? <Stat label="Темп роборук" value={`${totalOpsCapacity.toFixed(0)} оп/ч`} /> : null}
              <Stat label="Время" value={fmtTime(simSeconds)} />
            </div>

            {allVacuumsDone ? (
              <p className="mt-2 text-[12px] font-medium text-status-operation">
                Все роботы закончили свои участки — зона убрана на {coverage.toFixed(0)}%.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              <ModeToggle mode={mode} onChange={setMode} />

              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">Скорость</span>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 4, 8, 18, 32].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSpeedMult(m)}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                        speedMult === m
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-canvas text-muted-foreground hover:bg-muted/60',
                      )}
                    >
                      {m}×
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              {useVacuum ? (
                <RobotCountPanel
                  icon={Sparkles}
                  title="Роботы-уборщики"
                  autoCount={AUTO_VACUUM_COUNT}
                  count={manualVacuumCount}
                  prod={vacuumProd}
                  prodUnit="м²/ч"
                  onChange={setManualVacuumCount}
                  min={1}
                  max={8}
                />
              ) : null}

              {useArm ? (
                <RobotCountPanel
                  icon={Wrench}
                  title="Роборуки"
                  autoCount={AUTO_ARM_COUNT}
                  count={manualArmCount}
                  prod={armProdPerMin * 60}
                  prodUnit="оп/ч"
                  onChange={setManualArmCount}
                  min={1}
                  max={6}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Базовые кнопки — прямо на сцене, всегда видны. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-t from-black/45 to-transparent p-3">
        <OverlayButton onClick={() => setRunning((r) => !r)} label={running ? 'Пауза' : 'Продолжить'}>
          {running ? <Pause className="size-3.5" strokeWidth={2} /> : <Play className="size-3.5" strokeWidth={2} />}
        </OverlayButton>

        <OverlayButton onClick={() => setResetKey((k) => k + 1)} label="Сбросить">
          <RotateCcw className="size-3.5" strokeWidth={2} />
        </OverlayButton>

        <div className="ml-auto flex gap-1.5">
          <OverlayIconButton onClick={() => zoomBy(-6)} label="Приблизить">
            <ZoomIn className="size-4" strokeWidth={1.8} />
          </OverlayIconButton>
          <OverlayIconButton onClick={() => zoomBy(6)} label="Отдалить">
            <ZoomOut className="size-4" strokeWidth={1.8} />
          </OverlayIconButton>
          <OverlayIconButton onClick={() => rotate(-1)} label="Повернуть влево">
            <RotateCcw className="size-4" strokeWidth={1.8} />
          </OverlayIconButton>
          <OverlayIconButton onClick={() => rotate(1)} label="Повернуть вправо">
            <RotateCw className="size-4" strokeWidth={1.8} />
          </OverlayIconButton>
          <OverlayIconButton onClick={toggleFullscreen} label={isFullscreen ? 'Свернуть' : 'На весь экран'}>
            {isFullscreen ? (
              <Minimize className="size-4" strokeWidth={1.8} />
            ) : (
              <Maximize className="size-4" strokeWidth={1.8} />
            )}
          </OverlayIconButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// UI-компоненты
// ============================================================

/** Круглая кнопка поверх сцены — тёмный сценический фон вместо панели, всегда читается. */
function OverlayIconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 flex-none place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
    >
      {children}
    </button>
  );
}

/** Базовая кнопка с подписью поверх сцены (пауза/сброс) — тот же тёмный стиль. */
function OverlayButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25"
    >
      {children}
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[16px] font-semibold tabular">{value}</div>
    </div>
  );
}

const MODE_LABEL: Record<SimMode, string> = { vacuum: 'Уборка', arm: 'Сортировка', both: 'Оба процесса' };

function ModeToggle({ mode, onChange }: { mode: SimMode; onChange: (mode: SimMode) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-muted-foreground">Процесс</span>
      <div className="flex gap-1">
        {(Object.keys(MODE_LABEL) as SimMode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
              mode === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-canvas text-muted-foreground hover:bg-muted/60',
            )}
          >
            {MODE_LABEL[key]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RobotCountPanel({
  icon: Icon,
  title,
  autoCount,
  count,
  prod,
  prodUnit,
  onChange,
  min,
  max,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  autoCount: number;
  count: number;
  prod: number;
  prodUnit: string;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" strokeWidth={1.8} />
        <span className="text-[13px] font-semibold">{title}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, count - 1))}
          disabled={count <= min}
          className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-30"
        >
          <Minus className="size-3.5" strokeWidth={2} />
        </button>
        <span className="w-6 text-center text-[13px] font-semibold tabular">{count}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, count + 1))}
          disabled={count >= max}
          className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-30"
        >
          <Plus className="size-3.5" strokeWidth={2} />
        </button>
        <span className="text-[11.5px] text-muted-foreground">роботов (рекомендуем {autoCount})</span>
      </div>

      <p className="mt-1.5 text-[11.5px] text-meta-foreground">
        Один робот: {prod.toFixed(0)} {prodUnit}
      </p>
    </div>
  );
}

// ============================================================
// Пол
// ============================================================

function drawBaseFloor(
  ctx: CanvasRenderingContext2D,
  { armZoneWidth, zoneSplitX, armCount }: { armZoneWidth: number; zoneSplitX: number; armCount: number },
) {
  ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

  if (armZoneWidth > 0) {
    const startPx = ((zoneSplitX + FLOOR / 2) / FLOOR) * CANVAS_PX;
    const widthPx = (armZoneWidth / FLOOR) * CANVAS_PX;

    ctx.fillStyle = PALETTE.armZone;
    ctx.fillRect(startPx, 0, widthPx, CANVAS_PX);

    const centerXpx = startPx + widthPx / 2;
    const spacing = CANVAS_PX / Math.max(1, armCount);

    ctx.fillStyle = PALETTE.pad;

    for (let i = 0; i < armCount; i++) {
      ctx.beginPath();
      ctx.arc(centerXpx, spacing * (i + 0.5), widthPx * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const gridStep = CANVAS_PX / 10;

  for (let i = 0; i <= 10; i++) {
    const p = i * gridStep;

    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, CANVAS_PX);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(CANVAS_PX, p);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, CANVAS_PX - 3, CANVAS_PX - 3);
}

// ============================================================
// Роборука
// ============================================================

function makeArmRobot(
  accentColor: string,
  beltTexture: THREE.CanvasTexture,
): { group: THREE.Group; pivot: THREE.Group; claw: THREE.Mesh; boxes: THREE.Mesh[] } {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({ color: PALETTE.robotBody, flatShading: true, roughness: 0.56 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, flatShading: true, roughness: 0.48 });
  const darkMat = new THREE.MeshStandardMaterial({ color: PALETTE.storage, flatShading: true, roughness: 0.6 });
  const beltMat = new THREE.MeshStandardMaterial({ map: beltTexture, flatShading: true, roughness: 0.7 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 1.1, 16), baseMat);
  base.position.y = 0.55;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), accentMat);
  collar.position.y = 1.25;
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);

  const pivot = new THREE.Group();
  pivot.position.y = 1.4;
  group.add(pivot);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM_LENGTH, 0.35, 0.35), accentMat);
  arm.position.x = ARM_LENGTH / 2;
  arm.castShadow = true;
  arm.receiveShadow = true;
  pivot.add(arm);

  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), darkMat);
  claw.position.set(ARM_LENGTH, ARM_CARRY_Y, 0);
  claw.castShadow = true;
  claw.receiveShadow = true;
  pivot.add(claw);

  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 0.52,
    roughness: 0.45,
    flatShading: true,
  });

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), tipMat);
  tip.position.set(ARM_LENGTH, ARM_CARRY_Y, 0.27);
  pivot.add(tip);

  const boxes: THREE.Mesh[] = [];

  ([-1, 1] as const).forEach((side) => {
    const x = side * ARM_BELT_X;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.45, 12),
      new THREE.MeshStandardMaterial({ color: 0x24263a, flatShading: true, roughness: 0.68 }),
    );
    frame.position.set(x, 0.0, 0);
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 11.7), beltMat);
    belt.position.set(x, 0.32, 0);
    belt.castShadow = true;
    belt.receiveShadow = true;
    group.add(belt);

    ([-0.58, 0.58] as const).forEach((offset) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 11.8),
        new THREE.MeshStandardMaterial({ color: 0x878ca2, flatShading: true, roughness: 0.58, metalness: 0.05 }),
      );
      rail.position.set(x + offset, 0.48, 0);
      rail.castShadow = true;
      rail.receiveShadow = true;
      group.add(rail);
    });
  });

  const colors = [PALETTE.crateA, PALETTE.crateB, PALETTE.crateC];

  for (let i = 0; i < 5; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.68, 0.68),
      new THREE.MeshStandardMaterial({ color: at(colors, i, PALETTE.crateA), flatShading: true, roughness: 0.6 }),
    );

    const startZ = ARM_BELT_START_Z + 0.5 + i * BOX_GAP;
    box.position.set(-ARM_BELT_X, 0.82, startZ);
    box.castShadow = true;
    box.receiveShadow = true;

    box.userData = { state: 'input', z: startZ, side: -1 } satisfies BoxUserData;

    group.add(box);
    boxes.push(box);
  }

  return { group, pivot, claw, boxes };
}

export default WarehouseSimulation;
