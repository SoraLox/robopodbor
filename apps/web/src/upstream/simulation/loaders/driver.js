import { cellOfPoint, findPath, isWalkable, pathLength } from "./gridPath.js";
import { findBlocker } from "./traffic.js";
import { FORKLIFT_TURN_RATE } from "../constants.js";

// Вождение мобильных роботов склада (погрузчики, транспортировщики) по сетке пола:
//   — путь A* (gridPath.js) по проезжим клеткам: стеллажи, конвейеры и сеть
//     участка отбора закрыты заранее (nav);
//   — разворот на месте, если до следующей точки больше TURN_IN_PLACE;
//   — общий реестр движения (createTraffic): корпус не подходит к чужому ближе,
//     чем позволяют корпуса (traffic.js findBlocker) — робот ждёт; ждёт дольше
//     REPLAN_S — перестраивает путь в обход клетки, где стоит помеха;
//   — точки обслуживания (конец ленты, ячейка стеллажа, место стоянки
//     транспортировщика) — {x, z, owner}: занимает один робот, остальные
//     ждут на подъезде (QUEUE_DIST), а не въезжают друг в друга.

const ARRIVE_EPS = 0.15;
const TURN_IN_PLACE = 0.6;
const TURN_RATE = FORKLIFT_TURN_RATE * 1.5;
const REPLAN_S = 1.5;
// Совсем тупик (встречные в узком месте без объезда): после долгого ожидания
// младший по номеру робот проходит, старший стоит — чтобы сцена не замерла.
const DEADLOCK_S = 12;
export const QUEUE_DIST = 7;
const PARTNER_MIN = 2.8;
// Уступить дорогу: отъехать в сторону на столько и постоять, пока встречный проедет.
const EVADE_DIST = 4.5;
const EVADE_HOLD_S = 2.5;
const EVADE_AFTER_S = 1;

export const headingZForward = (dx, dz) => Math.atan2(dx, dz);

export function turnToward(heading, target, maxTurn) {
  const diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
  const next = heading + (Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn);
  return Math.atan2(Math.sin(next), Math.cos(next));
}

// Реестр движения уровня: все мобильные роботы всех флотов видят друг друга.
export function createTraffic() {
  const agents = new Set();
  let serial = 0;
  return {
    add(agent) {
      agent.trafficId = serial++;
      agents.add(agent);
    },
    remove(agent) {
      agents.delete(agent);
    },
    list: () => [...agents],
    // ignore — партнёр по перегрузке (погрузчик у транспортировщика): им можно вплотную.
    blocker(agent, next, ignore = []) {
      const others = [];
      for (const other of agents) if (other !== agent && !ignore.includes(other)) others.push(other.pos);
      const pose = findBlocker(agent.pos, next, others);
      if (!pose) return null;
      for (const other of agents) if (other.pos === pose) return other;
      return null;
    },
  };
}

// Точка обслуживания: {x, z, face?} + владелец.
export const servicePoint = (point, extra = {}) => ({ ...point, owner: null, ...extra });

