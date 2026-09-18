/**
 * RobotArmHero — шестиосевой манипулятор, следящий за курсором в 3D.
 *
 * ГЕОМЕТРИЯ процедурная: полный контроль над осями суставов, без чего
 * корректную кинематику на чужой модели не собрать. Цепь повторяет
 * промышленный манипулятор: тумба, поворотная колонна, вилка плеча,
 * плечо с кабель-каналом, локоть, предплечье с осью вращения, кистевой
 * узел из двух корпусов и трёхпалый крюковой захват.
 *
 * СТЕПЕНИ СВОБОДЫ — шесть, как у настоящего робота:
 *   J1 рыскание колонны вокруг Y   — разворачивает всю руку по азимуту
 *   J2 наклон плеча вокруг Z
 *   J3 наклон локтя вокруг Z
 *   J4 вращение предплечья вокруг своей оси X
 *   J5 наклон кисти вокруг Z
 *   J6 вращение инструмента вокруг X
 *
 * КИНЕМАТИКА. Цель — пересечение луча курсора с наклонной плоскостью,
 * проходящей через плечо. Такая цель всегда лежит на луче, поэтому
 * захват виден ровно под курсором, но его азимут, высота и ГЛУБИНА
 * меняются — рука работает в объёме, а не в одной плоскости. Дальше:
 *
 *   J1     = atan2(−dz, dx), с мягким ограничением до «анфаса» спереди
 *            и глубокого профиля сзади — см. ЛИМИТЫ ниже
 *   J2, J3 = планарная задача двух звеньев в повёрнутой плоскости:
 *            cos q3 = (r² − L1² − L2²) / (2·L1·L2)
 *            q2     = atan2(y, r) − atan2(L2·sin q3, L1 + L2·cos q3)
 *   J5     = доворот кисти на цель за вычетом уже набранных углов
 *
 * ЛИМИТЫ И ОЩУЩЕНИЕ ВЕСА. Формула выше всегда возвращает положительный
 * рыскающий угол (atan2 с положительным числителем), то есть рука сама
 * по себе никогда не «перекручивается» за спину — но без нижней границы
 * она могла довернуть до полного анфаса, а без верхней — до жёсткого
 * упора в глубокий профиль. Обе границы держатся не жёстким clamp, а
 * функцией `easeToward`: угол асимптотически подходит к пределу и
 * никогда не «влипает» в него рывком. Сами суставы движутся не линейной
 * интерполяцией, а затухающей пружиной (`springTo`) — с инерцией массы,
 * без резких скачков за курсором и с ограничением угловой скорости, так
 * рука ощущается тяжёлой, а не игрушечной.
 *
 * ПОКОЙ. Пока курсор внутри канваса, цель — пересечение луча с рабочей
 * плоскостью. Как только курсор уходит за пределы канваса (или страницы),
 * цель — фиксированная поза на три четверти (`IDLE`), и та же пружина
 * медленно, с той же инерцией, возвращает руку в исходное положение.
 *
 * @example
 * <RobotArmHero className="h-[440px] w-full" />
 */
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

/** Светлое серебро корпуса — тон корпуса ноутбука. */
const SILVER = '#DCDDE1';
/** Тёмные корпуса суставов и крышки. */
const GRAPHITE = '#82858C';
/** Глубокие щели, кабель-канал, внутренности захвата. */
const DARK = '#4E5058';
/** Акцентный индикатор — фирменный оранжевый платформы. */
const ACCENT = '#C2410C';

/** Длины звеньев и габариты сцены. */
const RIG = {
  columnHeight: 2.0,
  l1: 2.7,
  l2: 2.15,
  tool: 1.0,
} as const;

/** Пределы суставов. */
const D = Math.PI / 180;
const LIMITS = {
  /*
    Рыскание держится в одну сторону: atan2 с положительным числителем
    и так не даёт руке уйти «за спину», но сам по себе не мешал дойти
    до полного анфаса. yawFront — нижняя граница (ближе всего к анфасу,
    но не он сам), yawBack — верхняя (глубокий разворот в профиль, не
    доходящий до жёсткого упора вбок).
  */
  yawFront: 24 * D,
  yawBack: 104 * D,
  shoulderMin: -68 * D,
  shoulderMax: 148 * D,
  elbowMin: -156 * D,
  elbowMax: -16 * D,
  wrist: 132 * D,
} as const;

