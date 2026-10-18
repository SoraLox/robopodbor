import { cellCenter, cellOfPoint, isWalkable } from "../loaders/gridPath.js";
import { createDriver, servicePoint } from "../loaders/driver.js";
import { blockedNav } from "../loaders/shuttleFleet.js";
import { collectStorage } from "../loaders/customLoaderFleet.js";
import { createCargoFactory } from "../loaders/cargo.js";
import { createBeltPath, BELT_TOP } from "../conveyors/beltPath.js";
import { createArmUnit } from "../arms/armUnit.js";
import { ARM_REACH, ARM_SCALE, DECK_HEIGHT } from "../arms/inboundStation.js";
import { disposeTree } from "../sceneUtils.js";
import { createTruckYard } from "./trucks.js";
import { createForkliftAgent } from "./forkliftAgent.js";
import { createAmrAgent } from "./amrAgent.js";

// ════════════════════════════════════════════════════════════════════════════
// Диспетчер склада: каждая паллета — задание с маршрутом, расписанным заранее.
//
//   приёмка «погрузчики»:        фура → погрузчик → ячейка
//   приёмка «конвейер»:          фура → погрузчик → лента → погрузчик → ячейка
//   приёмка «погрузчики + AMR»:  фура → погрузчик → AMR → погрузчик → ячейка
//   приёмка «станция»:           фура → погрузчик → карусель → рука → AMR → погрузчик → ячейка
//   отгрузка — те же маршруты в обратную сторону, из ячейки в фуру.
//
// Груз «вытягивают», а не «проталкивают»: задание создаётся, только когда за ним
// уже закреплены исполнители следующих шагов (рука, AMR) и ячейка. Поэтому на
// карусели лежат только паллеты, которые ждёт конкретная рука, AMR не стоят без
// дела в очереди, а погрузчик не возит груз туда, где его некому принять.
// Исполнители сами ничего не решают: без задания стоят на своём месте.
// ════════════════════════════════════════════════════════════════════════════

const CELL_STOCK = 0.5; // доля ячеек, занятых на старте (есть что отгружать)

