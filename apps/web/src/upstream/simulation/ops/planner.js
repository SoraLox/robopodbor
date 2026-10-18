import { isWalkable } from "../loaders/gridPath.js";

// ════════════════════════════════════════════════════════════════════════════
// Планировщик маршрутов с бронированием (кооперативный A* в пространстве-времени).
//
// Пол — сетка клеток, время — шаги SLOT секунд. В таблице брони у каждой клетки —
// интервалы времени, когда она занята чьим-то маршрутом или стоящим роботом.
// Между бронями у клетки — свободные окна; поиск идёт по состояниям «клетка + окно»
// (SIPP): из клетки можно выехать в соседнюю, как только её окно позволяет въехать,
// подождав сколько нужно на месте (поворот стоит времени). Найденный путь
// бронируется — следующие роботы его уже видят.
// Робот на месте назначения держит клетку «до отъезда» (бронь до бесконечности),
// поэтому сквозь стоящих никто не планирует.
//
// Роботы едут по расписанию пути — встречи и объезды на ходу не нужны.
// ════════════════════════════════════════════════════════════════════════════

export const SLOT = 0.5; // с
const BUFFER = 1; // слотов запаса до и после проезда клетки — дистанция между роботами
const MAX_SLOTS = 1600; // горизонт поиска, слотов (~13 мин)
const MAX_EXPANSIONS = 15000; // предел перебора: не нашли — пробуем позже (кадр не тормозит)
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const INF = Number.POSITIVE_INFINITY;

// При равной оценке — узел ближе к цели (меньше h): поиск идёт «вглубь».
const less = (a, b) => a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.t > b.t)));

function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(heap[i], heap[p])) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}
function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && less(heap[l], heap[m])) m = l;
      if (r < heap.length && less(heap[r], heap[m])) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}