/** Зона, в которой угол гасится перед пределом, а не влипает в него. */
const MARGIN = {
  yaw: 11 * D,
  shoulder: 9 * D,
  elbow: 9 * D,
  wrist: 12 * D,
} as const;

/**
 * Базовая поза покоя — «на три четверти»: не анфас и не профиль.
 * Рука возвращается сюда, когда курсор покидает канвас.
 */
const IDLE = {
  yaw: 46 * D,
  shoulder: 52 * D,
  elbow: -92 * D,
  wrist: 14 * D,
} as const;

/** Наклон рабочей плоскости к экрану: даёт глубину без потери точности. */
const TILT = 13 * (Math.PI / 180);

/** Смещение базы вправо: рука работает по кадру влево. */
const BASE_X = 2.5;

/** Насколько крупнее вписанного по высоте/ширине кадра рисуем руку. */
const SIZE_BOOST = 1.14;

/** Раскрытие захвата, радианы. */
const CLAW = { closed: 0.1, open: 0.5 } as const;

const RAY = new THREE.Ray();
const PLANE = new THREE.Plane();
const NORMAL = new THREE.Vector3();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const HIT = new THREE.Vector3();
const LOCAL = new THREE.Vector3();
const NDC = new THREE.Vector3();

/**
 * Угол асимптотически подходит к границе и никогда её не касается —
 * замена жёсткому clamp, из-за которого сустав визуально «впечатывался»
 * в упор. За пределами зоны `margin` перед границей движение линейное,
 * внутри неё гасится по экспоненте.
 */
function easeToward(value: number, min: number, max: number, margin: number) {
  const hi = max - margin;
  if (value > hi) {
    const t = (value - hi) / margin;
    return hi + margin * (1 - Math.exp(-t));
  }
  const lo = min + margin;
  if (value < lo) {
    const t = (lo - value) / margin;
    return lo - margin * (1 - Math.exp(-t));
  }
  return value;
}

/** Настройка затухающей пружины на сустав: чем крупнее звено, тем она тяжелее. */
interface SpringTuning {
  stiffness: number;
  damping: number;
  maxSpeed: number;
}

const JOINTS: Record<'yaw' | 'shoulder' | 'elbow' | 'forearm' | 'wrist' | 'tool', SpringTuning> = {
  yaw: { stiffness: 8.5, damping: 7.2, maxSpeed: 1.5 },
  shoulder: { stiffness: 8, damping: 6.8, maxSpeed: 1.3 },
  elbow: { stiffness: 10, damping: 7.6, maxSpeed: 1.7 },
  forearm: { stiffness: 13, damping: 8, maxSpeed: 2.3 },
  wrist: { stiffness: 15, damping: 8.6, maxSpeed: 2.7 },
  tool: { stiffness: 17, damping: 8.8, maxSpeed: 3 },
};

// ─── Материалы ──────────────────────────────────────────────────────

/**
 * Матовый металл: металличность средняя, шероховатость высокая.
 * Полный металлик читался как зеркало, поэтому блик здесь мягкий и
 * широкий, а форму держат отражения окружения, а не резкие засветки.
 */
const makeShell = (color: string, roughness: number) =>
  new THREE.MeshStandardMaterial({
    color,
    // Ближе к настоящему металлу: PBR ждёт значение у 0 или 1, промежуточные
    // читаются как крашеный пластик. Зеркалом не становимся за счёт
    // шероховатости — блик остаётся широким.
    metalness: 0.88,
    roughness,
    envMapIntensity: 1.45,
  });

/**
 * Общие материалы на всю руку. Раньше каждый <Shell /> создавал новый
 * MeshStandardMaterial — 93 материала и 83 вызова отрисовки ради декорации.
 */
