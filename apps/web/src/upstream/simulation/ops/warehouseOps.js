import { cellCenter, cellOfPoint } from "../loaders/gridPath.js";
import { blockedNav } from "../loaders/shuttleFleet.js";
import { collectStorage } from "../loaders/customLoaderFleet.js";
import { createCargoFactory } from "../loaders/cargo.js";
import { createBeltPath, BELT_TOP } from "../conveyors/beltPath.js";
import { createArmUnit } from "../arms/armUnit.js";
import { ARM_SCALE, DECK_HEIGHT } from "../arms/armConstants.js";
import { createPickStation } from "../arms/pickStation.js";
import { createTruckYard } from "./trucks.js";
import { createForkliftAgent } from "./forkliftAgent.js";
import { createAmrAgent } from "./amrAgent.js";
import { createPlanner } from "./planner.js";
import { createTweens } from "./tweens.js";

// ════════════════════════════════════════════════════════════════════════════
// Диспетчер склада: каждая паллета — задание с маршрутом, расписанным заранее.
//
//   приёмка «погрузчики»:        горка у ворот → погрузчик → ячейка
//   приёмка «конвейер»:          горка → погрузчик → лента → погрузчик → ячейка
//   приёмка «погрузчики + AMR»:  горка → погрузчик → AMR → погрузчик → ячейка
//   отгрузка — обратно: из ячейки в горку у ворот, из горки груз уходит в фуру.
//   отбор (роборуки):            ячейка → погрузчик → AMR → погрузчик → кучка у руки
//                                → рука по коробке на ленту → лента в проём в стене.
//
// Груз «вытягивают»: задание создаётся, только когда за ним закреплены исполнители
// следующих шагов (AMR, кучка руки), ячейка и точки передачи. Пулы исполнителей
// общие на все связи: свободный робот берёт работу там, где она есть, — пока у
// одной связи очередь, у другой никто не простаивает. Маршруты строит
// планировщик с бронированием (planner.js): каждый путь прокладывается с учётом
// уже забронированных путей и стоянок остальных роботов, поэтому роботы едут
// по расписанию и не встречаются.
//
// Точка передачи — точная поза: погрузчик встаёт так, чтобы вилы приходились на
// место груза (ячейка, столбик горки, конец ленты, платформа AMR); AMR встаёт
// туда, куда опускает груз рука. Груз переходит плавно (tweens.js).
// ════════════════════════════════════════════════════════════════════════════

const CELL_STOCK = 0.5; // доля ячеек, занятых на старте (есть что отгружать)
const RACK_TIER = 1.9;
const DOCK_OFFSET = 0.35; // насколько поза может отойти от центра клетки (доля клетки)

const unitVec = (from, to) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
};

