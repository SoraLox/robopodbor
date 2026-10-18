import { cellCenter, cellOfPoint } from "../loaders/gridPath.js";
import { blockedNav } from "../loaders/shuttleFleet.js";
import { collectStorage } from "../loaders/customLoaderFleet.js";
import { createCargoFactory } from "../loaders/cargo.js";
import { createBeltPath, BELT_TOP } from "../conveyors/beltPath.js";
import { createArmUnit } from "../arms/armUnit.js";
import { ARM_REACH, ARM_SCALE, DECK_HEIGHT } from "../arms/inboundStation.js";
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
//   приёмка «станция»:           горка → погрузчик → карусель → рука → AMR → погрузчик → ячейка
//   отгрузка — обратно: из ячейки в горку у ворот, из горки груз уходит в фуру.
//
// Груз «вытягивают»: задание создаётся, только когда за ним закреплены исполнители
// следующих шагов (рука, AMR), ячейка и точки передачи. Маршруты строит
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

export function createWarehouseOps({ group, armGroup, shape, metersPerUnit, blockedRects, cargo, cargoWeightKg, truckPayload, beltTexture, links, factories }) {
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
    if (l.station) reservedPoints.push(...l.station.plan.arms.map((a) => a.park), ...l.station.plan.drops.map((d) => d.stand));
  }
  for (const y of yards) for (const b of y.bays) for (const s of b.sideSpots.values()) reservedPoints.push(s.pose);

  // ─── Ячейки ─────────────────────────────────────────────────────────────
  const cells = collectStorage(shape, nav, allGates, null)
    .filter((p) => p.face && !reservedPoints.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 3.5))
    .map((p, i) => {
      const c = cellOfPoint(nav, p);
      return { id: i + 1, gx: c.gx, gz: c.gz, face: p.face, spot: forkSpot(p.face, p, c), stored: Math.random() < CELL_STOCK, reserved: false, tier: i % 3 };
    })
    .filter((c) => passable(c.gx, c.gz));
  const cellLabel = (cell) => `ячейка ${cell.id}`;
  const shelfPose = (cell) => ({ x: cell.face.x, y: cell.tier * RACK_TIER + 0.14, z: cell.face.z, rotY: cell.spot.pose.heading });
  const distTo = (cell, p) => Math.hypot(cell.spot.pose.x - p.x, cell.spot.pose.z - p.z);

  const pickCell = (near, wantStored) => {
    const pool = cells.filter((c) => !c.reserved && c.stored === wantStored);
    if (!pool.length) return null;
    pool.sort((a, b) => distTo(a, near) - distTo(b, near));
    return pool[Math.floor(Math.random() * Math.min(6, pool.length))];
  };

  // Стоянки AMR у стеллажей — на внешних концах проходов, в боковых коридорах
  // вне блока стеллажей: AMR — в коридоре, погрузчик — в крайней клетке прохода,
  // вилами к AMR. За паллетой закрепляется стоянка у прохода её ячейки.
  const rackBays = [];
  {
    let rackMinX = Infinity;
    let rackMaxX = -Infinity;
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        if (shape.cells[gz * shape.gridSize + gx] === 3) {
          rackMinX = Math.min(rackMinX, gx);
          rackMaxX = Math.max(rackMaxX, gx);
        }
      }
    }
    const byRow = new Map();
    for (const cell of cells) {
      if (!byRow.has(cell.gz)) byRow.set(cell.gz, []);
      byRow.get(cell.gz).push(cell);
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
        for (const [endX, outX] of [
          [run[0], run[0] - 1],
          [run[run.length - 1], run[run.length - 1] + 1],
        ]) {
          if (!passable(outX, gz) || (outX >= rackMinX && outX <= rackMaxX)) continue;
          const park = cellCenter(nav, outX, gz);
          const stand = cellCenter(nav, endX, gz);
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
            liftSpot: forkSpot(park, stand, { gx: endX, gz }),
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
  let agentSerial = 0;
  const forklifts = [];
  const amrs = [];
  const armUnits = [];
  const belts = [];
  const linkRuns = [];

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

  const newJob = (kind, run) => {
    serial += 1;
    const job = { id: serial, kind, label: `№${serial}`, run };
    jobs.push(job);
    return job;
  };
  const finish = (job) => {
    jobs.splice(jobs.indexOf(job), 1);
    if (job.kind === "in") doneIn += 1;
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
      cell.stored = false;
      cell.reserved = false;
      // Паллета стоит на полке — оттуда её и снимают вилы.
      const unit = cargoFactory.create();
      const p = shelfPose(cell);
      unit.position.set(p.x, p.y, p.z);
      unit.rotation.y = p.rotY;
      group.add(unit);
      return unit;
    },
  });
  const cellPut = (cell) => ({
    spot: cell.spot,
    lift: cell.tier * RACK_TIER + 0.3,
    label: cellLabel(cell),
    put: (unit) => {
      // Паллета плавно уходит на полку и становится частью стеллажа.
      tweens.move(unit, group, shelfPose(cell), 0.8, { onDone: () => unit.removeFromParent() });
      cell.stored = true;
      cell.reserved = false;
      return true;
    },
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

  // ─── Связи ──────────────────────────────────────────────────────────────
  links.forEach((link, li) => {
    const inbound = link.slot === "inbound";
    const yard = yards[li];
    const gateAnchor = link.gates[Math.floor(link.gates.length / 2)].worldCenter;
    const inside = { x: gateAnchor.x - link.gates[0].normal[0] * 18, z: gateAnchor.z - link.gates[0].normal[1] * 18 };
    const n = link.forklifts?.count ?? 0;
    const fSpec = link.forklifts ?? { speedMps: 2, capacityKg: 1000 };
    const prefix = link.forklifts ? (inbound ? "П" : "О") : "Оператор ";
    let scheme = "direct";
    if (link.station && inbound) scheme = "station";
    else if (link.amrs) scheme = "shuttle";
    else if (link.conveyor?.lines.length) scheme = "belt";
    const run = { link, scheme, yard, inbound };
    linkRuns.push(run);

    if (scheme === "direct") {
      run.pool = makeForklifts(fSpec, n, inside, prefix);
      return;
    }
    // Погрузчики делятся: у ворот (горка ↔ лента/AMR) и у стеллажей (лента/AMR ↔ ячейка).
    const gateN = Math.max(1, Math.ceil(n / 2));
    const rackN = Math.max(1, n - gateN);

    if (scheme === "shuttle") {
      // У каждых ворот — своя стоянка AMR за горкой; погрузчик между горкой и AMR,
      // вилами к платформе.
      run.gateBays = new Map(
        link.gates.map((g) => {
          const inward = { x: -g.normal[0], z: -g.normal[1] };
          const amrSpot = spotAt({ x: g.worldCenter.x + inward.x * 24, z: g.worldCenter.z + inward.z * 24, heading: Math.atan2(inward.z, -inward.x) });
          const park = cellCenter(nav, amrSpot.gx, amrSpot.gz);
          amrSpot.pose = { x: park.x, z: park.z, heading: amrSpot.pose.heading };
          const standCell = cellOfPoint(nav, { x: park.x - inward.x * nav.cellSize, z: park.z - inward.z * nav.cellSize });
          const liftSpot = passable(standCell.gx, standCell.gz) ? forkSpot(park, { x: park.x - inward.x, z: park.z - inward.z }, standCell) : forkSpot(park, { x: park.x - inward.x, z: park.z - inward.z });
          reservedPoints.push(park, liftSpot.pose);
          return [g.id, { job: null, label: `стоянка у ворот ${g.id + 1}`, park, amrSpot, liftSpot }];
        }),
      );
    }

    run.gatePool = makeForklifts(fSpec, gateN, inside, prefix);

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
      run.rackPool = makeForklifts(fSpec, rackN, run.belts[0].outSpot.pose, prefix);
      return;
    }

    if (scheme === "shuttle") {
      run.amrs = makeAmrs(link.amrs, link.amrs.count, inside);
      run.rackPool = makeForklifts(fSpec, rackN, rackBays[0]?.park ?? inside, prefix);
      return;
    }

    // Станция приёмки: карусель, руки и стоянки AMR под руками.
    const plan = link.station.plan;
    run.amrs = makeAmrs(link.amrs, link.amrs.count, plan.arms[0].park);
    run.rackPool = makeForklifts(fSpec, rackN, rackBays[0]?.park ?? plan.rackBay.park, prefix);
    const carousel = createBeltPath({ group: armGroup, points: plan.loop, closed: true, speed: 1.4, width: 3, spacing: 3.4, beltTexture });
    belts.push(carousel);
    run.carousel = carousel;
    run.drops = plan.drops.map((drop) => ({ d: carousel.project(drop.at), spot: forkSpot(drop.at, drop.stand), gateId: drop.gateId }));
    run.arms = plan.arms.map((spot, k) => {
      const rig = factories.arm();
      rig.group.position.set(spot.base.x, 0, spot.base.z);
      rig.group.scale.setScalar(ARM_SCALE);
      armGroup.add(rig.group);
      // AMR встаёт ровно туда, куда рука опускает груз, вдоль карусели.
      const n2 = plan.dirToPark;
      const amrSpot = spotAt({ x: spot.park.x, z: spot.park.z, heading: Math.atan2(-n2.z, n2.x) });
      const arm = { id: k + 1, job: null, amrSpot, label: `рука ${k + 1}`, rig };
      let unit = null;
      // Рука останавливает только «свой» груз — за которым её закрепили.
      const pick = carousel.addPickPoint(carousel.project(spot.pick), (item) => item.meta?.job === arm.job && (unit?.readyToPick() ?? false));
      unit = createArmUnit({
        rig,
        scale: ARM_SCALE,
        tweens,
        from: { dir: plan.dirToBelt, radius: ARM_REACH, height: () => BELT_TOP + cargoFactory.unitHeight, pick },
        to: {
          dir: plan.dirToPark,
          radius: ARM_REACH,
          height: () => DECK_HEIGHT + cargoFactory.unitHeight,
          // Ставит, только когда AMR этого задания пустой стоит под рукой.
          ready: () => Boolean(arm.job?.amr?.waitingLoad()),
          put: (load) => {
            const job = arm.job;
            if (!job?.amr.load(load)) return false;
            arm.job = null;
            return true;
          },
        },
        opsPerMinute: link.station.armProd,
        energyProfile: link.station.energyProfile,
        itemHeight: cargoFactory.unitHeight,
      });
      armUnits.push(unit);
      return arm;
    });
  });

  // ─── Диспетчер: запуск заданий и раздача шагов ──────────────────────────
  function dispatch() {
    for (const run of linkRuns) {
      if (run.inbound) dispatchIn(run);
      else dispatchOut(run);
      // Погрузчики второго плеча — для заданий, которые уже в пути.
      for (const job of jobs) {
        if (job.run !== run || !job.next || job.nextAssigned || !job.nextReady()) continue;
        const f = nearestIdle(job.nextPool, job.next.pick.spot.pose);
        if (!f) continue;
        job.nextAssigned = true;
        f.assign(job.next);
      }
    }
  }

  function dispatchIn(run) {
    const { yard } = run;
    const pool = run.scheme === "direct" ? run.pool : run.gatePool;
    if (!pool.some((f) => f.isIdle())) return;

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
      job.next = beltNext(job, lane, cellPut(cell), () => finish(job));
      job.nextPool = run.rackPool;
      // Погрузчика у стеллажей зовём, когда паллета подъезжает к концу ленты.
      job.nextReady = () => lane.belt.items().some((i) => i.meta?.job === job && i.d > lane.belt.total - 12);
      return;
    }

    // Нужен свободный AMR (для станции — и свободная рука).
    const amr = run.amrs.find((a) => a.isIdle());
    if (!amr) return;
    const arm = run.scheme === "station" ? run.arms.find((a) => !a.job) : null;
    if (run.scheme === "station" && !arm) return;
    const claimProbe = yard.bays.find((b) => b.slots.some((s) => s.unit && s.ready && !s.reserved));
    if (!claimProbe) return;
    const gateBay = run.scheme === "station" ? null : run.gateBays.get(claimProbe.gate.id);
    if (gateBay?.job) return;
    const picked = pickCellWithBay(arm ? arm.amrSpot.pose : gateBay.park, false);
    const claim = picked && yard.claimUnit();
    if (!claim) return;
    const f = nearestIdle(pool, claim.slot.spot.pose);
    const { cell, bay: rackBay } = picked;
    const job = newJob("in", run);
    job.amr = amr;
    cell.reserved = true;
    rackBay.job = job;
    if (gateBay) gateBay.job = job;
    amr.assign({
      jobLabel: job.label,
      load: arm ? { spot: arm.amrSpot, label: arm.label, waitLabel: `${arm.label} поставит груз` } : { spot: gateBay.amrSpot, label: gateBay.label, waitLabel: "погрузчик поставит груз" },
      unload: { spot: rackBay.amrSpot, label: rackBay.label, waitLabel: "погрузчик снимет груз" },
      onLoaded: () => {
        if (gateBay) gateBay.job = null;
      },
    });
    if (arm) {
      arm.job = job;
      const drop = run.drops.find((d) => d.gateId === claim.bay.gate.id) ?? run.drops[0];
      f.assign({
        jobLabel: job.label,
        pick: pileTake(yard, claim),
        drop: { spot: drop.spot, lift: BELT_TOP, label: "карусель", waitLabel: "место на карусели", put: (unit) => run.carousel.put(unit, drop.d, { job }) },
      });
    } else {
      f.assign({
        jobLabel: job.label,
        pick: pileTake(yard, claim),
        drop: { spot: gateBay.liftSpot, lift: DECK_HEIGHT, label: gateBay.label, waitLabel: `${amr.agent.name} на стоянке`, put: (unit) => (amr.waitingLoad() ? amr.load(unit) : false) },
      });
    }
    job.next = {
      jobLabel: job.label,
      pick: {
        spot: rackBay.liftSpot,
        lift: DECK_HEIGHT,
        label: rackBay.label,
        waitLabel: `${amr.agent.name} с ${job.label}`,
        take: () => {
          if (!amr.waitingUnload()) return null;
          rackBay.job = null;
          return amr.unload();
        },
      },
      drop: cellPut(cell),
      onDone: () => finish(job),
    };
    job.nextPool = run.rackPool;
    // Погрузчика у стеллажей зовём, когда AMR с паллетой уже едет к стоянке.
    job.nextReady = () => amr.agent.state === "toUnload" || amr.agent.state === "waitUnload";
  }

  function dispatchOut(run) {
    const { yard } = run;
    if (run.scheme === "direct") {
      const cell = run.pool.some((f) => f.isIdle()) && pickCell(run.link.gates[0].worldCenter, true);
      const claim = cell && yard.claimSlot();
      if (!claim) return;
      const f = nearestIdle(run.pool, cell.spot.pose);
      const job = newJob("out", run);
      cell.reserved = true;
      f.assign({ jobLabel: job.label, pick: cellTake(cell), drop: pilePut(yard, claim), onDone: () => finish(job) });
      return;
    }
    if (run.scheme === "belt") {
      const lane = run.belts.filter((b) => b.load < b.capacity).sort((a, b) => a.load - b.load)[0];
      const cell = lane && pickCell(lane.inSpot.pose, true);
      const f = cell && nearestIdle(run.rackPool, cell.spot.pose);
      const claim = f && yard.claimSlot();
      if (!claim) return;
      const job = newJob("out", run);
      cell.reserved = true;
      lane.load += 1;
      f.assign({ jobLabel: job.label, pick: cellTake(cell), drop: beltDrop(job, lane) });
      job.next = beltNext(job, lane, pilePut(yard, claim), () => finish(job));
      job.nextPool = run.gatePool;
      job.nextReady = () => lane.belt.items().some((i) => i.meta?.job === job && i.d > lane.belt.total - 12);
      return;
    }
    // Отгрузка через AMR: ячейка → AMR у прохода → AMR у ворот → горка у ворот.
    const gate = yard.bays.find((b) => b.slots.some((s) => !s.unit && !s.reserved))?.gate;
    const gateBay = gate && run.gateBays.get(gate.id);
    if (!gateBay || gateBay.job) return;
    const amr = run.amrs.find((a) => a.isIdle());
    const picked = amr && pickCellWithBay(gateBay.park, true);
    const f = picked && nearestIdle(run.rackPool, picked.cell.spot.pose);
    const claim = f && yard.claimSlot();
    if (!claim) return;
    const { cell, bay: rackBay } = picked;
    const job = newJob("out", run);
    job.amr = amr;
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
    f.assign({
      jobLabel: job.label,
      pick: cellTake(cell),
      drop: { spot: rackBay.liftSpot, lift: DECK_HEIGHT, label: rackBay.label, waitLabel: `${amr.agent.name} на стоянке`, put: (unit) => (amr.waitingLoad() ? amr.load(unit) : false) },
    });
    job.next = {
      jobLabel: job.label,
      pick: {
        spot: gateBay.liftSpot,
        lift: DECK_HEIGHT,
        label: gateBay.label,
        waitLabel: `${amr.agent.name} с ${job.label}`,
        take: () => {
          if (!amr.waitingUnload()) return null;
          gateBay.job = null;
          return amr.unload();
        },
      },
      drop: pilePut(yard, claim),
      onDone: () => finish(job),
    };
    job.nextPool = run.gatePool;
    job.nextReady = () => amr.agent.state === "toUnload" || amr.agent.state === "waitUnload";
  }

  // ─── Кадр ───────────────────────────────────────────────────────────────
  function step(dt) {
    simSeconds += dt;
    dispatch();
    for (const y of yards) y.step(dt);
    for (const b of belts) b.step(dt);
    for (const a of armUnits) a.step(dt);
    for (const f of forklifts) f.step(dt);
    for (const a of amrs) a.step(dt);
    tweens.step(dt);
  }

  // Узкое место: группа исполнителей, занятая дольше всех.
  function bottleneck() {
    const groups = [];
    for (const run of linkRuns) {
      const name = run.inbound ? "приёмка" : "отгрузка";
      const add = (label, pool) => pool?.length && groups.push({ label: `${label} (${name})`, load: pool.reduce((s, x) => s + x.utilization(), 0) / pool.length });
      add("погрузчики", run.pool);
      add("погрузчики у ворот", run.gatePool);
      add("погрузчики у стеллажей", run.rackPool);
      add("AMR", run.amrs);
    }
    groups.sort((a, b) => b.load - a.load);
    return groups;
  }

  function getStats() {
    const hours = simSeconds / 3600;
    return {
      phase: "mixed",
      cycles: doneIn + doneOut,
      storedKg: 0,
      fillPercent: Math.round((cells.filter((c) => c.stored).length / Math.max(1, cells.length)) * 100),
      dockUnits: 0,
      trucksAtGates: yards.reduce((s, y) => s + y.trucksAtGates(), 0),
      trucksWaiting: 0,
      trucksIn: 0,
      trucksOut: 0,
      receivedKg: Math.round(doneIn * cargoWeightKg),
      shippedKg: Math.round(doneOut * cargoWeightKg),
      movedPerHour: hours > 0 ? Math.round((doneIn + doneOut) / hours) : 0,
      receivedPerHour: hours > 0 ? Math.round(doneIn / hours) : 0,
      shippedPerHour: hours > 0 ? Math.round(doneOut / hours) : 0,
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
    snapshot: () => ({ inFlight: jobs.length, doneIn, doneOut, agents: [...forklifts, ...amrs].map((x) => x.status()) }),
    getOpsDone: () => armUnits.reduce((s, a) => s + a.getOps(), 0),
    meters: [...forklifts.map((f) => f.agent.meter), ...amrs.map((a) => a.agent.meter), ...armUnits.map((a) => a.meter)],
    obstacles: belts.flatMap((b) => b.obstacles),
    armsShown: armUnits.length,
    dispose() {
      for (const f of forklifts) f.dispose();
      for (const a of amrs) a.dispose();
      for (const b of belts) b.dispose();
      for (const y of yards) y.dispose();
      for (const run of linkRuns) for (const arm of run.arms ?? []) armGroup.remove(arm.rig.group);
      cargoFactory.dispose();
    },
  };
}