const MATERIALS = {
  silver: makeShell(SILVER, 0.29),
  graphite: makeShell(GRAPHITE, 0.34),
  dark: makeShell(DARK, 0.4),
} as const;

const INDICATOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: ACCENT,
  emissive: ACCENT,
  emissiveIntensity: 1.6,
  roughness: 0.35,
  metalness: 0.1,
});

function shellOf(color: string) {
  if (color === GRAPHITE) return MATERIALS.graphite;
  if (color === DARK) return MATERIALS.dark;
  return MATERIALS.silver;
}

function Shell({ color = SILVER }: { color?: string; rough?: number }) {
  return <primitive object={shellOf(color)} attach="material" />;
}

/** Индикаторный светодиод — фирменный акцент на корпусе. */
function Indicator({ position, radius = 0.035 }: { position: [number, number, number]; radius?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 14, 12]} />
      <primitive object={INDICATOR_MATERIAL} attach="material" />
    </mesh>
  );
}

// ─── Детали корпуса ─────────────────────────────────────────────────

/** Кольцо болтов по окружности фланца. */
function BoltRing({
  count = 8,
  radius,
  y = 0,
  size = 0.045,
}: {
  count?: number;
  radius: number;
  y?: number;
  size?: number;
}) {
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: count }, (_, index) => {
        const a = (index / count) * Math.PI * 2;
        return (
          <mesh key={a} position={[Math.cos(a) * radius, 0, Math.sin(a) * radius]}>
            <cylinderGeometry args={[size, size, 0.05, 8]} />
            <Shell color={DARK} rough={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Тумба: три уступа, фланец, болты и фирменная табличка. */
function Plinth() {
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.92, 1.05, 0.16, 56]} />
        <Shell color={GRAPHITE} rough={0.5} />
      </mesh>
      <BoltRing radius={0.8} y={0.17} count={10} />
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.66, 0.86, 0.26, 52]} />
        <Shell />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.58, 0.62, 0.12, 48]} />
        <Shell color={DARK} rough={0.48} />
      </mesh>
      {/* Табличка на тумбе */}
      <mesh position={[0, 0.29, 0.86]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.34, 0.16, 0.02]} />
        <Shell color={DARK} rough={0.42} />
      </mesh>
      <Indicator position={[0, 0.29, 0.87]} radius={0.024} />
    </group>
  );
}

/** Звено-труба вдоль +X с фасками, рёбрами и парой кабель-каналов. */
function Segment({
  length,
  radius,
  taper = 0.86,
}: {
  length: number;
  radius: number;
  taper?: number;
}) {
  return (
    <group>
      <mesh position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * taper, radius, length, 48]} />
        <Shell />
      </mesh>

      {/* Рёбра жёсткости */}
      {[0.16, 0.4, 0.64, 0.86].map((t) => (
        <mesh key={t} position={[length * t, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[radius * 1.04, radius * 1.04, radius * 0.16, 48]} />
          <Shell color={GRAPHITE} rough={0.46} />
        </mesh>
      ))}

      {/* Кабель-канал сверху */}
      <mesh position={[length * 0.52, radius * 0.92, 0]}>
        <boxGeometry args={[length * 0.66, radius * 0.3, radius * 0.5]} />
        <Shell color={DARK} rough={0.52} />
      </mesh>

      {/* Тонкий пневмошланг снизу — вторая линия детализации звена */}
      <mesh position={[length * 0.5, -radius * 0.86, radius * 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.11, radius * 0.11, length * 0.74, 16]} />
        <Shell color={DARK} rough={0.4} />
      </mesh>
    </group>
  );
}

