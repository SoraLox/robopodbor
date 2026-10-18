import { cellCenter, cellOfPoint } from "../loaders/gridPath.js";
import { SLOT, dirOf, headingOfDir } from "./planner.js";

// Движение робота по забронированному пути (planner.js): в каждый момент времени
// его положение задано расписанием — он не «ищет дорогу» на ходу и ни с кем не
// встречается. В конце пути — подъезд к точной позе точки передачи (место и
// направление внутри клетки), перед новым путём — обратно в центр клетки.
//
// spot: { gx, gz, pose: { x, z, heading } } — клетка, где робот стоит, и поза в ней.

const TURN_RATE = 1.6; // рад/с — разворот на месте
const DOCK_SPEED_FACTOR = 0.5; // подъезд к точке — медленнее хода
const YIELD_AFTER_S = 3; // пути нет столько — отъехать в сторону и уступить
const RETRY_S = 1;

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, k) => a + wrapAngle(b - a) * k;

export function createMover({ planner, nav, agent, speedUnits, clock }) {
  const moveSlots = Math.max(1, Math.ceil(nav.cellSize / Math.max(0.1, speedUnits) / SLOT));
  const turnSlots = Math.max(1, Math.ceil(Math.PI / 2 / TURN_RATE / SLOT));
  const dockSpeed = speedUnits * DOCK_SPEED_FACTOR;

  let route = null; // { steps, spot }
  let phase = "parked"; // parked | undock | route | dock | waitPlan
  let retryAt = 0;
  let waitSince = null;
  let pending = null;
  let poseFrom = null;
  let poseT = 0;
  let poseDur = 0;
  const cell = cellOfPoint(nav, agent.pos);
  agent.cell = { gx: cell.gx, gz: cell.gz };
  planner.hold(agent.id, cell.gx, cell.gz, 0);

  const place = () => {
    agent.model.group.position.set(agent.pos.x, 0, agent.pos.z);
    agent.model.group.rotation.y = agent.pos.heading;
  };

  // Плавный переход позы (подъезд/отъезд внутри клетки): сдвиг и поворот.
  function startPose(target) {
    poseFrom = { x: agent.pos.x, z: agent.pos.z, heading: agent.pos.heading };
    poseT = 0;
    const dist = Math.hypot(target.x - agent.pos.x, target.z - agent.pos.z);
    const turn = Math.abs(wrapAngle(target.heading - agent.pos.heading));
    poseDur = Math.max(0.2, dist / dockSpeed + turn / TURN_RATE);
    return target;
  }
  function stepPose(target, dt) {
    poseT += dt;
    const k = ease(Math.min(1, poseT / poseDur));
    agent.pos.x = lerp(poseFrom.x, target.x, k);
    agent.pos.z = lerp(poseFrom.z, target.z, k);
    agent.pos.heading = lerpAngle(poseFrom.heading, target.heading, k);
    place();
    return poseT >= poseDur;
  }

  /** Поехать к точке. Возвращает сразу; приехал — arrived() станет true. */
  function goTo(spot) {
    pending = spot;
    // Посреди пути с расписания не сходим: доезжаем до ближайшей клетки маршрута
    // и уже оттуда строим новый путь.
    if (phase === "route") {
      const t = clock() / SLOT;
      const steps = route.steps;
      let i = 1;
      while (i < steps.length && (!steps[i].move || steps[i].move.tEnd <= t)) i += 1;
      if (i < steps.length) {
        // Остановиться можно только в клетке, которую дальше никто не забронировал.
        let cut = t < steps[i].move.tStart ? i - 1 : i;
        while (cut < steps.length - 1 && !planner.isFree(planner.key(steps[cut].gx, steps[cut].gz), steps[cut].t, Infinity, agent.id)) cut += 1;
        if (cut < steps.length - 1) {
          planner.hold(agent.id, steps[cut].gx, steps[cut].gz, steps[cut].t);
          route = { steps: steps.slice(0, cut + 1), spot, cut: true };
        } else {
          route = { ...route, cut: true };
        }
        return;
      }
    }
    const c = cellCenter(nav, agent.cell.gx, agent.cell.gz);
    // Сначала — в центр своей клетки (клетка и так держится за роботом).
    phase = "undock";
    undockTarget = startPose({ x: c.x, z: c.z, heading: agent.pos.heading });
  }
  let undockTarget = null;

  function tryPlan() {
    const now = Math.ceil(clock() / SLOT);
    planner.release(agent.id, now);
    const steps = planner.plan({
      id: agent.id,
      start: { gx: agent.cell.gx, gz: agent.cell.gz, dir: dirOf(agent.pos.heading) },
      goal: { gx: pending.gx, gz: pending.gz },
      t0: now,
      moveSlots,
      turnSlots,
    });
    if (!steps) {
      if (waitSince === null) waitSince = clock();
      // Долго нет пути (цель занята тем, кто ждёт нас, или проезд перекрыт) —
      // отъезжаем в свободную клетку рядом, освобождая проезд, и пробуем снова.
      if (clock() - waitSince >= YIELD_AFTER_S && stepAside(now)) return;
      planner.hold(agent.id, agent.cell.gx, agent.cell.gz, now);
      retryAt = clock() + RETRY_S;
      phase = "waitPlan";
      return;
    }
    waitSince = null;
    planner.commit(agent.id, steps);
    route = { steps, spot: pending };
    phase = "route";
  }

  function stepAside(now) {
    const { gx, gz } = agent.cell;
    const options = [];
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (d < 1 || d > 3 || !planner.passable(gx + dx, gz + dz)) continue;
        if (gx + dx === pending.gx && gz + dz === pending.gz) continue;
        options.push({ gx: gx + dx, gz: gz + dz, d: d + Math.random() });
      }
    }
    options.sort((a, b) => a.d - b.d);
    for (const o of options.slice(0, 8)) {
      const steps = planner.plan({ id: agent.id, start: { gx, gz, dir: dirOf(agent.pos.heading) }, goal: o, t0: now, moveSlots, turnSlots });
      if (!steps) continue;
      planner.commit(agent.id, steps);
      const c = cellCenter(nav, o.gx, o.gz);
      route = { steps, spot: { gx: o.gx, gz: o.gz, pose: { x: c.x, z: c.z, heading: agent.pos.heading } }, aside: true };
      phase = "route";
      waitSince = null;
      return true;
    }
    return false;
  }

  function stepRoute() {
    const t = clock() / SLOT;
    const steps = route.steps;
    // Текущий отрезок расписания.
    let i = 1;
    while (i < steps.length && (!steps[i].move || steps[i].move.tEnd <= t)) i += 1;
    if (i >= steps.length) {
      const last = steps[steps.length - 1];
      const c = cellCenter(nav, last.gx, last.gz);
      agent.pos.x = c.x;
      agent.pos.z = c.z;
      if (last.dir !== null) agent.pos.heading = headingOfDir(last.dir);
      agent.cell = { gx: last.gx, gz: last.gz };
      place();
      if (t >= last.t && route.cut) {
        tryPlan();
        return;
      }
      if (t >= last.t) {
        phase = "dock";
        dockTarget = startPose(route.spot.pose);
      }
      return;
    }
    const s = steps[i];
    const prev = steps[i - 1];
    const a = cellCenter(nav, prev.gx, prev.gz);
    const b = cellCenter(nav, s.gx, s.gz);
    const fromHeading = prev.dir === null ? agent.pos.heading : headingOfDir(prev.dir);
    const toHeading = headingOfDir(s.dir);
    if (t < s.move.tStart) {
      // Ждём своего слота в клетке prev.
      agent.pos.x = a.x;
      agent.pos.z = a.z;
      agent.cell = { gx: prev.gx, gz: prev.gz };
    } else if (t < s.move.tTurn) {
      const k = (t - s.move.tStart) / Math.max(1e-6, s.move.tTurn - s.move.tStart);
      agent.pos.x = a.x;
      agent.pos.z = a.z;
      agent.pos.heading = lerpAngle(fromHeading, toHeading, ease(k));
      agent.cell = { gx: prev.gx, gz: prev.gz };
    } else {
      const k = (t - s.move.tTurn) / Math.max(1e-6, s.move.tEnd - s.move.tTurn);
      agent.pos.heading = toHeading;
      agent.pos.x = lerp(a.x, b.x, k);
      agent.pos.z = lerp(a.z, b.z, k);
      agent.cell = k < 0.5 ? { gx: prev.gx, gz: prev.gz } : { gx: s.gx, gz: s.gz };
    }
    place();
  }
  let dockTarget = null;

  function step(dt) {
    switch (phase) {
      case "undock":
        if (stepPose(undockTarget, dt)) tryPlan();
        break;
      case "waitPlan":
        if (clock() >= retryAt) tryPlan();
        break;
      case "route":
        stepRoute();
        break;
      case "dock":
        if (stepPose(dockTarget, dt)) {
          phase = "parked";
          // Уступили дорогу — снова к своей точке.
          if (route.aside && pending) goTo(pending);
        }
        break;
      default:
        break;
    }
  }

  return {
    goTo,
    step,
    arrived: () => phase === "parked" && pending === null,
    // Приехал к точке, заданной последним goTo.
    at: (spot) => phase === "parked" && route?.spot === spot,
    moving: () => phase !== "parked",
    clearPending() {
      pending = null;
    },
    phase: () => phase,
  };
}
