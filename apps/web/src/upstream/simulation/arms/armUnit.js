import { createEnergyMeter } from "../energy.js";

// Роборука на месте: берёт груз в точке «откуда» и ставит в точку «куда» —
// с ленты на транспортировщик, с подачи на сборный конвейер. Свой ленты у руки
// нет: она стоит у общих конвейеров участка.
//
//   ждёт груз → опускается → берёт присосками → поднимается → поворачивается →
//   ждёт, пока место свободно → опускается → ставит → поднимается → назад.
//
// from/to: { dir: {x, z} — направление от основания руки (мир), radius — до
// точки по горизонтали, height() — высота низа присосок у точки (мир) }.
// from.pick — точка отбора ленты (beltPath.addPickPoint); to.ready()/to.put(unit).
// Время цикла — из паспорта (оп/мин): поворот туда-обратно и четыре подъёма/опускания.

const SWING_SHARE = 0.3;
const LIFT_SHARE = 0.1;
const CLEARANCE = 1.4; // на сколько выше точки груз несут, мир

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const yawOf = (dir) => Math.atan2(-dir.z, dir.x);

export function createArmUnit({ rig, scale, from, to, opsPerMinute, energyProfile, itemHeight }) {
  const cycle = 60 / Math.max(0.5, opsPerMinute);
  const tSwing = cycle * SWING_SHARE;
  const tLift = cycle * LIFT_SHARE;
  const yawFrom = yawOf(from.dir);
  let yawTo = yawOf(to.dir);
  // Кратчайший поворот.
  while (yawTo - yawFrom > Math.PI) yawTo -= 2 * Math.PI;
  while (yawTo - yawFrom < -Math.PI) yawTo += 2 * Math.PI;

  const meter = createEnergyMeter(energyProfile);
  let state = "wait";
  let t = 0;
  let unit = null;
  let ops = 0;

  const carryH = () => Math.max(from.height(), to.height()) + CLEARANCE;
  const pose = (yaw, radius, height) => rig.pose(yaw, radius / scale, height / scale);
  const lerp = (a, b, k) => a + (b - a) * k;

  pose(yawFrom, from.radius, carryH());

  // Рука ждёт груз — точка отбора ленты может его остановить.
  const readyToPick = () => state === "wait" && !unit;

  function grab() {
    unit = from.pick.take();
    if (!unit) return false;
    unit.removeFromParent();
    rig.claw.add(unit);
    // Присоски — на верхе груза, груз висит под ними.
    unit.position.set(0, -itemHeight / scale, 0);
    unit.rotation.set(0, 0, 0);
    unit.scale.setScalar(1 / scale);
    return true;
  }

  function release() {
    rig.claw.remove(unit);
    unit.scale.setScalar(1);
    to.put(unit);
    unit = null;
    ops += 1;
  }

  function step(dt) {
    meter.consume(dt, state === "wait" ? "idle" : "work");
    t += dt;
    const k = (d) => Math.min(1, t / d);
    switch (state) {
      case "wait":
        pose(yawFrom, from.radius, carryH());
        if (from.pick.waiting()) {
          state = "down";
          t = 0;
        }
        break;
      case "down":
        pose(yawFrom, from.radius, lerp(carryH(), from.height(), ease(k(tLift))));
        if (t >= tLift) {
          state = grab() ? "up" : "wait";
          t = 0;
        }
        break;
      case "up":
        pose(yawFrom, from.radius, lerp(from.height(), carryH(), ease(k(tLift))));
        if (t >= tLift) {
          state = "swing";
          t = 0;
        }
        break;
      case "swing": {
        const e = ease(k(tSwing));
        pose(lerp(yawFrom, yawTo, e), lerp(from.radius, to.radius, e), carryH());
        if (t >= tSwing) {
          state = "hold";
          t = 0;
        }
        break;
      }
      case "hold":
        // Место занято (нет пустого транспортировщика) — держим груз над ним.
        pose(yawTo, to.radius, carryH());
        if (to.ready()) {
          state = "place";
          t = 0;
        }
        break;
      case "place":
        pose(yawTo, to.radius, lerp(carryH(), to.height(), ease(k(tLift))));
        if (t >= tLift) {
          if (to.ready()) {
            release();
            state = "lift";
          } else state = "hold";
          t = 0;
        }
        break;
      case "lift":
        pose(yawTo, to.radius, lerp(to.height(), carryH(), ease(k(tLift))));
        if (t >= tLift) {
          state = "back";
          t = 0;
        }
        break;
      case "back": {
        const e = ease(k(tSwing));
        pose(lerp(yawTo, yawFrom, e), lerp(to.radius, from.radius, e), carryH());
        if (t >= tSwing) {
          state = "wait";
          t = 0;
        }
        break;
      }
      default:
        break;
    }
  }

  return { step, meter, readyToPick, getOps: () => ops, state: () => state };
}