/** Сустав: барабан с торцевыми крышками и болтами, ось — Z. */
function JointBarrel({ radius, width = 2.05 }: { radius: number; width?: number }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[radius, radius, radius * width, 52]} />
        <Shell rough={0.38} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, (side * radius * width) / 2, 0]}>
          <mesh>
            <cylinderGeometry args={[radius * 0.78, radius * 0.78, radius * 0.16, 48]} />
            <Shell color={GRAPHITE} rough={0.44} />
          </mesh>
          <mesh position={[0, side * 0.03, 0]}>
            <cylinderGeometry args={[radius * 0.3, radius * 0.3, radius * 0.22, 32]} />
            <Shell color={DARK} rough={0.5} />
          </mesh>
          <BoltRing radius={radius * 0.56} count={6} size={0.032} />
        </group>
      ))}
    </group>
  );
}

/** Вилка плеча: две щеки, между которыми сидит барабан сустава. */
function Yoke({ radius }: { radius: number }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[0, 0, side * radius * 1.12]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[radius * 1.16, radius * 1.16, radius * 0.3, 40]} />
          <Shell rough={0.44} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Трёхпалый крюковой захват — как у автомата с игрушками: толстые
 * загнутые внутрь когти на пневматическом хабе, а не тонкие фаланги.
 */