export function createDriver({ nav, traffic }) {
  let routeUnits = 0;
  let routeLegs = 0;

  function place(agent) {
    agent.model.group.position.set(agent.pos.x, 0, agent.pos.z);
    agent.model.group.rotation.y = agent.pos.heading;
  }

  // Путь в обход помехи: закрываем клетки под её корпусом (кэш путей тут не годится).
  function replan(agent, blocker) {
    const own = cellOfPoint(nav, agent.pos);
    const goal = cellOfPoint(nav, agent.legTarget);
    const closed = [];
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        const k = gz * nav.n + gx;
        if (!nav.walkable[k] || (gx === own.gx && gz === own.gz) || (gx === goal.gx && gz === goal.gz)) continue;
        const cx = (gx + 0.5) * nav.cellSize - nav.n * nav.cellSize / 2;
        const cz = (gz + 0.5) * nav.cellSize - nav.n * nav.cellSize / 2;
        if (Math.hypot(cx - blocker.pos.x, cz - blocker.pos.z) < nav.cellSize * 0.5 + 3.3) {
          nav.walkable[k] = 0;
          closed.push(k);
        }
      }
    }
    const path = findPath(nav, agent.pos, agent.legTarget, 0.9, false);
    for (const k of closed) nav.walkable[k] = 1;
    if (path.length) agent.path = keepRight(agent.pos, path);
  }

  function step(agent, target, dt, speed) {
    const dx = target.x - agent.pos.x;
    const dz = target.z - agent.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < ARRIVE_EPS) {
      agent.pos.x = target.x;
      agent.pos.z = target.z;
      place(agent);
      return true;
    }

    const want = headingZForward(dx, dz);
    const diff = Math.atan2(Math.sin(want - agent.pos.heading), Math.cos(want - agent.pos.heading));
    const turning = Math.abs(diff) > TURN_IN_PLACE && distance > 0.5;
    const travel = turning ? 0 : Math.min(distance, speed * dt);
    // Разворот на месте — тоже движение корпуса: проверяется по реестру, как и ход.
    const next = {
      x: agent.pos.x + (dx / distance) * travel,
      z: agent.pos.z + (dz / distance) * travel,
      heading: turnToward(agent.pos.heading, want, (turning ? FORKLIFT_TURN_RATE : TURN_RATE) * dt),
      body: agent.pos.body,
    };
    // Партнёр по перегрузке (погрузчик ↔ транспортировщик на стоянке) не мешает
    // только в зоне стоянки — при подъезде к точке и при отъезде от неё; дальше
    // робот объезжает его, а не проезжает сквозь.
    if (agent.ignore && Math.hypot(agent.ignore.pos.x - agent.pos.x, agent.ignore.pos.z - agent.pos.z) > 6) agent.ignore = null;
    const ignore = [agent.ignore];
    for (const point of [agent.legTarget, agent.lastService]) {
      if (point?.partner && Math.hypot(point.x - agent.pos.x, point.z - agent.pos.z) < 5) ignore.push(point.partner());
    }
    const partners = ignore.filter(Boolean);
    let blocker = turning ? null : traffic?.blocker(agent, next, partners);
    // Партнёрам по перегрузке можно вплотную, но не сквозь: центры не ближе PARTNER_MIN.
    if (!blocker && !turning) {
      for (const p of partners) {
        const now = Math.hypot(p.pos.x - agent.pos.x, p.pos.z - agent.pos.z);
        const then = Math.hypot(p.pos.x - next.x, p.pos.z - next.z);
        if (then < PARTNER_MIN && then < now) blocker = p;
      }
    }
    if (blocker) {
      // Помеха узнаёт, что мешает: если она сама стоит (ждёт очереди или тоже
      // упёрлась), она отъедет в сторону (evade в drive).
      blocker.yieldTo = agent;
      agent.blockedBy = blocker.trafficId;
      agent.waited = (agent.waited ?? 0) + dt;
      agent.blocked = true;
      if (agent.waited > REPLAN_S && !agent.replanned && agent.legTarget && !agent.evade) {
        agent.replanned = true;
        replan(agent, blocker);
      }
      const mutual = blocker.blocked && blocker.waited > DEADLOCK_S && agent.waited > DEADLOCK_S;
      if (!(mutual && agent.trafficId < blocker.trafficId)) return false;
    }
    agent.waited = 0;
    agent.blocked = false;
    agent.replanned = false;
    agent.pos.x = next.x;
    agent.pos.z = next.z;
    agent.pos.heading = next.heading;
    place(agent);
    return !turning && travel >= distance - 1e-6;
  }

  // Отрезок с запасом на ширину корпуса идёт только по проезжим клеткам.
  function clearLine(a, b, half = 1.2) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const nx = length ? -dz / length : 0;
    const nz = length ? dx / length : 0;
    const steps = Math.max(1, Math.ceil(length / 0.5));
    const edge = (nav.n * nav.cellSize) / 2 - 0.5;
    if (Math.abs(b.x) > edge || Math.abs(b.z) > edge) return false;
    for (let i = 0; i <= steps; i++) {
      for (const o of [-half, 0, half]) {
        const c = cellOfPoint(nav, { x: a.x + (dx * i) / steps + nx * o, z: a.z + (dz * i) / steps + nz * o });
        if (!isWalkable(nav, c.gx, c.gz)) return false;
      }
    }
    return true;
  }

  // Свободная точка в стороне: справа, слева или назад от курса.
  function sidePoint(agent, away) {
    // Восемь направлений — какое уводит дальше от помехи, то и берём.
    const options = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 4), z: Math.sin((i * Math.PI) / 4) }));
    const others = traffic ? traffic.list() : [];
    const from = away?.pos;
    const now = from ? Math.hypot(agent.pos.x - from.x, agent.pos.z - from.z) : 0;
    // Точки в стороне, от дальней от помехи к ближней; ближе к помехе, чем сейчас, — нельзя.
    const points = options
      .flatMap((o) => [o, { x: o.x * 1.8, z: o.z * 1.8 }, { x: o.x * 2.6, z: o.z * 2.6 }])
      .map((o) => ({ x: agent.pos.x + o.x * EVADE_DIST, z: agent.pos.z + o.z * EVADE_DIST }))
      .map((p) => ({ p, d: from ? Math.hypot(p.x - from.x, p.z - from.z) : 0 }))
      .filter(({ d }) => !from || d > now + 1)
      .sort((a, b) => b.d - a.d);
    for (const { p } of points) {
      if (!clearLine(agent.pos, p)) continue;
      if (others.some((b) => b !== agent && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 3.6)) continue;
      return p;
    }
    return null;
  }

  // Правостороннее движение: промежуточные точки пути сдвинуты вправо по ходу —
  // встречные расходятся бортами, а не упираются лоб в лоб. Конечная точка — как есть.
  const LANE = 1.8;
  function keepRight(from, path) {
    const out = [];
    let prev = from;
    let prevShifted = from;
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (i === path.length - 1) {
        out.push(p);
        break;
      }
      const dx = p.x - prev.x;
      const dz = p.z - prev.z;
      const length = Math.hypot(dx, dz) || 1;
      // Правая сторона при курсе (dx, dz) в системе сцены: (−dz, dx).
      const shifted = { x: p.x - (dz / length) * LANE, z: p.z + (dx / length) * LANE };
      const ok = clearLine(prevShifted, shifted, 1.0);
      out.push(ok ? shifted : p);
      prevShifted = ok ? shifted : p;
      prev = p;
    }
    return out;
  }

  // Уступка дороги: едем в сторону, стоим, затем путь к цели заново.
  function evading(agent, dt, speed) {
    const e = agent.evade;
    if (!e.arrived) {
      const saved = agent.legTarget;
      agent.legTarget = null; // перестройка при блокировке здесь не нужна
      e.arrived = step(agent, e, dt, speed * 0.7);
      agent.legTarget = saved;
      e.t += dt;
      if (e.t > 6) e.arrived = true;
      return true;
    }
    e.hold += dt;
    if (e.hold < EVADE_HOLD_S) return true;
    agent.evade = null;
    agent.yieldTo = null;
    agent.evadeCooldown = 3;
    if (agent.legTarget) agent.path = keepRight(agent.pos, findPath(nav, agent.pos, agent.legTarget, 0.9, false));
    return false;
  }

  // Карманы ожидания у точки обслуживания: проезжие клетки в 2–4 клетках от неё,
  // подальше от того, куда она смотрит (лента, стоянка транспортировщика), чтобы
  // ждущие не стояли на подъезде. Заданные заранее (target.holds) — как есть.
  function holdsFor(target) {
    const avoid = [target, target.face].filter(Boolean);
    const list = [];
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        if (!nav.walkable[gz * nav.n + gx]) continue;
        const c = { x: (gx + 0.5) * nav.cellSize - (nav.n * nav.cellSize) / 2, z: (gz + 0.5) * nav.cellSize - (nav.n * nav.cellSize) / 2 };
        const d = Math.hypot(c.x - target.x, c.z - target.z) / nav.cellSize;
        if (d < 2 || d > 4.5 || avoid.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 7)) continue;
        list.push({ ...c, d });
      }
    }
    list.sort((p, q) => p.d - q.d);
    const picked = [];
    for (const c of list) {
      if (picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= 5)) picked.push(servicePoint({ x: c.x, z: c.z }));
      if (picked.length >= 3) break;
    }
    return picked;
  }

  // Путь к точке и доворот к target.face; true — приехали.
  function move(agent, target, dt, speed) {
    if (agent.legTarget !== target) {
      agent.legTarget = target;
      agent.path = keepRight(agent.pos, findPath(nav, agent.pos, target));
      agent.replanned = false;
      routeUnits += pathLength(agent.pos, agent.path);
      routeLegs += 1;
    }
    while (agent.path.length) {
      if (!step(agent, agent.path[0], dt, speed)) return false;
      agent.path.shift();
    }
    if (target.face) {
      const want = headingZForward(target.face.x - agent.pos.x, target.face.z - agent.pos.z);
      agent.pos.heading = turnToward(agent.pos.heading, want, TURN_RATE * dt);
      place(agent);
    }
    return true;
  }

  // Едем к цели; true — приехали (и развернулись к target.face, если есть).
  // Цель — точка обслуживания {owner}: свободна — занимаем и едем; занята другим —
  // ждём в свободном кармане ожидания в стороне (или, если карманов нет, на подъезде).
  function drive(agent, target, dt, speed) {
    if (agent.evade && evading(agent, dt, speed)) return false;
    agent.evadeCooldown = Math.max(0, (agent.evadeCooldown ?? 0) - dt);
    const other = agent.yieldTo;
    // Во взаимной блокировке уступает один — с большим номером.
    const mutual = other && other.blockedBy === agent.trafficId && agent.blockedBy === other.trafficId;
    if (other && agent.blocked && (agent.waited ?? 0) > EVADE_AFTER_S && !agent.evadeCooldown && (!mutual || agent.trafficId > other.trafficId)) {
      const p = sidePoint(agent, other);
      agent.yieldTo = null;
      if (p) {
        agent.evade = { x: p.x, z: p.z, t: 0, hold: 0, arrived: false };
        agent.waited = 0;
        return false;
      }
    }

    // Предыдущий робот ещё не отъехал от точки — она для следующих пока занята.
    const leaving = target.leaving;
    if (leaving && (leaving === agent || Math.hypot(leaving.pos.x - target.x, leaving.pos.z - target.z) > QUEUE_DIST)) target.leaving = null;
    if ("owner" in target && target.owner !== agent) {
      if (!target.owner && !target.leaving) {
        target.owner = agent;
      } else {
        const holds = (target.holds ??= holdsFor(target));
        if (!agent.hold || !holds.includes(agent.hold)) {
          if (agent.hold?.owner === agent) agent.hold.owner = null;
          agent.hold = holds.find((h) => !h.owner) ?? null;
        }
        if (agent.hold) {
          agent.hold.owner = agent;
          // В кармане стоим — и, если кому-то мешаем, уступаем (evade выше).
          if (move(agent, agent.hold, dt, speed)) {
            agent.blocked = true;
            agent.waited = (agent.waited ?? 0) + dt;
          }
        } else if (Math.hypot(target.x - agent.pos.x, target.z - agent.pos.z) >= QUEUE_DIST) {
          move(agent, target, dt, speed);
        } else {
          agent.blocked = true;
          agent.waited = (agent.waited ?? 0) + dt;
        }
        return false;
      }
    }
    if (agent.hold) {
      if (agent.hold.owner === agent) agent.hold.owner = null;
      agent.hold = null;
    }
    return move(agent, target, dt, speed);
  }

  const release = (agent, target) => {
    if (target && target.owner === agent) {
      target.owner = null;
      target.leaving = agent;
    }
    agent.lastService = target ?? null;
  };

  return {
    drive,
    release,
    place,
    stats: () => ({ routeUnits, routeLegs }),
  };
}