export function createPlanner({ nav, blocked = new Set() }) {
  const n = nav.n;
  const table = new Map(); // клетка → [{t0, t1, id}]
  const key = (gx, gz) => gz * n + gx;
  const passable = (gx, gz) => isWalkable(nav, gx, gz) && !blocked.has(key(gx, gz));

  // Расстояние до цели по проходам (без учёта других роботов) — точная эвристика.
  const fields = new Map();
  function distField(goal) {
    const gk = key(goal.gx, goal.gz);
    if (fields.has(gk)) return fields.get(gk);
    const dist = new Int32Array(n * n).fill(-1);
    dist[gk] = 0;
    const queue = [gk];
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi];
      const gx = k % n;
      const gz = (k - gx) / n;
      for (const [dx, dz] of DIRS) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n || !passable(nx, nz)) continue;
        const nk = key(nx, nz);
        if (dist[nk] >= 0) continue;
        dist[nk] = dist[k] + 1;
        queue.push(nk);
      }
    }
    fields.set(gk, dist);
    return dist;
  }

  // Доехать хоть как-то сейчас: стоящие роботы (бронь до бесконечности) — стены.
  // Если нельзя, долгий поиск по времени не нужен.
  function reachableNow(id, start, goal) {
    const parked = new Set();
    for (const [k, list] of table) if (list.some((r) => r.id !== id && r.t1 === INF)) parked.add(k);
    const seen = new Uint8Array(n * n);
    const sk = key(start.gx, start.gz);
    const gk = key(goal.gx, goal.gz);
    seen[sk] = 1;
    const queue = [sk];
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi];
      if (k === gk) return true;
      const gx = k % n;
      const gz = (k - gx) / n;
      for (const [dx, dz] of DIRS) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n || !passable(nx, nz)) continue;
        const nk = key(nx, nz);
        if (seen[nk] || parked.has(nk)) continue;
        seen[nk] = 1;
        queue.push(nk);
      }
    }
    return false;
  }

  function isFree(k, t0, t1, id) {
    const list = table.get(k);
    if (!list) return true;
    for (const r of list) if (r.id !== id && r.t0 < t1 && t0 < r.t1) return false;
    return true;
  }

  function reserve(k, t0, t1, id) {
    if (!table.has(k)) table.set(k, []);
    table.get(k).push({ t0, t1, id });
  }

  // Снять брони робота с момента t (уезжает или перепланирует).
  function release(id, t) {
    for (const [k, list] of table) {
      const next = [];
      for (const r of list) {
        // Прошедшие брони больше никому не мешают — выбрасываем.
        if (r.t1 < t - 4) continue;
        if (r.id !== id) next.push(r);
        else if (r.t0 < t) next.push({ ...r, t1: Math.min(r.t1, t) });
      }
      if (next.length) table.set(k, next);
      else table.delete(k);
    }
  }

  // Держать клетку с момента t «до отъезда».
  function hold(id, gx, gz, t) {
    reserve(key(gx, gz), t, INF, id);
  }

  // Свободные окна клетки для робота id: промежутки между чужими бронями.
  function safeIntervals(k, id, cache) {
    if (cache.has(k)) return cache.get(k);
    const busy = (table.get(k) ?? []).filter((r) => r.id !== id).sort((a, b) => a.t0 - b.t0);
    const out = [];
    let from = -INF;
    for (const r of busy) {
      if (r.t0 > from) out.push([from, r.t0]);
      from = Math.max(from, r.t1);
    }
    if (from < INF) out.push([from, INF]);
    cache.set(k, out);
    return out;
  }

  /**
   * Путь от start (клетка и направление) к goal с момента t0 (в слотах).
   * moveSlots — слотов на переезд в соседнюю клетку; turnSlots — на поворот на 90°.
   * Поиск по «безопасным окнам» (SIPP): состояние — клетка и окно, в котором она
   * свободна; ожидание — внутри окна. Возвращает шаги [{gx, gz, dir, t, move}] или null.
   */
  function plan({ id, start, goal, t0, moveSlots, turnSlots }) {
    if (!passable(goal.gx, goal.gz) && !(goal.gx === start.gx && goal.gz === start.gz)) return null;
    // Цель занята стоящим роботом — ждать, пока он уедет (без поиска).
    if ((table.get(key(goal.gx, goal.gz)) ?? []).some((r) => r.id !== id && r.t1 === INF)) return null;
    if (!reachableNow(id, start, goal)) return null;
    const field = distField(goal);
    if (field[key(start.gx, start.gz)] < 0) return null;
    const h = (gx, gz) => field[key(gx, gz)] * moveSlots;
    const cache = new Map();
    const startK = key(start.gx, start.gz);
    // Окно стартовой клетки: от сейчас до первой чужой брони впереди.
    const startEnd = safeIntervals(startK, id, cache).find((w) => w[1] > t0)?.[1] ?? INF;
    const goalK = key(goal.gx, goal.gz);
    const open = [];
    const best = new Map();
    const startNode = { gx: start.gx, gz: start.gz, dir: start.dir, t: t0, end: startEnd, h: h(start.gx, start.gz), f: t0 + h(start.gx, start.gz), prev: null, move: null };
    heapPush(open, startNode);
    let expansions = 0;
    while (open.length && expansions < MAX_EXPANSIONS) {
      const node = heapPop(open);
      expansions += 1;
      const here = key(node.gx, node.gz);
      if (here === goalK && node.end === INF) return unwind(node);
      if (node.t - t0 > MAX_SLOTS) continue;
      for (let d = 0; d < 4; d++) {
        const nx = node.gx + DIRS[d][0];
        const nz = node.gz + DIRS[d][1];
        if (!passable(nx, nz)) continue;
        const turns = node.dir === null ? 0 : Math.min(Math.abs(d - node.dir), 4 - Math.abs(d - node.dir));
        const tTurn = turns * turnSlots;
        const nk = key(nx, nz);
        for (const [a, b] of safeIntervals(nk, id, cache)) {
          // Самый ранний выезд: не раньше прибытия сюда и так, чтобы въехать в окно соседа.
          const depart = Math.max(node.t, a - tTurn + BUFFER);
          const tEnd = depart + tTurn + moveSlots;
          // Своя клетка нужна до конца выезда, соседняя — до конца въезда.
          if (tEnd + BUFFER > node.end || tEnd + BUFFER > b) continue;
          if (b <= node.t) continue;
          const seenAt = best.get(`${nk},${d},${a}`);
          if (seenAt !== undefined && seenAt <= tEnd) continue;
          best.set(`${nk},${d},${a}`, tEnd);
          const hn = h(nx, nz);
          heapPush(open, { gx: nx, gz: nz, dir: d, t: tEnd, end: b, h: hn, f: tEnd + hn, prev: node, move: { tStart: depart, tTurn: depart + tTurn, tEnd } });
        }
      }
    }
    return null;
  }

  function unwind(node) {
    const steps = [];
    for (let x = node; x; x = x.prev) steps.push(x);
    steps.reverse();
    return steps.map((s) => ({ gx: s.gx, gz: s.gz, dir: s.dir, t: s.t, move: s.move }));
  }

  // Забронировать найденный путь и стоянку на месте назначения.
  function commit(id, steps) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const k = key(s.gx, s.gz);
      if (i === 0) {
        reserve(k, s.t, (steps[1]?.move?.tEnd ?? s.t) + BUFFER, id);
        continue;
      }
      const prev = steps[i - 1];
      if (s.move) {
        // Предыдущая клетка — с прибытия в неё (вместе с ожиданием) до конца выезда.
        reserve(key(prev.gx, prev.gz), prev.t, s.move.tEnd + BUFFER, id);
        reserve(k, s.move.tTurn - BUFFER, s.move.tEnd + BUFFER, id);
      } else {
        reserve(k, prev.t, s.t + BUFFER, id);
      }
    }
    const last = steps[steps.length - 1];
    hold(id, last.gx, last.gz, last.t);
  }

  return { plan, commit, release, hold, isFree, key, passable, blocked, table };
}

export const dirOf = (heading) => {
  // heading: atan2(dx, dz). Направления: 0 — −Z, 1 — +X, 2 — +Z, 3 — −X.
  const d = Math.round((Math.PI - heading) / (Math.PI / 2)) % 4;
  return (d + 4) % 4;
};
export const headingOfDir = (d) => Math.atan2(DIRS[d][0], DIRS[d][1]);
export { DIRS };