function Claw({ open }: { open: React.MutableRefObject<number> }) {
  const fingers = useRef<THREE.Group[]>([]);
  const vel = useRef<number[]>([0, 0, 0]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    fingers.current.forEach((finger, index) => {
      if (!finger) return;
      const target = -open.current;
      const previous = vel.current[index] ?? 0;
      const accel = 44 * (target - finger.rotation.z) - 12.5 * previous;
      const v = THREE.MathUtils.clamp(previous + accel * delta, -6, 6);
      vel.current[index] = v;
      finger.rotation.z += v * delta;
    });
  });

  return (
    <group>
      {/* Пневмохаб привода когтей */}
      <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.27, 0.3, 0.34, 44]} />
        <Shell rough={0.36} />
      </mesh>
      <mesh position={[0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.25, 0.24, 40]} />
        <Shell color={GRAPHITE} rough={0.42} />
      </mesh>
      <BoltRing radius={0.23} count={6} size={0.026} />
      <Indicator position={[0.58, 0.17, 0]} />

      {[0, 120, 240].map((deg, index) => (
        <group key={deg} rotation={[(deg * Math.PI) / 180, 0, 0]}>
          {/* Шарнирная костяшка когтя */}
          <mesh position={[0.62, 0.16, 0]}>
            <sphereGeometry args={[0.095, 20, 16]} />
            <Shell color={DARK} rough={0.46} />
          </mesh>

          <group
            ref={(node) => {
              if (node) fingers.current[index] = node;
            }}
            position={[0.62, 0.16, 0]}
          >
            {/* Основание когтя — толще, чем прежняя тонкая фаланга */}
            <mesh position={[0.23, 0.02, 0]} rotation={[0, 0, -0.3]}>
              <boxGeometry args={[0.48, 0.16, 0.18]} />
              <Shell rough={0.36} />
            </mesh>
            {/* Средний сегмент, уже уходящий на загиб внутрь */}
            <mesh position={[0.54, -0.15, 0]} rotation={[0, 0, -1.02]}>
              <boxGeometry args={[0.38, 0.14, 0.16]} />
              <Shell color={GRAPHITE} rough={0.4} />
            </mesh>
            {/* Загнутый крюк-кончик когтя */}
            <mesh position={[0.69, -0.38, 0]} rotation={[0, 0, -1.68]}>
              <boxGeometry args={[0.26, 0.11, 0.14]} />
              <Shell color={DARK} rough={0.46} />
            </mesh>
            <mesh position={[0.73, -0.53, 0]}>
              <sphereGeometry args={[0.06, 14, 12]} />
              <Shell color={DARK} rough={0.5} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// ─── Кинематика ─────────────────────────────────────────────────────

/** Аналитическое решение планарной задачи двух звеньев. */
function solve2R(r: number, y: number, l1: number, l2: number) {
  const dist = Math.hypot(r, y);
  const clamped = THREE.MathUtils.clamp(dist, Math.abs(l1 - l2) + 0.08, l1 + l2 - 0.04);
  const k = clamped / Math.max(dist, 1e-6);

  const cosElbow = THREE.MathUtils.clamp(
    (clamped * clamped - l1 * l1 - l2 * l2) / (2 * l1 * l2),
    -1,
    1,
  );
  const elbow = -Math.acos(cosElbow);
  const shoulder =
    Math.atan2(y * k, r * k) -
    Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow));

  return { shoulder, elbow, stretched: dist > l1 + l2 * 0.92 };
}

function Manipulator() {
  const j1 = useRef<THREE.Group>(null);
  const j2 = useRef<THREE.Group>(null);
  const j3 = useRef<THREE.Group>(null);
  const j4 = useRef<THREE.Group>(null);
  const j5 = useRef<THREE.Group>(null);
  const j6 = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const clawOpen = useRef<number>(CLAW.closed);
  const pointer = usePointerTracking();

  /* Угловая скорость каждого сустава — состояние затухающей пружины. */
  const vel = useRef({ j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 });

  /**
   * Пружина с массой вместо линейного демпфирования: угол разгоняется и
   * тормозит постепенно, с лёгкой инерцией, а угловая скорость ограничена
   * `maxSpeed` — курсор может дёрнуться мгновенно, рука так не умеет.
   */
  const springTo = (
    ref: React.RefObject<THREE.Group | null>,
    axis: 'x' | 'y' | 'z',
    key: keyof typeof vel.current,
    target: number,
    tuning: SpringTuning,
    dt: number,
  ) => {
    const g = ref.current;
    if (!g) return;
    const current = g.rotation[axis];
    const accel = tuning.stiffness * (target - current) - tuning.damping * vel.current[key];
    const v = THREE.MathUtils.clamp(vel.current[key] + accel * dt, -tuning.maxSpeed, tuning.maxSpeed);
    vel.current[key] = v;
    g.rotation[axis] = current + v * dt;
  };

  useFrame(({ camera }, rawDelta) => {
    const node = root.current;
    if (!node) return;
    const dt = Math.min(rawDelta, 1 / 30);

    let yaw = IDLE.yaw;
    let shoulder = IDLE.shoulder;
    let elbow = IDLE.elbow;
    let wrist = IDLE.wrist;
    let stretched = false;

    if (pointer.inside.current) {
      // Луч курсора.
      NDC.set(pointer.point.current.x, pointer.point.current.y, 0.5).unproject(camera);
      RAY.origin.copy(camera.position);
      RAY.direction.copy(NDC).sub(camera.position).normalize();

      // Плечо в мировых координатах — через него проходит рабочая плоскость.
      LOCAL.set(0, RIG.columnHeight, 0);
      node.localToWorld(LOCAL);

      /*
        Цель — пересечение луча курсора с наклонной плоскостью. Точка лежит
        на луче, поэтому захват виден ровно под курсором; наклон плоскости
        к экрану даёт разную глубину по горизонтали, и рука разворачивается
        по азимуту, работая в объёме. Плоскость, параллельная экрану, не дала
        бы глубины, а сфера уводила цель на сторону камеры — рука целилась в
        зрителя и рыскание упиралось в предел.
      */
      camera.getWorldDirection(NORMAL);
      NORMAL.applyAxisAngle(AXIS_Y, TILT).normalize();
      PLANE.setFromNormalAndCoplanarPoint(NORMAL, LOCAL);
      if (!RAY.intersectPlane(PLANE, HIT)) RAY.at(12, HIT);

      // В систему координат основания.
      node.worldToLocal(HIT);
      /*
        Цель всегда на стороне камеры: локальная −Z смотрит на зрителя, и
        отрицательный dz заставляет колонну разворачиваться через переднюю
        полусферу. Без этого рука уходила за цель кругом сзади — со стороны
        это выглядело как разворот «через спину».
      */
      const dx = Math.max(HIT.x, -1.2);
      const dy = HIT.y - RIG.columnHeight;
      const dz = THREE.MathUtils.clamp(HIT.z, -4.5, -0.25);

      // J1 — разворот колонны к цели по азимуту, зажатый между анфасом и
      // глубоким профилем: полного анфаса и разворота «направо мимо фронта»
      // формула ниже физически не допускает, а мягкая граница не даёт
      // визуально в них упереться.
      const yawRaw = Math.atan2(-dz, dx);
      yaw = easeToward(yawRaw, LIMITS.yawFront, LIMITS.yawBack, MARGIN.yaw);

      // Радиальная дистанция в повёрнутой плоскости; инструмент укорачивает цель.
      const radial = Math.hypot(dx, dz);
      const full = Math.hypot(radial, dy);
      const shrink = full > 1e-3 ? Math.max(full - RIG.tool, 0.2) / full : 1;

      const solved = solve2R(radial * shrink, dy * shrink, RIG.l1, RIG.l2);
      shoulder = easeToward(solved.shoulder, LIMITS.shoulderMin, LIMITS.shoulderMax, MARGIN.shoulder);
      elbow = easeToward(solved.elbow, LIMITS.elbowMin, LIMITS.elbowMax, MARGIN.elbow);

      // J5 — кисть доворачивает инструмент на цель.
      const wristRaw = Math.atan2(dy, radial) - (shoulder + elbow);
      wrist = easeToward(wristRaw, -LIMITS.wrist, LIMITS.wrist, MARGIN.wrist);

      stretched = solved.stretched;
    }

    // J4 и J6 — вращения вокруг собственных осей: дают объём движению,
    // повторяя разворот основания и наклон кисти.
    const forearmRoll = yaw * 0.55;
    const toolRoll = yaw * 0.8 + wrist * 0.25;

    springTo(j1, 'y', 'j1', yaw, JOINTS.yaw, dt);
    springTo(j2, 'z', 'j2', shoulder, JOINTS.shoulder, dt);
    springTo(j3, 'z', 'j3', elbow, JOINTS.elbow, dt);
    springTo(j4, 'x', 'j4', forearmRoll, JOINTS.forearm, dt);
    springTo(j5, 'z', 'j5', wrist, JOINTS.wrist, dt);
    springTo(j6, 'x', 'j6', toolRoll, JOINTS.tool, dt);

    clawOpen.current = stretched ? CLAW.open : CLAW.closed;
  });

  /*
    База смещена вправо и развёрнута фронтом влево: рука работает по кадру,
    а не упирается в собственную спину. При базе по центру левая треть
    холста лежала вне досягаемости и рыскание срывалось в предел.
  */
  return (
    <group ref={root} position={[BASE_X, -3.4, 0]} rotation={[0, Math.PI, 0]}>
      <Plinth />

      {/* J1 — рыскание колонны */}
      <group ref={j1} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.54, 0.56, 0.2, 48]} />
          <Shell color={GRAPHITE} rough={0.42} />
        </mesh>
        <mesh position={[0, RIG.columnHeight / 2 - 0.1, 0]}>
          <cylinderGeometry args={[0.42, 0.5, RIG.columnHeight - 0.5, 48]} />
          <Shell />
        </mesh>
        {/* Кабель-короб на колонне */}
        <mesh position={[0, RIG.columnHeight / 2 - 0.2, 0.44]}>
          <boxGeometry args={[0.3, RIG.columnHeight * 0.52, 0.16]} />
          <Shell color={DARK} rough={0.52} />
        </mesh>

        {/* J2 — плечо */}
        <group ref={j2} position={[0, RIG.columnHeight - 0.5, 0]}>
          <Yoke radius={0.4} />
          <JointBarrel radius={0.4} />
          <Segment length={RIG.l1} radius={0.32} />

          {/* J3 — локоть */}
          <group ref={j3} position={[RIG.l1, 0, 0]}>
            <JointBarrel radius={0.31} />

            {/* J4 — вращение предплечья вокруг своей оси */}
            <group ref={j4}>
              <Segment length={RIG.l2} radius={0.25} />

              {/* J5 — наклон кисти */}
              <group ref={j5} position={[RIG.l2, 0, 0]}>
                <JointBarrel radius={0.23} width={1.8} />
                <Indicator position={[0, 0.23, 0.19]} radius={0.028} />

                {/* J6 — вращение инструмента */}
                <group ref={j6}>
                  <Claw open={clawOpen} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Курсор в NDC и флаг «курсор внутри канваса» — слушаем окно, а не сам
 * канвас, иначе быстрый уход мыши с холста иногда не долавливался.
 * Флаг `inside` определяет, ведёт рука цель курсора или тяжело
 * возвращается в позу покоя.
 */
function usePointerTracking() {
  const { gl } = useThree();
  const point = useRef({ x: 0.3, y: 0.15 });
  const inside = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const within =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      inside.current = within;
      if (within) {
        point.current = {
          x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
          y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
        };
      }
    };

    const onLeave = () => {
      inside.current = false;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [gl]);

  return { point, inside };
}