export function createWarehouseOps({
  group,
  armGroup,
  shape,
  metersPerUnit,
  traffic,
  blockedRects,
  cargo,
  cargoWeightKg,
  truckPayload,
  beltTexture,
  links,
  factories,
}) {
  const nav = blockedNav(shape, blockedRects);
  const driver = createDriver({ nav, traffic });
  const amrNav = blockedNav(shape, blockedRects);
  const amrDriver = createDriver({ nav: amrNav, traffic });
  const cargoFactory = createCargoFactory(cargo);
  const toUnits = (mps) => mps / Math.max(1e-6, metersPerUnit);

  // ─── Ячейки хранения ────────────────────────────────────────────────────
  const reserved = links.flatMap((l) => [
    ...(l.station ? [...l.station.plan.arms.map((a) => a.park), l.station.plan.rackBay.park, l.station.plan.rackBay.stand] : []),
    ...(l.bays ? [l.bays.a.park, l.bays.a.stand, l.bays.b.park, l.bays.b.stand] : []),
  ]);
  const allGates = links.flatMap((l) => l.gates);
  const cells = collectStorage(shape, nav, allGates, null)
    .filter((p) => !reserved.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 3.5))
    .map((p, i) => ({
      id: i + 1,
      spot: servicePoint({ x: p.x, z: p.z, face: p.face }),
      stored: Math.random() < CELL_STOCK,
      reserved: false,
      tier: i % 3,
    }));
  // Точки разгрузки AMR у стеллажей — на концах проходов между рядами: AMR
  // встаёт за краем прохода, погрузчик — в крайней клетке прохода, вилами к AMR,
  // и дальше короткий путь до ячейки. За паллетой закрепляется точка у прохода
  // её ячейки, поэтому AMR не толкутся у одной стоянки.
  const rackBays = [];
  {
    const byRow = new Map();
    for (const cell of cells) {
      const c = cellOfPoint(nav, cell.spot);
      cell.gx = c.gx;
      cell.gz = c.gz;
      if (!byRow.has(c.gz)) byRow.set(c.gz, []);
      byRow.get(c.gz).push(cell);
    }
    // Только внешние концы проходов — в боковых коридорах вне блока стеллажей:
    // AMR на стоянке в поперечном коридоре (он в одну клетку) перекрывал бы проезд.
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
    for (const [gz, row] of byRow) {
      const xs = [...new Set(row.map((c) => c.gx))].sort((a, b) => a - b);
      // Непрерывные отрезки прохода.
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
          if (!isWalkable(nav, outX, gz) || (outX >= rackMinX && outX <= rackMaxX)) continue;
          const park = cellCenter(nav, outX, gz);
          const stand = cellCenter(nav, endX, gz);
          if (reserved.some((r) => Math.hypot(r.x - park.x, r.z - park.z) < 4)) continue;
          const bay = { gz, gx: outX, job: null };
          bay.park = servicePoint(park);
          bay.stand = servicePoint(stand, { face: park });
          bay.stand.partner = () => bay.park.owner;
          bay.park.partner = () => bay.stand.owner;
          bay.label = `проход ${rackBays.length + 1}`;
          rackBays.push(bay);
        }
      }
    }
  }
  // Свободная точка разгрузки у прохода ячейки (ближайший конец).
  const bayForCell = (cell) =>
    rackBays
      .filter((b) => !b.job && b.gz === cell.gz)
      .sort((a, b) => Math.abs(a.gx - cell.gx) - Math.abs(b.gx - cell.gx))[0] ?? null;
  // Ячейка, у прохода которой есть свободная точка разгрузки.
  const pickCellWithBay = (near, wantStored) => {
    const pool = cells.filter((c) => !c.reserved && c.stored === wantStored && bayForCell(c));
    if (!pool.length) return null;
    pool.sort((a, b) => Math.hypot(a.spot.x - near.x, a.spot.z - near.z) - Math.hypot(b.spot.x - near.x, b.spot.z - near.z));
    const cell = pool[Math.floor(Math.random() * Math.min(8, pool.length))];
    return { cell, bay: bayForCell(cell) };
  };
  const cellLabel = (cell) => `ячейка ${cell.id}`;
  // Свободная ячейка поближе к точке (откуда её будут заполнять).
  const pickCell = (near, wantStored) => {
    const pool = cells.filter((c) => !c.reserved && c.stored === wantStored);
    if (!pool.length) return null;
    pool.sort((a, b) => Math.hypot(a.spot.x - near.x, a.spot.z - near.z) - Math.hypot(b.spot.x - near.x, b.spot.z - near.z));
    return pool[Math.floor(Math.random() * Math.min(6, pool.length))];
  };

  // Свободная проезжая клетка у точки — место, где исполнитель ждёт задания.
  const taken = [];
  const homeNear = (point) => {
    let best = null;
    for (let gz = 0; gz < nav.n; gz++) {
      for (let gx = 0; gx < nav.n; gx++) {
        if (!isWalkable(nav, gx, gz)) continue;
        const c = cellCenter(nav, gx, gz);
        if (taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 4.5)) continue;
        // Подальше от стоянок, мест погрузчиков и проёмов ворот — там идёт работа.
        if (reserved.some((r) => Math.hypot(r.x - c.x, r.z - c.z) < 6)) continue;
        if (allGates.some((g) => Math.hypot(g.worldCenter.x - c.x, g.worldCenter.z - c.z) < 9)) continue;
        if (cells.some((cell) => Math.hypot(cell.spot.x - c.x, cell.spot.z - c.z) < 1)) continue;
        const d = Math.hypot(c.x - point.x, c.z - point.z);
        if (d < 4) continue;
        if (!best || d < best.d) best = { x: c.x, z: c.z, d };
      }
    }
    const home = best ? { x: best.x, z: best.z } : { x: point.x, z: point.z };
    taken.push(home);
    return home;
  };
  // Освободить прежнее место ожидания и взять другое рядом.
  const rehome = (old) => {
    const i = taken.indexOf(old);
    const next = homeNear({ x: old.x + (Math.random() - 0.5) * 16, z: old.z + (Math.random() - 0.5) * 16 });
    if (i >= 0) taken.splice(i, 1);
    return next;
  };

  const jobs = [];
  let serial = 0;
  let doneIn = 0;
  let doneOut = 0;
  let simSeconds = 0;
  const forklifts = [];
  const amrs = [];
  const armUnits = [];
  const belts = [];
  const yards = [];
  const linkRuns = [];

  const makeForklifts = (spec, count, anchor, prefix) =>
    Array.from({ length: Math.max(1, count) }, (_, i) => {
      const home = homeNear(anchor);
      const f = createForkliftAgent({
        group,
        driver,
        traffic,
        robotFactory: factories.forklift(spec.model),
        start: home,
        home,
        speedUnits: toUnits(spec.speedMps ?? 2),
        loadRatio: Math.min(1, cargoWeightKg / Math.max(1, spec.capacityKg ?? 1000)),
        energyProfile: spec.energyProfile,
        name: `${prefix}${forklifts.length + 1}`,
        rehome,
      });
      forklifts.push(f);
      return f;
    });

  const makeAmrs = (spec, count, anchor) =>
    Array.from({ length: Math.max(1, count) }, () => {
      const home = homeNear(anchor);
      const a = createAmrAgent({
        group,
        driver: amrDriver,
        traffic,
        robotFactory: factories.transporter,
        start: home,
        home,
        speedUnits: toUnits(spec.speedMps ?? 1.8),
        energyProfile: spec.energyProfile,
        name: `AMR ${amrs.length + 1}`,
        rehome,
      });
      amrs.push(a);
      return a;
    });

  const nearestIdle = (pool, point) =>
    pool
      .filter((f) => f.isIdle())
      .sort((a, b) => Math.hypot(a.agent.pos.x - point.x, a.agent.pos.z - point.z) - Math.hypot(b.agent.pos.x - point.x, b.agent.pos.z - point.z))[0] ?? null;

  // Стоянка AMR: AMR встаёт в park, погрузчик — в stand вилами к нему.
  const makeBay = (spot, label) => {
    const park = servicePoint(spot.park);
    park.holds = (spot.holds ?? []).map((h) => servicePoint(h));
    const stand = spot.stand ? servicePoint(spot.stand, { face: spot.park }) : null;
    if (stand) {
      stand.partner = () => park.owner;
      park.partner = () => stand.owner;
    }
    return { park, stand, label };
  };

  const newJob = (kind, linkName) => {
    serial += 1;
    const job = { id: serial, kind, label: `№${serial}`, stage: "start", t0: simSeconds, link: linkName };
    jobs.push(job);
    return job;
  };
  const finish = (job) => {
    job.stage = "done";
    jobs.splice(jobs.indexOf(job), 1);
    if (job.kind === "in") doneIn += 1;
    else doneOut += 1;
  };

  // Концы перегрузки — что умеет точка: забрать груз или принять его.
  const truckEnd = (yard, bay) => ({
    spot: bay.spot,
    lift: 1.1,
    label: `ворота ${bay.gate.id + 1}`,
    waitLabel: "фуру у ворот",
    take: () => (yard.take(bay) ? cargoFactory.create() : null),
    put: (unit) => {
      if (!yard.put(bay)) return false;
      unit.removeFromParent();
      disposeTree(unit);
      return true;
    },
  });
  const cellEnd = (cell) => ({
    spot: cell.spot,
    lift: cell.tier * 1.9 + 0.3,
    label: cellLabel(cell),
    take: () => {
      cell.stored = false;
      cell.reserved = false;
      return cargoFactory.create();
    },
    put: (unit) => {
      unit.removeFromParent();
      disposeTree(unit);
      cell.stored = true;
      cell.reserved = false;
      return true;
    },
  });

  // ─── Связи ──────────────────────────────────────────────────────────────
  for (const link of links) {
    const inbound = link.slot === "inbound";
    const yard = createTruckYard({ group, gates: link.gates, payload: truckPayload, direction: inbound ? "in" : "out", truckFactory: factories.truck });
    yards.push(yard);
    const gateAnchor = link.gates[Math.floor(link.gates.length / 2)].worldCenter;
    const gateInside = { x: gateAnchor.x - link.gates[0].normal[0] * 10, z: gateAnchor.z - link.gates[0].normal[1] * 10 };
    const n = link.forklifts?.count ?? 0;
    const fSpec = link.forklifts ?? { speedMps: 2, capacityKg: 1000 };
    const prefix = link.forklifts ? (inbound ? "П" : "О") : "Оператор ";
    let scheme = "direct";
    if (link.station && inbound) scheme = "station";
    else if (link.amrs && link.bays) scheme = "shuttle";
    else if (link.conveyor?.lines.length) scheme = "belt";
    const run = { link, scheme, yard, inbound };
    linkRuns.push(run);
    if (scheme === "shuttle") {
      // У каждых ворот своя стоянка AMR: AMR встаёт внутри склада напротив проёма,
      // погрузчик — между ним и фурой. За заданием закрепляется стоянка его ворот.
      run.gateBays = new Map(
        link.gates.map((g) => {
          const inward = { x: -g.normal[0], z: -g.normal[1] };
          const at = (d) => ({ x: g.worldCenter.x + inward.x * d, z: g.worldCenter.z + inward.z * d });
          const spot = isWalkable(nav, ...Object.values(cellOfPoint(nav, at(12))))
            ? { park: at(12), stand: at(7.5) }
            : { park: link.bays.a.park, stand: link.bays.a.stand };
          const bay = makeBay(spot, `стоянка у ворот ${g.id + 1}`);
          bay.job = null;
          return [g.id, bay];
        }),
      );
      for (const gb of run.gateBays.values()) reserved.push(gb.park, gb.stand);
    }

    if (scheme === "direct") {
      run.pool = makeForklifts(fSpec, n, gateInside, prefix);
      continue;
    }
    // Погрузчики делятся: у ворот (фура ↔ лента/AMR) и у стеллажей (лента/AMR ↔ ячейка).
    const gateN = Math.max(1, Math.ceil(n / 2));
    const rackN = Math.max(1, n - gateN);
    run.gatePool = makeForklifts(fSpec, gateN, gateInside, prefix);

    if (scheme === "belt") {
      run.belts = link.conveyor.lines.map((line) => {
        // Приёмка: лента от ворот к стеллажам; отгрузка — от стеллажей к воротам.
        const points = inbound ? [line.start, line.end] : [line.end, line.start];
        const belt = createBeltPath({ group: armGroup, points, speed: 1.2, width: 2.6, spacing: 3.2, beltTexture });
        belts.push(belt);
        const dir = { x: points[1].x - points[0].x, z: points[1].z - points[0].z };
        const len = Math.hypot(dir.x, dir.z) || 1;
        const side = (p) => ({ x: p.x - (dir.z / len) * 4.2, z: p.z + (dir.x / len) * 4.2 });
        return {
          belt,
          inSpot: servicePoint(side(points[0]), { face: points[0] }),
          outSpot: servicePoint(side(points[1]), { face: points[1] }),
          capacity: Math.max(2, Math.floor(belt.total / 3.2) - 1),
          load: 0,
        };
      });
      run.rackPool = makeForklifts(fSpec, rackN, inbound ? run.belts[0].outSpot : run.belts[0].inSpot, prefix);
      continue;
    }

    if (scheme === "shuttle") {
      run.bayA = makeBay(link.bays.a, "стоянка AMR у ворот");
      run.bayB = makeBay(link.bays.b, "стоянка AMR у стеллажей");
      run.amrs = makeAmrs(link.amrs, link.amrs.count, link.bays.a.park);
      run.rackPool = makeForklifts(fSpec, rackN, link.bays.b.stand, prefix);
      continue;
    }

    // Станция приёмки: карусель, руки и стоянки AMR под руками.
    const plan = link.station.plan;
    run.bayB = makeBay(plan.rackBay, "стоянка AMR у стеллажей");
    run.amrs = makeAmrs(link.amrs, link.amrs.count, plan.arms[0].park);
    run.rackPool = makeForklifts(fSpec, rackN, plan.rackBay.stand, prefix);
    const carousel = createBeltPath({ group: armGroup, points: plan.loop, closed: true, speed: 1.4, width: 3, spacing: 3.4, beltTexture });
    belts.push(carousel);
    run.carousel = carousel;
    run.drops = plan.drops.map((drop) => ({
      d: carousel.project(drop.at),
      spot: servicePoint({ x: drop.stand.x, z: drop.stand.z, face: drop.at }),
      gateId: drop.gateId,
    }));
    run.arms = plan.arms.map((spot, k) => {
      const rig = factories.arm();
      rig.group.position.set(spot.base.x, 0, spot.base.z);
      rig.group.scale.setScalar(ARM_SCALE);
      armGroup.add(rig.group);
      const arm = { id: k + 1, job: null, park: makeBay({ park: spot.park, holds: plan.holds }, `рука ${k + 1}`), rig };
      let unit = null;
      // Рука останавливает только «свой» груз — за которым её закрепили.
      const pick = carousel.addPickPoint(carousel.project(spot.pick), (item) => item.meta?.job === arm.job && (unit?.readyToPick() ?? false));
      unit = createArmUnit({
        rig,
        scale: ARM_SCALE,
        from: { dir: plan.dirToBelt, radius: ARM_REACH, height: () => BELT_TOP + cargoFactory.unitHeight, pick },
        to: {
          dir: plan.dirToPark,
          radius: ARM_REACH,
          height: () => DECK_HEIGHT + cargoFactory.unitHeight,
          // Ставит, только когда AMR этого задания пустой стоит на стоянке руки.
          ready: () => Boolean(arm.job?.amr?.waitingLoad() && arm.park.park.owner === arm.job.amr.agent),
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
      arm.unit = unit;
      armUnits.push(unit);
      return arm;
    });
  }

  // ─── Диспетчер: запуск заданий и раздача шагов ──────────────────────────
  function dispatch() {
    for (const run of linkRuns) {
      if (run.inbound) dispatchIn(run);
      else dispatchOut(run);
      // Погрузчики у стеллажей / у ворот для заданий, которые уже в пути.
      for (const job of jobs.filter((j) => j.run === run && j.next && !j.nextAssigned)) {
        const pool = job.nextPool;
        const f = nearestIdle(pool, job.next.pick.spot);
        if (!f || !job.nextReady()) continue;
        job.nextAssigned = true;
        f.assign(job.next);
      }
    }
  }

  const jobLabelOf = (job) => job.label;

  function dispatchIn(run) {
    const { yard } = run;
    const bay = yard.bayWithCargo();
    if (!bay) return;
    if (run.scheme === "direct") {
      const f = nearestIdle(run.pool, bay.spot);
      const cell = f && pickCell(bay.spot, false);
      if (!cell) return;
      const job = newJob("in", run.link.slot);
      job.run = run;
      cell.reserved = true;
      yard.reserve(bay);
      f.assign({ jobLabel: jobLabelOf(job), pick: truckEnd(yard, bay), drop: cellEnd(cell), onDone: () => finish(job) });
      return;
    }
    const f = nearestIdle(run.gatePool, bay.spot);
    if (!f) return;

    if (run.scheme === "belt") {
      const lane = run.belts.filter((b) => b.load < b.capacity).sort((a, b) => a.load - b.load)[0];
      const cell = lane && pickCell(lane.outSpot, false);
      if (!cell) return;
      const job = newJob("in", run.link.slot);
      job.run = run;
      cell.reserved = true;
      yard.reserve(bay);
      lane.load += 1;
      f.assign({
        jobLabel: job.label,
        pick: truckEnd(yard, bay),
        drop: { spot: lane.inSpot, lift: BELT_TOP, label: "лента", waitLabel: "место на ленте", put: (unit) => lane.belt.put(unit, 0, { job }) },
      });
      job.next = {
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
        drop: cellEnd(cell),
        onDone: () => finish(job),
      };
      job.nextPool = run.rackPool;
      // Погрузчика у стеллажей зовём, когда паллета подъезжает к концу ленты.
      job.nextReady = () => lane.belt.items().some((i) => i.meta?.job === job && i.d > lane.belt.total - 12);
      return;
    }

    // Нужен свободный AMR (и для станции — свободная рука).
    const amr = run.amrs.find((a) => a.isIdle());
    if (!amr) return;
    const arm = run.scheme === "station" ? run.arms.find((a) => !a.job) : null;
    if (run.scheme === "station" && !arm) return;
    const loadBay = run.scheme === "station" ? arm.park : run.gateBays.get(bay.gate.id);
    if (run.scheme !== "station" && loadBay.job) return;
    const picked = pickCellWithBay(loadBay.park, false);
    if (!picked) return;
    const { cell, bay: rackBay } = picked;
    const job = newJob("in", run.link.slot);
    job.run = run;
    job.amr = amr;
    cell.reserved = true;
    rackBay.job = job;
    if (run.scheme !== "station") loadBay.job = job;
    yard.reserve(bay);
    amr.assign({
      jobLabel: job.label,
      onLoaded: () => {
        if (run.scheme !== "station") loadBay.job = null;
      },
      load: { spot: loadBay.park, label: loadBay.label, waitLabel: run.scheme === "station" ? `рука ${arm.id} поставит груз` : "погрузчик поставит груз" },
      unload: { spot: rackBay.park, label: rackBay.label, waitLabel: "погрузчик снимет груз" },
    });
    if (run.scheme === "station") {
      arm.job = job;
      const drop = run.drops.find((d) => d.gateId === bay.gate.id) ?? run.drops[0];
      f.assign({
        jobLabel: job.label,
        pick: truckEnd(yard, bay),
        drop: { spot: drop.spot, lift: BELT_TOP, label: "карусель", waitLabel: "место на карусели", put: (unit) => run.carousel.put(unit, drop.d, { job }) },
      });
    } else {
      f.assign({
        jobLabel: job.label,
        pick: truckEnd(yard, bay),
        drop: {
          spot: loadBay.stand,
          lift: DECK_HEIGHT,
          label: loadBay.label,
          waitLabel: `${amr.agent.name} на стоянке`,
          put: (unit) => (amr.waitingLoad() && loadBay.park.owner === amr.agent ? amr.load(unit) : false),
        },
      });
    }
    job.next = {
      jobLabel: job.label,
      pick: {
        spot: rackBay.stand,
        lift: DECK_HEIGHT,
        label: rackBay.label,
        waitLabel: `${amr.agent.name} с ${job.label}`,
        take: () => {
          if (!amr.waitingUnload() || rackBay.park.owner !== amr.agent) return null;
          rackBay.job = null;
          return amr.unload();
        },
      },
      drop: cellEnd(cell),
      onDone: () => finish(job),
    };
    job.nextPool = run.rackPool;
    // Погрузчика у стеллажей зовём, когда AMR с паллетой уже едет к стоянке.
    job.nextReady = () => amr.agent.state === "toUnload" || amr.agent.state === "waitUnload";
  }

  function dispatchOut(run) {
    const { yard } = run;
    const bay = yard.bayNeedingCargo();
    if (!bay) return;
    if (run.scheme === "direct") {
      const cell = pickCell(bay.spot, true);
      const f = cell && nearestIdle(run.pool, cell.spot);
      if (!f) return;
      const job = newJob("out", run.link.slot);
      job.run = run;
      cell.reserved = true;
      yard.reserve(bay);
      f.assign({ jobLabel: job.label, pick: cellEnd(cell), drop: truckEnd(yard, bay), onDone: () => finish(job) });
      return;
    }
    if (run.scheme === "belt") {
      const lane = run.belts.filter((b) => b.load < b.capacity).sort((a, b) => a.load - b.load)[0];
      const cell = lane && pickCell(lane.inSpot, true);
      const f = cell && nearestIdle(run.rackPool, cell.spot);
      if (!f) return;
      const job = newJob("out", run.link.slot);
      job.run = run;
      cell.reserved = true;
      yard.reserve(bay);
      lane.load += 1;
      f.assign({
        jobLabel: job.label,
        pick: cellEnd(cell),
        drop: { spot: lane.inSpot, lift: BELT_TOP, label: "лента", waitLabel: "место на ленте", put: (unit) => lane.belt.put(unit, 0, { job }) },
      });
      job.next = {
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
        drop: truckEnd(yard, bay),
        onDone: () => finish(job),
      };
      job.nextPool = run.gatePool;
      job.nextReady = () => lane.belt.items().some((i) => i.meta?.job === job && i.d > lane.belt.total - 12);
      return;
    }
    // Отгрузка через AMR: стеллаж → AMR у стеллажей → AMR у ворот → фура.
    const gateBay = run.gateBays.get(bay.gate.id);
    const amr = !gateBay.job && run.amrs.find((a) => a.isIdle());
    const picked = amr && pickCellWithBay(gateBay.park, true);
    const f = picked && nearestIdle(run.rackPool, picked.cell.spot);
    if (!f) return;
    const { cell, bay: rackBay } = picked;
    const job = newJob("out", run.link.slot);
    job.run = run;
    job.amr = amr;
    cell.reserved = true;
    rackBay.job = job;
    gateBay.job = job;
    yard.reserve(bay);
    amr.assign({
      jobLabel: job.label,
      load: { spot: rackBay.park, label: rackBay.label, waitLabel: "погрузчик поставит груз" },
      unload: { spot: gateBay.park, label: gateBay.label, waitLabel: "погрузчик снимет груз" },
      onLoaded: () => {
        rackBay.job = null;
      },
    });
    f.assign({
      jobLabel: job.label,
      pick: cellEnd(cell),
      drop: {
        spot: rackBay.stand,
        lift: DECK_HEIGHT,
        label: rackBay.label,
        waitLabel: `${amr.agent.name} на стоянке`,
        put: (unit) => (amr.waitingLoad() && rackBay.park.owner === amr.agent ? amr.load(unit) : false),
      },
    });
    job.next = {
      jobLabel: job.label,
      pick: {
        spot: gateBay.stand,
        lift: DECK_HEIGHT,
        label: gateBay.label,
        waitLabel: `${amr.agent.name} с ${job.label}`,
        take: () => {
          if (!amr.waitingUnload() || gateBay.park.owner !== amr.agent) return null;
          gateBay.job = null;
          return amr.unload();
        },
      },
      drop: truckEnd(yard, bay),
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
      avgRouteM: driver.stats().routeLegs ? Math.round((driver.stats().routeUnits / driver.stats().routeLegs) * metersPerUnit) : 0,
      busyLoaders: forklifts.filter((f) => !f.isIdle()).length + amrs.filter((a) => !a.isIdle()).length,
    };
  }

  return {
    step,
    getStats,
    bottleneck,
    // Задания в работе и что делают исполнители — для панели «Задания».
    snapshot: () => ({
      inFlight: jobs.length,
      doneIn,
      doneOut,
      agents: [...forklifts, ...amrs].map((x) => x.status()),
    }),
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