export function createWarehouseOps({ group, armGroup, racks = null, picking = null, shape, metersPerUnit, blockedRects, cargo, cargoWeightKg, truckPayload, beltTexture, links, factories }) {
  const nav = blockedNav(shape, blockedRects);
  let simSeconds = 0;
  const clock = () => simSeconds;
  const tweens = createTweens();
  const cargoFactory = createCargoFactory(cargo);
  const toUnits = (mps) => mps / Math.max(1e-6, metersPerUnit);
  const blocked = new Set();
  const planner = createPlanner({ nav, blocked });
  const passable = (gx, gz) => planner.passable(gx, gz);

  // Вылет вил: где груз на вилах относительно центра погрузчика.
  const sampleSpec = links.find((l) => l.forklifts)?.forklifts;
  const sample = factories.forklift(sampleSpec?.model)();
  const reach = sample.carry?.position?.z || 2.4;
  sample.dispose?.();

  // Поза в клетке: сдвиг от центра клетки ограничен, чтобы корпус не заезжал
  // в соседнюю клетку (оставшееся расстояние груз проходит плавно).
  const clampPose = (gx, gz, pose) => {
    const c = cellCenter(nav, gx, gz);
    const dx = pose.x - c.x;
    const dz = pose.z - c.z;
    const l = Math.hypot(dx, dz);
    const max = nav.cellSize * DOCK_OFFSET;
    const k = l > max ? max / l : 1;
    return { x: c.x + dx * k, z: c.z + dz * k, heading: pose.heading };
  };
  // Клетка позы; если она занята оборудованием — ближайшая проезжая рядом.
  const spotAt = (pose) => {
    let c = cellOfPoint(nav, pose);
    if (!passable(c.gx, c.gz)) {
      let best = null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const gx = c.gx + dx;
        const gz = c.gz + dz;
        if (!passable(gx, gz)) continue;
        const cc = cellCenter(nav, gx, gz);
        const d = Math.hypot(cc.x - pose.x, cc.z - pose.z);
        if (!best || d < best.d) best = { gx, gz, d };
      }
      if (best) c = best;
    }
    return { gx: c.gx, gz: c.gz, pose: clampPose(c.gx, c.gz, pose) };
  };
  // Погрузчик в клетке cell (или где выйдет), вилами к target: груз — в target.
  const forkSpot = (target, from, cell = null) => {
    const dir = unitVec(from, target);
    const pose = { x: target.x - dir.x * reach, z: target.z - dir.z * reach, heading: Math.atan2(dir.x, dir.z) };
    return cell ? { gx: cell.gx, gz: cell.gz, pose: clampPose(cell.gx, cell.gz, pose) } : spotAt(pose);
  };

  // ─── Ворота и горки ─────────────────────────────────────────────────────
  const allGates = links.flatMap((l) => l.gates);
  const yards = links.map((link) =>
    createTruckYard({
      group,
      gates: link.gates,
      payload: truckPayload,
      direction: link.slot === "inbound" ? "in" : "out",
      nav,
      reach,
      unitHeight: cargoFactory.unitHeight,
      cargoFactory,
      tweens,
      truckFactory: factories.truck,
    }),
  );
  for (const y of yards) for (const [gx, gz] of y.pileCells()) blocked.add(planner.key(gx, gz));
  for (const y of yards) {
    for (const b of y.bays) {
      for (const [side, spot] of b.sideSpots) {
        const fixed = spotAt(spot.pose);
        b.sideSpots.set(side, fixed);
        for (const s of b.slots) if (s.side === side) s.spot = fixed;
      }
    }
  }

  const reservedPoints = [];
  for (const l of links) {
  }
  for (const y of yards) for (const b of y.bays) for (const s of b.sideSpots.values()) reservedPoints.push(s.pose);
  if (picking) for (const a of picking.plan.arms) reservedPoints.push(a.fork, a.amr);

  // ─── Ячейки ─────────────────────────────────────────────────────────────
  const tiers = Math.max(1, Math.round(shape.rackTiers ?? 3));
  const cells = [];
  for (const p of collectStorage(shape, nav, allGates, null)) {
    if (!p.face || reservedPoints.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 3.5)) continue;
    const c = cellOfPoint(nav, p);
    if (!passable(c.gx, c.gz)) continue;
    const rack = cellOfPoint(nav, p.face);
    const spot = forkSpot(p.face, p, c);
    for (let tier = 0; tier < tiers; tier++) {
      cells.push({ id: cells.length + 1, gx: c.gx, gz: c.gz, rack, face: p.face, spot, stored: Math.random() < CELL_STOCK, reserved: false, tier, unit: null });
    }
  }
  const cellLabel = (cell) => `ячейка ${cell.id}`;
  const shelfPose = (cell) => ({ x: cell.face.x, y: cell.tier * RACK_TIER + 0.06, z: cell.face.z, rotY: cell.spot.pose.heading });
  // Полки, которыми управляет диспетчер: нарисованный груз прячем, вместо него —
  // настоящие паллеты (их ставят и снимают роботы).
  const hiddenGoods = [];
  if (racks) {
    const managed = new Set(cells.map((c) => `${c.rack.gx},${c.rack.gz}`));
    for (const unit of racks.children) {
      const rc = unit.userData.rackCell;
      if (!rc || !managed.has(`${rc.gx},${rc.gz}`)) continue;
      for (const goods of unit.children) {
        if (!goods.userData.rackGoods || !goods.visible) continue;
        goods.visible = false;
        hiddenGoods.push(goods);
      }
    }
  }
  const shelve = (cell, unit) => {
    const p = shelfPose(cell);
    unit.position.set(p.x, p.y, p.z);
    unit.rotation.y = p.rotY;
    group.add(unit);
    cell.unit = unit;
  };
  for (const cell of cells) if (cell.stored) shelve(cell, cargoFactory.create());
  const distTo = (cell, p) => Math.hypot(cell.spot.pose.x - p.x, cell.spot.pose.z - p.z);

  const pickCell = (near, wantStored) => {
    const pool = cells.filter((c) => !c.reserved && c.stored === wantStored);
    if (!pool.length) return null;
    pool.sort((a, b) => distTo(a, near) - distTo(b, near));
    return pool[Math.floor(Math.random() * Math.min(6, pool.length))];
  };

  // Стоянки AMR у стеллажей — за внешними концами проходов, в боковых коридорах
  // вне блока стеллажей: AMR — в первой клетке без стеллажей по бокам (не в
  // поперечном проезде внутри блока), погрузчик — в клетке перед ней, вилами к AMR.
  // За паллетой закрепляется стоянка у прохода её ячейки.
  const rackBays = [];
  {
    const isRack = (gx, gz) => gx >= 0 && gz >= 0 && gx < nav.n && gz < nav.n && shape.cells[gz * shape.gridSize + gx] === 3;
    const byRow = new Map();
    for (const cell of cells) {
      if (!byRow.has(cell.gz)) byRow.set(cell.gz, []);
      byRow.get(cell.gz).push(cell);
    }
    // Границы блока стеллажей по x: стоянки только снаружи (не в поперечном проезде).
    let blockMin = Infinity;
    let blockMax = -Infinity;
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        if (!isRack(gx, gz)) continue;
        blockMin = Math.min(blockMin, gx);
        blockMax = Math.max(blockMax, gx);
      }
    }
    for (const [gz, row] of byRow) {
      const xs = [...new Set(row.map((c) => c.gx))].sort((a, b) => a - b);
      const runs = [];
      for (const gx of xs) {
        const last = runs[runs.length - 1];
        if (last && gx === last[last.length - 1] + 1) last.push(gx);
        else runs.push([gx]);
      }
      for (const run of runs) {
        if (run.length < 3) continue;
        for (const [end, dir] of [
          [run[0], -1],
          [run[run.length - 1], 1],
        ]) {
          // Наружу от конца прохода — до клетки без стеллажей сверху и снизу.
          let outX = null;
          for (let k = 1; k <= 3; k++) {
            const x = end + dir * k;
            if (!passable(x, gz)) break;
            if (!isRack(x, gz - 1) && !isRack(x, gz + 1)) {
              outX = x;
              break;
            }
          }
          if (outX === null || (outX >= blockMin && outX <= blockMax)) continue;
          const standX = outX - dir;
          const park = cellCenter(nav, outX, gz);
          const stand = cellCenter(nav, standX, gz);
          if (reservedPoints.some((r) => Math.hypot(r.x - park.x, r.z - park.z) < 4)) continue;
          const toPark = unitVec(stand, park);
          rackBays.push({
            gz,
            gx: outX,
            job: null,
            label: `проход ${rackBays.length + 1}`,
            park,
            // AMR вдоль прохода — платформа напротив вил.
            amrSpot: { gx: outX, gz, pose: { x: park.x, z: park.z, heading: Math.atan2(toPark.z, -toPark.x) } },
            liftSpot: forkSpot(park, stand, { gx: standX, gz }),
          });
        }
      }
    }
  }
  const bayForCell = (cell) =>
    rackBays.filter((b) => !b.job && b.gz === cell.gz).sort((a, b) => Math.abs(a.gx - cell.gx) - Math.abs(b.gx - cell.gx))[0] ?? null;
  const pickCellWithBay = (near, wantStored) => {
    const pool = cells.filter((c) => !c.reserved && c.stored === wantStored && bayForCell(c));
    if (!pool.length) return null;
    pool.sort((a, b) => distTo(a, near) - distTo(b, near));
    const cell = pool[Math.floor(Math.random() * Math.min(8, pool.length))];
    return { cell, bay: bayForCell(cell) };
  };

  // Места ожидания свободных роботов — вдали от рабочих точек и проёмов ворот.
  const taken = [];
  const homeNear = (point) => {
    const avoid = [...reservedPoints, ...rackBays.flatMap((b) => [b.park, b.liftSpot.pose]), ...cells.map((c) => c.spot.pose)];
    let best = null;
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        if (!passable(gx, gz) || taken.some((t) => Math.abs(t.gx - gx) + Math.abs(t.gz - gz) < 2)) continue;
        const c = cellCenter(nav, gx, gz);
        if (avoid.some((r) => Math.hypot(r.x - c.x, r.z - c.z) < 4)) continue;
        if (allGates.some((g) => Math.hypot(g.worldCenter.x - c.x, g.worldCenter.z - c.z) < 14)) continue;
        const d = Math.hypot(c.x - point.x, c.z - point.z);
        if (!best || d < best.d) best = { gx, gz, x: c.x, z: c.z, d };
      }
    }
    const home = best ? { gx: best.gx, gz: best.gz, pose: { x: best.x, z: best.z, heading: 0 } } : spotAt({ ...point, heading: 0 });
    taken.push(home);
    return home;
  };

  const jobs = [];
  let serial = 0;
  let doneIn = 0;
  let doneOut = 0;
  let donePick = 0;
  let agentSerial = 0;
  const forklifts = [];
  const amrs = [];
  const belts = [];
  const linkRuns = [];
  // Общие пулы: погрузчики «от ворот до ячейки», у ворот, у стеллажей; AMR.
  const pools = { direct: [], gate: [], rack: [], amr: [] };

  const makeForklifts = (spec, count, anchor, prefix) =>
    Array.from({ length: Math.max(1, count) }, () => {
      const home = homeNear(anchor);
      const f = createForkliftAgent({
        id: ++agentSerial,
        group,
        planner,
        nav,
        clock,
        tweens,
        robotFactory: factories.forklift(spec.model),
        start: home,
        home,
        speedUnits: toUnits(spec.speedMps ?? 2),
        energyProfile: spec.energyProfile,
        name: `${prefix}${forklifts.length + 1}`,
      });
      forklifts.push(f);
      return f;
    });

  const makeAmrs = (spec, count, anchor) =>
    Array.from({ length: Math.max(1, count) }, () => {
      const home = homeNear(anchor);
      const a = createAmrAgent({
        id: ++agentSerial,
        group,
        planner,
        nav,
        clock,
        tweens,
        robotFactory: factories.transporter,
        start: home,
        home,
        speedUnits: toUnits(spec.speedMps ?? 1.8),
        energyProfile: spec.energyProfile,
        name: `AMR ${amrs.length + 1}`,
      });
      amrs.push(a);
      return a;
    });

  const nearestIdle = (pool, point) =>
    pool
      .filter((f) => f.isIdle())
      .sort((a, b) => Math.hypot(a.agent.pos.x - point.x, a.agent.pos.z - point.z) - Math.hypot(b.agent.pos.x - point.x, b.agent.pos.z - point.z))[0] ?? null;
  const anyForklifts = () => [...pools.direct, ...pools.gate, ...pools.rack];

  const newJob = (kind, run) => {
    serial += 1;
    const job = { id: serial, kind, label: `№${serial}`, run, legs: [] };
    jobs.push(job);
    return job;
  };
  // Плечо погрузчика: назначается, как только готово (ready) и есть свободный из пула.
  const leg = (job, task, pool, ready = () => true) => job.legs.push({ task, pool, ready, assigned: false });
  const finish = (job) => {
    jobs.splice(jobs.indexOf(job), 1);
    if (job.kind === "in") doneIn += 1;
    else if (job.kind === "pick") donePick += 1;
    else doneOut += 1;
  };

  // Концы перегрузки: что умеет точка — отдать груз или принять его.
  const pileTake = (yard, claim) => ({
    spot: claim.slot.spot,
    lift: claim.slot.y + 0.15,
    label: claim.bay.label,
    waitLabel: "груз из фуры",
    take: () => (claim.slot.ready ? yard.takeUnit(claim) : null),
  });
  const pilePut = (yard, claim) => ({
    spot: claim.slot.spot,
    lift: claim.slot.y + 0.15,
    label: claim.bay.label,
    put: (unit) => yard.putUnit(claim, unit),
  });
  const cellTake = (cell) => ({
    spot: cell.spot,
    lift: cell.tier * RACK_TIER + 0.3,
    label: cellLabel(cell),
    take: () => {
      // Паллета стоит на полке — оттуда её и снимают вилы.
      if (!cell.unit) shelve(cell, cargoFactory.create());
      const unit = cell.unit;
      cell.unit = null;
      cell.stored = false;
      cell.reserved = false;
      return unit;
    },
  });
  const cellPut = (cell) => ({
    spot: cell.spot,
    lift: cell.tier * RACK_TIER + 0.3,
    label: cellLabel(cell),
    put: (unit) => {
      // Паллета плавно уходит на полку и остаётся там до отгрузки.
      tweens.move(unit, group, shelfPose(cell), 0.8);
      cell.unit = unit;
      cell.stored = true;
      cell.reserved = false;
      return true;
    },
  });
  // Погрузчик снимает паллету с AMR на стоянке.
  const amrTake = (amr, spot, label, onTaken = () => {}) => ({
    spot,
    lift: DECK_HEIGHT,
    label,
    waitLabel: `${amr.agent.name} с грузом`,
    take: () => {
      if (!amr.waitingUnload()) return null;
      onTaken();
      return amr.unload();
    },
  });
  const amrPut = (amr, spot, label) => ({
    spot,
    lift: DECK_HEIGHT,
    label,
    waitLabel: `${amr.agent.name} на стоянке`,
    put: (unit) => (amr.waitingLoad() ? amr.load(unit) : false),
  });
  const beltNext = (job, lane, drop, onDone) => ({
    jobLabel: job.label,
    pick: {
      spot: lane.outSpot,
      lift: BELT_TOP,
      label: "конец ленты",
      waitLabel: `${job.label} на ленте`,
      take: () => {
        const unit = lane.belt.takeAtEnd((m) => m?.job === job);
        if (unit) lane.load -= 1;
        return unit;
      },
    },
    drop,
    onDone,
  });
  const beltDrop = (job, lane) => ({ spot: lane.inSpot, lift: BELT_TOP, label: "лента", waitLabel: "место на ленте", put: (unit) => lane.belt.put(unit, 0, { job }) });
  const amrOnTheWay = (amr) => () => amr.agent.state === "toUnload" || amr.agent.state === "waitUnload";

  // ─── Связи ──────────────────────────────────────────────────────────────
  links.forEach((link, li) => {
    const inbound = link.slot === "inbound";
    const yard = yards[li];
    const gateAnchor = link.gates[Math.floor(link.gates.length / 2)].worldCenter;
    const inside = { x: gateAnchor.x - link.gates[0].normal[0] * 18, z: gateAnchor.z - link.gates[0].normal[1] * 18 };
    const n = link.forklifts?.count ?? 0;
    const fSpec = link.forklifts ?? { speedMps: 2, capacityKg: 1000 };
    const prefix = link.forklifts ? "П" : "Оператор ";
    let scheme = "direct";
    if (link.amrs) scheme = "shuttle";
    else if (link.conveyor?.lines.length) scheme = "belt";
    const run = { link, scheme, yard, inbound };
    linkRuns.push(run);

    if (scheme === "direct") {
      pools.direct.push(...makeForklifts(fSpec, n, inside, prefix));
      return;
    }
    // Погрузчики делятся: у ворот (горка ↔ лента/AMR) и у стеллажей (лента/AMR ↔ ячейка).
    const gateN = Math.max(1, Math.ceil(n / 2));
    const rackN = Math.max(1, n - gateN);

    if (scheme === "shuttle") {
      // У каждых ворот — по две стоянки AMR за горкой (пока один AMR ждёт погрузчика,
      // второй уже едет); погрузчик — между горкой и AMR, вилами к платформе.
      run.gateBays = new Map(
        link.gates.map((g) => {
          const inward = { x: -g.normal[0], z: -g.normal[1] };
          const along = { x: Math.abs(g.normal[1]), z: Math.abs(g.normal[0]) };
          const bays = [];
          // Стоянка — на первом свободном расстоянии от ворот за горкой: AMR и
          // погрузчик на проходимых клетках, не у стеллажей (не в узком проходе).
          const nearRack = (c) =>
            [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => shape.cells[(c.gz + dz) * shape.gridSize + c.gx + dx] === 3);
          for (const side of [0, 1, -1]) {
            if (bays.length >= 2) break;
            for (let d = 3 * nav.cellSize; d <= 8 * nav.cellSize; d += nav.cellSize) {
              const p = { x: g.worldCenter.x + inward.x * d + along.x * side * nav.cellSize, z: g.worldCenter.z + inward.z * d + along.z * side * nav.cellSize };
              const parkCell = cellOfPoint(nav, p);
              const standCell = cellOfPoint(nav, { x: p.x - inward.x * nav.cellSize, z: p.z - inward.z * nav.cellSize });
              if (!passable(parkCell.gx, parkCell.gz) || !passable(standCell.gx, standCell.gz)) continue;
              if (nearRack(parkCell) || nearRack(standCell)) continue;
              // Не на месте погрузчика у горки и не на других стоянках.
              const taken = (c) => {
                const cc = cellCenter(nav, c.gx, c.gz);
                return reservedPoints.some((r) => Math.hypot(r.x - cc.x, r.z - cc.z) < nav.cellSize * 0.75);
              };
              if (taken(parkCell) || taken(standCell)) continue;
              if (bays.some((b) => b.amrSpot.gx === parkCell.gx && b.amrSpot.gz === parkCell.gz)) break;
              const park = cellCenter(nav, parkCell.gx, parkCell.gz);
              const amrSpot = { gx: parkCell.gx, gz: parkCell.gz, pose: { x: park.x, z: park.z, heading: Math.atan2(inward.z, -inward.x) } };
              const liftSpot = forkSpot(park, { x: park.x - inward.x, z: park.z - inward.z }, standCell);
              reservedPoints.push(park, liftSpot.pose);
              bays.push({ job: null, label: `стоянка у ворот ${g.id + 1}`, park, amrSpot, liftSpot });
              break;
            }
          }
          return [g.id, bays];
        }),
      );
      // Воротам без места под стоянку — стоянки ближайших ворот этой связи.
      for (const g of link.gates) {
        if (run.gateBays.get(g.id).length) continue;
        const donor = link.gates
          .filter((o) => run.gateBays.get(o.id).length)
          .sort((a, b) => Math.hypot(a.worldCenter.x - g.worldCenter.x, a.worldCenter.z - g.worldCenter.z) - Math.hypot(b.worldCenter.x - g.worldCenter.x, b.worldCenter.z - g.worldCenter.z))[0];
        if (donor) run.gateBays.set(g.id, run.gateBays.get(donor.id));
      }
    }

    pools.gate.push(...makeForklifts(fSpec, gateN, inside, prefix));

    if (scheme === "belt") {
      run.belts = link.conveyor.lines.map((line) => {
        // Приёмка: лента от ворот к стеллажам; отгрузка — от стеллажей к воротам.
        const points = inbound ? [line.start, line.end] : [line.end, line.start];
        const belt = createBeltPath({ group: armGroup, points, speed: 1.2, width: 2.6, spacing: 3.2, beltTexture });
        belts.push(belt);
        const d = unitVec(points[0], points[1]);
        const standOf = (p) => forkSpot(p, { x: p.x - d.z * 6, z: p.z + d.x * 6 });
        return { belt, inSpot: standOf(points[0]), outSpot: standOf(points[1]), capacity: Math.max(2, Math.floor(belt.total / 3.2) - 1), load: 0 };
      });
      pools.rack.push(...makeForklifts(fSpec, rackN, run.belts[0].outSpot.pose, prefix));
      return;
    }

    pools.amr.push(...makeAmrs(link.amrs, link.amrs.count, inside));
    pools.rack.push(...makeForklifts(fSpec, rackN, rackBays[0]?.park ?? inside, prefix));
  });

  // ─── Станция отбора роборуками ──────────────────────────────────────────
  let station = null;
  if (picking) {
    station = createPickStation({
      group: armGroup,
      plan: picking.plan,
      beltTexture,
      rigFactory: factories.arm,
      armScale: ARM_SCALE,
      createArmUnit,
      tweens,
      cargoFactory,
      opsPerMinute: picking.armProd,
      energyProfile: picking.energyProfile,
    });
    const along = picking.plan.along;
    for (const arm of station.arms) {
      const { heap, fork, amr } = arm.spot;
      const forkCell = { gx: fork.gx, gz: fork.gz };
      arm.heapSpot = forkSpot(heap, fork, forkCell);
      arm.amrTakeSpot = forkSpot(amr, fork, forkCell);
      arm.amrSpot = { gx: amr.gx, gz: amr.gz, pose: { x: amr.x, z: amr.z, heading: Math.atan2(along.x, along.z) } };
    }
  }
  const heapDrop = (arm) => ({
    spot: arm.heapSpot,
    lift: 0.05,
    label: `кучка у руки ${arm.id}`,
    put: (unit) => station.placeHeap(arm, unit),
  });

  // ─── Диспетчер: запуск заданий и раздача шагов ──────────────────────────
  function dispatch() {
    if (station) dispatchPick();
    // Общие пулы делятся честно: первым робота получает участок, у которого
    // сейчас меньше заданий в работе, — приёмка не забирает всех у отгрузки.
    const active = (run) => jobs.reduce((n, j) => n + (j.run === run ? 1 : 0), 0);
    for (const run of [...linkRuns].sort((a, b) => active(a) - active(b))) {
      if (run.inbound) dispatchIn(run);
      else dispatchOut(run);
    }
    // Плечи погрузчиков в заданиях, которые уже идут: старые задания — первыми.
    for (const job of jobs) {
      for (const l of job.legs) {
        if (l.assigned || !l.ready()) continue;
        const f = nearestIdle(l.pool, l.task.pick.spot.pose);
        if (!f) continue;
        l.assigned = true;
        f.assign(l.task);
      }
    }
  }

  // Отбор: свободной кучке руки — паллету со стеллажа.
  function dispatchPick() {
    for (const arm of station.arms) {
      if (arm.heap.reserved || arm.heap.unit) continue;
      if (pools.amr.length && pools.rack.length) {
        const amr = pools.amr.find((a) => a.isIdle());
        const picked = amr && pickCellWithBay(arm.spot.fork, true);
        if (!picked) return;
        const { cell, bay: rackBay } = picked;
        const job = newJob("pick", null);
        cell.reserved = true;
        rackBay.job = job;
        arm.heap.reserved = true;
        amr.assign({
          jobLabel: job.label,
          load: { spot: rackBay.amrSpot, label: rackBay.label, waitLabel: "погрузчик поставит груз" },
          unload: { spot: arm.amrSpot, label: arm.label, waitLabel: "погрузчик снимет груз" },
          onLoaded: () => {
            rackBay.job = null;
          },
        });
        leg(job, { jobLabel: job.label, pick: cellTake(cell), drop: amrPut(amr, rackBay.liftSpot, rackBay.label) }, pools.rack);
        leg(job, { jobLabel: job.label, pick: amrTake(amr, arm.amrTakeSpot, arm.label), drop: heapDrop(arm), onDone: () => finish(job) }, anyForklifts(), amrOnTheWay(amr));
        continue;
      }
      // Без AMR — погрузчик везёт паллету со стеллажа прямо к руке.
      const cell = pickCell(arm.spot.fork, true);
      const f = cell && nearestIdle(anyForklifts(), cell.spot.pose);
      if (!f) return;
      const job = newJob("pick", null);
      cell.reserved = true;
      arm.heap.reserved = true;
      f.assign({ jobLabel: job.label, pick: cellTake(cell), drop: heapDrop(arm), onDone: () => finish(job) });
    }
  }

  function dispatchIn(run) {
    const { yard } = run;
    const pool = run.scheme === "direct" ? pools.direct : pools.gate;
    // Челнок стартует с AMR, погрузчики подхватят плечи; остальным нужен погрузчик сразу.
    if (run.scheme !== "shuttle" && !pool.some((f) => f.isIdle())) return;

    if (run.scheme === "direct") {
      const cell = pickCell(run.link.gates[0].worldCenter, false);
      const claim = cell && yard.claimUnit();
      if (!claim) return;
      const f = nearestIdle(pool, claim.slot.spot.pose);
      const job = newJob("in", run);
      cell.reserved = true;
      f.assign({ jobLabel: job.label, pick: pileTake(yard, claim), drop: cellPut(cell), onDone: () => finish(job) });
      return;
    }

    if (run.scheme === "belt") {
      const lane = run.belts.filter((b) => b.load < b.capacity).sort((a, b) => a.load - b.load)[0];
      const cell = lane && pickCell(lane.outSpot.pose, false);
      const claim = cell && yard.claimUnit();
      if (!claim) return;
      const f = nearestIdle(pool, claim.slot.spot.pose);
      const job = newJob("in", run);
      cell.reserved = true;
      lane.load += 1;
      f.assign({ jobLabel: job.label, pick: pileTake(yard, claim), drop: beltDrop(job, lane) });
      leg(job, beltNext(job, lane, cellPut(cell), () => finish(job)), pools.rack, () => lane.belt.items().some((i) => i.meta?.job === job && i.d > lane.belt.total - 12));
      return;
    }

    // Челнок: горка → погрузчик → AMR у ворот → AMR у прохода → погрузчик → ячейка.
    const amr = pools.amr.find((a) => a.isIdle());
    if (!amr) return;
    // Горка с грузом у ворот, где есть свободная стоянка AMR.
    const pile = yard.bays.find((b) => b.slots.some((s) => s.unit && s.ready && !s.reserved) && run.gateBays.get(b.gate.id)?.some((g) => !g.job));
    const gateBay = pile && run.gateBays.get(pile.gate.id).find((b) => !b.job);
    if (!gateBay) return;
    const picked = pickCellWithBay(gateBay.park, false);
    const claim = picked && yard.claimUnit(pile);
    if (!claim) return;
    const { cell, bay: rackBay } = picked;
    const job = newJob("in", run);
    cell.reserved = true;
    rackBay.job = job;
    gateBay.job = job;
    amr.assign({
      jobLabel: job.label,
      load: { spot: gateBay.amrSpot, label: gateBay.label, waitLabel: "погрузчик поставит груз" },
      unload: { spot: rackBay.amrSpot, label: rackBay.label, waitLabel: "погрузчик снимет груз" },
      onLoaded: () => {
        gateBay.job = null;
      },
    });
    leg(job, { jobLabel: job.label, pick: pileTake(yard, claim), drop: amrPut(amr, gateBay.liftSpot, gateBay.label) }, pool);
    leg(job, {
      jobLabel: job.label,
      pick: amrTake(amr, rackBay.liftSpot, rackBay.label, () => {
        rackBay.job = null;
      }),
      drop: cellPut(cell),
      onDone: () => finish(job),
    }, pools.rack, amrOnTheWay(amr));
  }

  function dispatchOut(run) {
    const { yard } = run;
    if (run.scheme === "direct") {
      const cell = pools.direct.some((f) => f.isIdle()) && pickCell(run.link.gates[0].worldCenter, true);
      const claim = cell && yard.claimSlot();
      if (!claim) return;
      const f = nearestIdle(pools.direct, cell.spot.pose);
      const job = newJob("out", run);
      cell.reserved = true;
      f.assign({ jobLabel: job.label, pick: cellTake(cell), drop: pilePut(yard, claim), onDone: () => finish(job) });
      return;
    }
    if (run.scheme === "belt") {
      const lane = run.belts.filter((b) => b.load < b.capacity).sort((a, b) => a.load - b.load)[0];
      const cell = lane && pickCell(lane.inSpot.pose, true);
      const f = cell && nearestIdle(pools.rack, cell.spot.pose);
      const claim = f && yard.claimSlot();
      if (!claim) return;
      const job = newJob("out", run);
      cell.reserved = true;
      lane.load += 1;
      f.assign({ jobLabel: job.label, pick: cellTake(cell), drop: beltDrop(job, lane) });
      leg(job, beltNext(job, lane, pilePut(yard, claim), () => finish(job)), pools.gate, () => lane.belt.items().some((i) => i.meta?.job === job && i.d > lane.belt.total - 12));
      return;
    }
    // Челнок: ячейка → AMR у прохода → AMR у ворот → горка у ворот.
    const pile = yard.bays.find((b) => b.slots.some((s) => !s.unit && !s.reserved) && run.gateBays.get(b.gate.id)?.some((g) => !g.job));
    const gateBay = pile && run.gateBays.get(pile.gate.id).find((b) => !b.job);
    if (!gateBay) return;
    const amr = pools.amr.find((a) => a.isIdle());
    const picked = amr && pickCellWithBay(gateBay.park, true);
    const claim = picked && yard.claimSlot(pile);
    if (!claim) return;
    const { cell, bay: rackBay } = picked;
    const job = newJob("out", run);
    cell.reserved = true;
    rackBay.job = job;
    gateBay.job = job;
    amr.assign({
      jobLabel: job.label,
      load: { spot: rackBay.amrSpot, label: rackBay.label, waitLabel: "погрузчик поставит груз" },
      unload: { spot: gateBay.amrSpot, label: gateBay.label, waitLabel: "погрузчик снимет груз" },
      onLoaded: () => {
        rackBay.job = null;
      },
    });
    leg(job, { jobLabel: job.label, pick: cellTake(cell), drop: amrPut(amr, rackBay.liftSpot, rackBay.label) }, pools.rack);
    leg(job, {
      jobLabel: job.label,
      pick: amrTake(amr, gateBay.liftSpot, gateBay.label, () => {
        gateBay.job = null;
      }),
      drop: pilePut(yard, claim),
      onDone: () => finish(job),
    }, pools.gate, amrOnTheWay(amr));
  }

  // ─── Кадр ───────────────────────────────────────────────────────────────
  function step(dt) {
    simSeconds += dt;
    dispatch();
    for (const y of yards) y.step(dt);
    for (const b of belts) b.step(dt);
    station?.step(dt);
    for (const f of forklifts) f.step(dt);
    for (const a of amrs) a.step(dt);
    tweens.step(dt);
  }

  // Загрузка групп исполнителей: узкое место — занятая дольше всех.
  function bottleneck() {
    const groups = [];
    const add = (label, role, pool) =>
      pool.length && groups.push({ label, role, count: pool.length, load: pool.reduce((s, x) => s + x.utilization(), 0) / pool.length });
    add("погрузчики", "forklift", pools.direct);
    add("погрузчики у ворот", "forklift", pools.gate);
    add("погрузчики у стеллажей", "forklift", pools.rack);
    add("AMR", "amr", pools.amr);
    groups.sort((a, b) => b.load - a.load);
    return groups;
  }

  function getStats() {
    const hours = simSeconds / 3600;
    const done = doneIn + doneOut + donePick;
    return {
      phase: "mixed",
      cycles: done,
      storedKg: 0,
      fillPercent: Math.round((cells.filter((c) => c.stored).length / Math.max(1, cells.length)) * 100),
      dockUnits: 0,
      trucksAtGates: yards.reduce((s, y) => s + y.trucksAtGates(), 0),
      trucksWaiting: 0,
      trucksIn: 0,
      trucksOut: 0,
      receivedKg: Math.round(doneIn * cargoWeightKg),
      shippedKg: Math.round((doneOut + donePick) * cargoWeightKg),
      movedPerHour: hours > 0 ? Math.round(done / hours) : 0,
      receivedPerHour: hours > 0 ? Math.round(doneIn / hours) : 0,
      shippedPerHour: hours > 0 ? Math.round((doneOut + donePick) / hours) : 0,
      avgRouteM: 0,
      busyLoaders: forklifts.filter((f) => !f.isIdle()).length + amrs.filter((a) => !a.isIdle()).length,
    };
  }

  return {
    step,
    getStats,
    bottleneck,
    planner,
    agents: () => [...forklifts, ...amrs].map((x) => x.agent),
    // Задания в работе и что делают исполнители — для панели «Задания».
    snapshot: () => ({
      inFlight: jobs.length,
      doneIn,
      doneOut,
      donePick,
      cartons: station?.shipped() ?? 0,
      agents: [...forklifts, ...amrs].map((x) => x.status()),
    }),
    getOpsDone: () => station?.getOps() ?? 0,
    meters: [...forklifts.map((f) => f.agent.meter), ...amrs.map((a) => a.agent.meter), ...(station?.meters ?? [])],
    obstacles: [...belts.flatMap((b) => b.obstacles), ...(station?.obstacles ?? [])],
    armsShown: station?.arms.length ?? 0,
    dispose() {
      for (const f of forklifts) f.dispose();
      for (const a of amrs) a.dispose();
      for (const b of belts) b.dispose();
      for (const y of yards) y.dispose();
      station?.dispose();
      for (const cell of cells) cell.unit?.removeFromParent();
      for (const goods of hiddenGoods) goods.visible = true;
      cargoFactory.dispose();
    },
  };
}