/** Вписывает руку в канвас, а затем даёт ей заметно крупнее кадра. */
function AutoFit({ children }: { children: ReactNode }) {
  const { viewport } = useThree();

  const scale = useMemo(() => {
    /*
      Габарит берём по реальному рабочему конверту: полностью выпрямленной
      рука не бывает, поэтому вылет считаем с коэффициентом 0.86. База стоит
      справа и рука работает влево, поэтому ширина — это смещение базы плюс
      вылет, а не два вылета.
    */
    const reach = (RIG.l1 + RIG.l2 + RIG.tool) * 0.86;
    const spanX = BASE_X + reach - 0.5;
    const spanY = RIG.columnHeight + (RIG.l1 + RIG.l2) * 0.86 + 0.4;
    // SIZE_BOOST осознанно выходит за рамки кадра: рука должна быть заметно
    // крупнее, лёгкий срез по краям при взгляде на весь манипулятор — ок.
    return Math.min(viewport.height / spanY, viewport.width / spanX) * SIZE_BOOST;
  }, [viewport.width, viewport.height]);

  return <group scale={scale}>{children}</group>;
}

/** Уважаем системную настройку «уменьшить движение». */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Сбой WebGL не должен ронять страницу целиком. */
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface RobotArmHeroProps {
  className?: string;
  /** Высота канваса в пикселях; если не задана — высотой управляет вёрстка. */
  height?: number;
}

export function RobotArmHero({ className, height }: RobotArmHeroProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();

  /*
    Сцена рендерится только когда попадает в окно: раньше цикл крутился
    всегда, и рука раскачивалась от курсора даже когда была на 900 px выше
    вьюпорта — пользователь читал таблицы, а видеокарта считала кадры.
  */
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={host}
      className={className}
      {...(height === undefined ? {} : { style: { height } })}
      aria-hidden
      data-testid="robot-arm-hero"
    >
      <CanvasBoundary>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [2.6, 1.4, 11], fov: 34 }}
          gl={{ antialias: true }}
          frameloop={visible && !reduced ? 'always' : 'never'}
        >
          {/* Мягкий студийный свет; тени на полу нет — только объём и отражения */}
          <ambientLight intensity={0.75} />
          <directionalLight position={[5, 8, 6]} intensity={1.5} />
          <directionalLight position={[-6, 3, -4]} intensity={0.7} color="#eef1f6" />
          <spotLight position={[-3, 7, 4]} angle={0.8} penumbra={1} intensity={0.8} />

          <Environment resolution={256}>
            <Lightformer intensity={1.5} position={[6, 5, 4]} scale={[12, 12, 1]} color="#ffffff" />
            <Lightformer intensity={0.9} position={[-6, 3, 2]} scale={[10, 10, 1]} color="#eef0f4" />
            <Lightformer
              form="rect"
              intensity={1.8}
              position={[0, 7, 3]}
              scale={[1.6, 14, 1]}
              rotation={[0, 0, Math.PI / 2]}
              color="#ffffff"
            />
            <Lightformer form="ring" intensity={0.8} position={[0, 3, -8]} scale={7} color="#ffffff" />
          </Environment>

          <AutoFit>
            <Manipulator />
          </AutoFit>
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}

export default RobotArmHero;
