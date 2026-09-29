/**
 * Экономика склада по модели Егора (bam-low/lct: domain/economics.js,
 * scenarioEngine.js, warehouseAdapter.js) на наших данных: паспорт объекта
 * (поля wh_*) и реальный каталог решений.
 *
 * Модель: парк считается по пиковому спросу и эффективной производительности
 * каждого флота (уборка, отбор/сортировка, перемещение паллет); экономия ФОТ —
 * по каждой замещаемой роли отдельно и не больше того, что парк физически
 * успевает сделать; окупаемость = CAPEX / годовой эффект; ROI = эффект ×
 * горизонт / CAPEX; TCO — с заменой оборудования по сроку службы и остаточной
 * стоимостью на конец горизонта.
 */
import type { CatalogSolution } from "./catalog.js";
import {
  FLEET_LABEL,
  fleetKindOf,
  fleetModelOf,
  fleetRobotOf,
  type FleetKind,
  type FleetRobot,
  type Substitution,
} from "./fleet.js";

// ─── Нормативы модели Егора (objectTypes.js, scenarioEngine.js) ───────────
export const WAREHOUSE_NORMS = {
  loadFactor: 0.85,
  availability: 0.95,
  /** Запас парка на пики и поломки — множитель до округления вверх. */
  reserveFactor: 1.1,
  /** Финансовый резерв сверх статей CAPEX. */
  capexReserveRatio: 0.05,
  tariffRubPerKwh: 7.5,
  /** Потери при зарядке батареи из сети. */
  chargeEfficiency: 0.9,
  /** Подъём/опускание вил, повороты, заезд в полосу за один рейс, с. */
  loaderHandlingSeconds: 25,
  /** С грузом погрузчик едет медленнее — доля потери скорости при полной загрузке. */
  loadSlowdown: 0.5,
  // Нет в карточке — оценки рынка (как и раньше в нашей модели):
  implementationShare: 0.15,
  serviceShare: 0.07,
  raasMonthlyShare: 0.025,
  lifespanYears: 7,
} as const;

type Params = Record<string, string>;

/** Параметры склада в терминах модели Егора, собранные из паспорта. */
export interface WarehouseParams {
  hoursPerShift: number;
  shifts: number;
  hoursPerDay: number;
  daysPerYear: number;
  peakLoadFactor: number;
  /** Средние потоки, ед./ч: приёмка, отгрузка (паллеты), отбор (строки). */
  loadPerHour: number;
  outboundPerHour: number;
  sortPerHour: number;
  /** Отбор в штуках, шт/ч, и штук на строку — для сортировочных систем. */
  itemsPerHour: number;
  itemsPerLine: number;
  piecePickSharePct: number;
  fastSkuSharePct: number;
  oversizedCargoPct: number;
  floorAreaM2: number;
  activeAreaM2: number;
  routeLengthM: number;
  cargoWeightKg: number;
  pickerCount: number;
  pickerWageMonth: number;
  forkliftOperatorCount: number;
  forkliftWageMonth: number;
  payrollTaxFactor: number;
  staffLossFactor: number;
  /** Выработка отборщика, строк/ч·чел. */
  manualProductivity: number;
  horizonYears: number;
  budgetMln: number | undefined;
  availablePowerKw: number | undefined;
}

function numberOf(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const match = text.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function warehouseParamsOf(values: Params): WarehouseParams {
  const num = (id: string, fallback: number) => numberOf(values[id]) ?? fallback;
  const hoursPerShift = Math.max(1, num("wh_prodolzhitelnost_smeny", 8));
  const shifts = Math.max(1, num("wh_kolichestvo_rabochih_smen_sutki", 1));
  const hoursPerDay = hoursPerShift * shifts;
  const floorAreaM2 = num("wh_obschaya_ploschad_sklada", 20000);
  return {
    hoursPerShift,
    shifts,
    hoursPerDay,
    daysPerYear: num("wh_rabochih_dney_godu", 305),
    peakLoadFactor: num("wh_pikovyy_koeffitsient_nagruzki", 1.5),
    loadPerHour: num("wh_obem_priemki", 0) / hoursPerDay,
    outboundPerHour: num("wh_obem_otgruzki", 0) / hoursPerDay,
    sortPerHour: num("wh_obem_otbora", 0) / hoursPerDay,
    itemsPerHour: num("wh_obem_otbora_2", 0) / hoursPerDay,
    itemsPerLine: num("wh_obem_otbora", 0) > 0 ? Math.max(1, num("wh_obem_otbora_2", 0) / num("wh_obem_otbora", 1)) : 1,
    piecePickSharePct: num("wh_dolya_melkoshtuchnogo_otbora", 0),
    fastSkuSharePct: num("wh_dolya_sku_bystrym_oborotom", 0),
    oversizedCargoPct: num("wh_dolya_negabaritnyh_nestandartnyh_gruzov", 0),
    floorAreaM2,
    activeAreaM2: num("wh_ploschad_aktivnoy_zony", floorAreaM2),
    routeLengthM: numberOf(values.wh_route_length_m) ?? Math.round(Math.sqrt(floorAreaM2) / 2),
    cargoWeightKg: num("wh_massa_gruzovoy_edinitsy", 50),
    pickerCount: num("wh_nih_otborschiki", 0),
    pickerWageMonth: num("wh_z_p_otborschika", 0),
    forkliftOperatorCount: num("wh_nih_operatory_pogruzchikov", 0),
    forkliftWageMonth: num("wh_z_p_operatora_pogruzchika", 0),
    payrollTaxFactor: num("wh_koeffitsient_nachisleniy_fot", 1.302),
    staffLossFactor: num("wh_koeffitsient_poter_rabochego_vremeni", 0) / 100,
    manualProductivity: num("wh_vyrabotka_otborschika", 0),
    horizonYears: Math.max(1, Math.round(num("wh_gorizont_rascheta_okupaemosti", 5))),
    budgetMln: numberOf(values.wh_planiruemyy_byudzhet_robotizatsiyu),
    availablePowerKw: numberOf(values.wh_moschnost_elektrosnabzheniya),
  };
}

// ─── Производительность и спрос (warehouseAdapter.js) ────────────────────
/** Мелкоштучный отбор медленнее, ходовые SKU А-класса — быстрее; не ниже 0,4. */
export function pickComplexityFactor(p: WarehouseParams): number {
  const piece = Math.min(1, Math.max(0, p.piecePickSharePct / 100));
  const fast = Math.min(1, Math.max(0, p.fastSkuSharePct / 100));
  return Math.max(0.4, 1 - piece * 0.35 + fast * 0.15);
}

/** Цикл погрузчика, с: порожний путь, путь с грузом (медленнее) и работа вилами. */
export function loaderCycleSeconds(robot: FleetRobot, p: WarehouseParams): number {
  const speed = robot.speed ?? 2;
  const loadRatio = robot.capacityKg ? Math.min(1, p.cargoWeightKg / robot.capacityKg) : 1;
  const route = p.routeLengthM;
  return (
    route / speed +
    route / (speed * (1 - WAREHOUSE_NORMS.loadSlowdown * loadRatio)) +
    WAREHOUSE_NORMS.loaderHandlingSeconds
  );
}

/** Скорость погрузчика с оператором, м/с — значение модели Егора, когда скорость не задана. */
export const MANUAL_FORKLIFT_SPEED = 2;

/**
 * Паллет в час у оператора погрузчика: нормы выработки в паспорте нет, поэтому
 * оператор проходит тот же цикл маршрута, что и робот, со скоростью 2 м/с.
 */
export function manualForkliftRate(p: WarehouseParams): number {
  const route = p.routeLengthM;
  const speed = MANUAL_FORKLIFT_SPEED;
  const cycle = route / speed + route / (speed * (1 - WAREHOUSE_NORMS.loadSlowdown)) + WAREHOUSE_NORMS.loaderHandlingSeconds;
  return 3600 / cycle;
}

/** Производительность одного робота, которую реально ждать на этом складе. */
export function effectiveThroughput(robot: FleetRobot, p: WarehouseParams): number {
  if (robot.kind === "arm") return (robot.nominalThroughput ?? 0) * pickComplexityFactor(p);
  if (robot.kind === "loader" && robot.mobile) {
    const byCycle = 3600 / loaderCycleSeconds(robot, p);
    return robot.nominalThroughput === null ? byCycle : Math.min(robot.nominalThroughput, byCycle);
  }
  return robot.nominalThroughput ?? 0;
}

/**
 * Пиковый спрос флота: м²/ч уборки, строк/ч отбора, штук/ч сортировки,
 * паллет/ч приёмки и отгрузки (погрузчики и конвейерные линии везут один поток).
 */
export function peakDemandOf(kind: FleetKind, p: WarehouseParams): number {
  if (kind === "vacuum") return p.activeAreaM2 / p.hoursPerShift;
  if (kind === "arm") return p.sortPerHour * p.peakLoadFactor;
  if (kind === "sorter") return p.itemsPerHour * p.peakLoadFactor;
  return (p.loadPerHour + p.outboundPerHour) * p.peakLoadFactor;
}

export const DEMAND_UNIT: Record<FleetKind, string> = {
  vacuum: "м²/ч",
  arm: "строк/ч",
  loader: "паллет/ч",
  sorter: "шт/ч",
  conveyor: "паллет/ч",
};

export function requiredRobotCount(peakDemand: number, throughputPerRobot: number): number {
  if (throughputPerRobot <= 0) return 0;
  const effective = throughputPerRobot * WAREHOUSE_NORMS.loadFactor * WAREHOUSE_NORMS.availability;
  return Math.max(0, Math.ceil((peakDemand / effective) * WAREHOUSE_NORMS.reserveFactor));
}

// ─── Стоимость одного робота ─────────────────────────────────────────────
interface UnitCosts {
  equipment: number; // ₽
  software: number;
  /** Внедрение: из карточки — на проект, иначе доля оборудования — на робота. */
  implementationPerRobot: number;
  implementationProject: number;
  implementationFromCard: boolean;
  serviceYear: number;
  serviceFromCard: boolean;
  raasMonthly: number;
  lifespanYears: number;
  lifespanFromCard: boolean;
  priceKnown: boolean;
}

function unitCostsOf(solution: CatalogSolution, costFactor = 1): UnitCosts {
  const price = solution.costs?.equipment ?? numberOf(solution.price);
  const mln = 1_000_000 * costFactor;
  const equipment = (price ?? 0) * mln;
  const implementationFromCard = solution.costs?.implementation !== undefined;
  const serviceFromCard = solution.costs?.maintenancePerYear !== undefined;
  return {
    equipment,
    software: (solution.costs?.software ?? 0) * mln,
    implementationPerRobot: implementationFromCard ? 0 : equipment * WAREHOUSE_NORMS.implementationShare,
    implementationProject: implementationFromCard ? solution.costs!.implementation! * mln : 0,
    implementationFromCard,
    serviceYear: serviceFromCard
      ? solution.costs!.maintenancePerYear! * mln
      : equipment * WAREHOUSE_NORMS.serviceShare,
    serviceFromCard,
    raasMonthly: equipment * WAREHOUSE_NORMS.raasMonthlyShare,
    lifespanYears: solution.lifespanYears ?? WAREHOUSE_NORMS.lifespanYears,
    lifespanFromCard: solution.lifespanYears !== undefined,
    priceKnown: price !== undefined && price > 0,
  };
}

function scaleCosts(costs: UnitCosts, factor: number): UnitCosts {
  if (factor === 1) return costs;
  return {
    ...costs,
    equipment: costs.equipment * factor,
    software: costs.software * factor,
    implementationPerRobot: costs.implementationPerRobot * factor,
    serviceYear: costs.serviceYear * factor,
    raasMonthly: costs.raasMonthly * factor,
  };
}

/** Электроэнергия за год, ₽: работа и простой с учётом загрузки, потери зарядки у батарейных. */
function energyPerYear(robot: FleetRobot, count: number, p: WarehouseParams): number {
  const hours = p.hoursPerDay * p.daysPerYear;
  const load = WAREHOUSE_NORMS.loadFactor;
  const usedKwh = (robot.workPowerKw * load + robot.idlePowerKw * (1 - load)) * hours;
  const gridKwh = robot.autonomyHours ? usedKwh / WAREHOUSE_NORMS.chargeEfficiency : usedKwh;
  return count * gridKwh * WAREHOUSE_NORMS.tariffRubPerKwh;
}

// ─── Сценарий склада: зоны и связи ──────────────────────────────────────
/**
 * Склад — цепочка зон и связей между ними. Связи приёмки и отгрузки везут
 * паллеты между воротами и хранением: их закрывают транспортные роботы (с
 * долями потока) и конвейер — инфраструктура связи, который укорачивает путь
 * до «последних метров» у стеллажа. Зоны отбора и сортировки — стационарные
 * роботы, уборка — поверх всего пола.
 */
export type SlotId = "inbound" | "outbound" | "picking" | "sorting" | "cleaning";

export const SLOTS: SlotId[] = ["inbound", "outbound", "picking", "sorting", "cleaning"];

export const SLOT_LABEL: Record<SlotId, string> = {
  inbound: "Приёмка: ворота → хранение",
  outbound: "Отгрузка: хранение → ворота",
  picking: "Отбор",
  sorting: "Сортировка",
  cleaning: "Уборка",
};

/** Какие виды роботов работают в слоте. */
export const SLOT_KINDS: Record<SlotId, FleetKind[]> = {
  inbound: ["loader", "conveyor"],
  outbound: ["loader", "conveyor"],
  picking: ["arm"],
  sorting: ["sorter"],
  cleaning: ["vacuum"],
};

export const TRANSPORT_SLOTS: SlotId[] = ["inbound", "outbound"];

export interface Assignment {
  slot: SlotId;
  solutionId: string;
  /** Доля потока слота (0..1); нет — поровну между роботами слота. Конвейеру не нужна. */
  share?: number;
}

/**
 * Плечо перегрузки в челночной схеме: погрузчик ставит паллету с фуры/ленты на
 * транспортировщик или снимает с него в стеллаж — рядом со стоянкой, ~10 м
 * (оценка команды, как и минимум последних метров ниже).
 */
export const TRANSFER_ROUTE_M = 10;

/** Плоский транспортировщик (AMR-платформа без вил): сам груз не берёт — только везёт. */
export function isPassiveCarrier(solution: CatalogSolution): boolean {
  return fleetModelOf(solution, "loader") === "transporter";
}

/** Последние метры от конца конвейера до места на стеллаже: четверть пути, не меньше 10 м. */
export function lastMileM(routeM: number): number {
  return Math.min(routeM, Math.max(10, Math.round(routeM * 0.25)));
}

/** Слоты по умолчанию для набора роботов: каждый — туда, где работает его вид. */
export function defaultAssignments(solutions: CatalogSolution[]): Assignment[] {
  const list: Assignment[] = [];
  for (const solution of solutions) {
    const kind = fleetKindOf(solution);
    if (!kind) continue;
    for (const slot of SLOTS.filter((id) => SLOT_KINDS[id].includes(kind))) {
      list.push({ slot, solutionId: solution.id });
    }
  }
  return list;
}

function slotDemand(slot: SlotId, p: WarehouseParams): number {
  if (slot === "inbound") return p.loadPerHour * p.peakLoadFactor;
  if (slot === "outbound") return p.outboundPerHour * p.peakLoadFactor;
  if (slot === "picking") return p.sortPerHour * p.peakLoadFactor;
  if (slot === "sorting") return p.itemsPerHour * p.peakLoadFactor;
  return p.activeAreaM2 / p.hoursPerShift;
}

// ─── Флот ───────────────────────────────────────────────────────────────
export interface FleetGroup {
  kind: FleetKind;
  slot: SlotId;
  /** Доля потока слота, которую везёт/делает эта группа (конвейер — 1). */
  share: number;
  robot: FleetRobot;
  count: number;
  throughputPerRobot: number;
  peakDemand: number;
  /** Путь в одну сторону, по которому считается цикл транспортного робота, м. */
  routeM?: number;
  /** Длина одной конвейерной линии, м. */
  lineLengthM?: number;
  costs: UnitCosts;
}

/** Связь приёмки или отгрузки: поток, путь и сколько ручной работы остаётся. */
export interface LinkPlan {
  slot: SlotId;
  flow: number;
  routeM: number;
  /** Путь после конвейера (последние метры) или весь путь без конвейера. */
  effectiveRouteM: number;
  conveyor: FleetGroup | null;
  carriers: FleetGroup[];
  /** Доля потока без робота — на людях. */
  manualShare: number;
  /** Челночная схема: плоский транспортировщик везёт, перегружают погрузчики (или операторы — false). */
  shuttle?: { lifters: boolean };
  /** Часов работы операторов в час: сейчас и после роботизации. */
  manualHoursBefore: number;
  manualHoursAfter: number;
}

export interface ScenarioPlan {
  solutions: CatalogSolution[];
  assignments?: Assignment[];
}

function groupOf(
  solution: CatalogSolution,
  kind: FleetKind,
  slot: SlotId,
  share: number,
  demand: number,
  p: WarehouseParams,
  costFactor: number,
  extra: { routeM?: number; lineLengthM?: number } = {},
): FleetGroup {
  const robot = fleetRobotOf(solution, kind);
  // Цена и мощность за метр — на длину линии.
  const lineM = solution.perMeter ? extra.lineLengthM ?? p.routeLengthM : 1;
  if (lineM !== 1) {
    robot.workPowerKw *= lineM;
    robot.idlePowerKw *= lineM;
  }
  const params = extra.routeM !== undefined ? { ...p, routeLengthM: extra.routeM } : p;
  const throughputPerRobot = effectiveThroughput(robot, params);
  return {
    kind,
    slot,
    share,
    robot,
    count: Math.max(1, requiredRobotCount(demand, throughputPerRobot)),
    throughputPerRobot,
    peakDemand: demand,
    ...extra,
    costs: scaleCosts(unitCostsOf(solution, costFactor), lineM),
  };
}

export function buildScenarioFleet(
  plan: ScenarioPlan,
  p: WarehouseParams,
  costFactor = 1,
): { groups: FleetGroup[]; links: LinkPlan[] } {
  const byId = new Map(plan.solutions.map((s) => [s.id, s]));
  const assignments = (plan.assignments?.length ? plan.assignments : defaultAssignments(plan.solutions)).filter((a) => {
    const solution = byId.get(a.solutionId);
    const kind = solution ? fleetKindOf(solution) : null;
    return kind !== null && SLOT_KINDS[a.slot].includes(kind);
  });
  const groups: FleetGroup[] = [];
  const links: LinkPlan[] = [];

  for (const slot of SLOTS) {
    const inSlot = assignments.filter((a) => a.slot === slot);
    if (!inSlot.length && !TRANSPORT_SLOTS.includes(slot)) continue;
    const demand = slotDemand(slot, p);

    if (TRANSPORT_SLOTS.includes(slot)) {
      const routeM = p.routeLengthM;
      const conveyorA = inSlot.find((a) => fleetKindOf(byId.get(a.solutionId)!) === "conveyor");
      const carriersA = inSlot.filter((a) => a !== conveyorA && fleetKindOf(byId.get(a.solutionId)!) !== "conveyor");
      const effectiveRouteM = conveyorA ? lastMileM(routeM) : routeM;
      const conveyor = conveyorA
        ? groupOf(byId.get(conveyorA.solutionId)!, "conveyor", slot, 1, demand, p, costFactor, {
            lineLengthM: Math.max(5, routeM - effectiveRouteM),
          })
        : null;
      if (conveyor) groups.push(conveyor);

      // Челночная схема: плоский транспортировщик везёт весь поток по плечу связи,
      // погрузчики только перегружают — на него у ворот/ленты и с него в стеллаж
      // (две перегрузки на паллету по короткому плечу). Нет погрузчиков —
      // перегрузку делают операторы.
      const haulersA = carriersA.filter((a) => isPassiveCarrier(byId.get(a.solutionId)!));
      if (haulersA.length) {
        const liftersA = carriersA.filter((a) => !haulersA.includes(a));
        const split = (list: Assignment[]) => {
          const total = list.reduce((sum, a) => sum + (a.share ?? 1), 0) || 1;
          return (a: Assignment) => (a.share ?? 1) / total;
        };
        const haulShare = split(haulersA);
        const liftShare = split(liftersA);
        const transfers = demand * 2;
        const haulers = haulersA.map((a) =>
          groupOf(byId.get(a.solutionId)!, "loader", slot, haulShare(a), demand * haulShare(a), p, costFactor, { routeM: effectiveRouteM }),
        );
        const lifters = liftersA.map((a) =>
          groupOf(byId.get(a.solutionId)!, "loader", slot, liftShare(a), transfers * liftShare(a), p, costFactor, { routeM: TRANSFER_ROUTE_M }),
        );
        groups.push(...haulers, ...lifters);
        const covered = (list: FleetGroup[]) => list.reduce((sum, g) => sum + (g.throughputPerRobot > 0 ? g.share : 0), 0);
        const haulCovered = Math.min(1, covered(haulers));
        const liftCovered = Math.min(1, covered(lifters));
        const before = demand / manualForkliftRate({ ...p, routeLengthM: routeM });
        const after =
          (demand * (1 - haulCovered)) / manualForkliftRate({ ...p, routeLengthM: effectiveRouteM }) +
          (transfers * (1 - liftCovered)) / manualForkliftRate({ ...p, routeLengthM: TRANSFER_ROUTE_M });
        links.push({
          slot,
          flow: demand,
          routeM,
          effectiveRouteM,
          conveyor,
          carriers: [...haulers, ...lifters],
          manualShare: Math.max(0, 1 - Math.min(haulCovered, liftCovered)),
          manualHoursBefore: before,
          manualHoursAfter: after,
          shuttle: { lifters: lifters.length > 0 },
        });
        continue;
      }

      // Доли: заданные — как есть (сумма не больше 1), остальным — поровну из остатка.
      const fixed = carriersA.filter((a) => a.share !== undefined);
      const fixedSum = Math.min(1, fixed.reduce((sum, a) => sum + Math.max(0, a.share!), 0));
      const free = carriersA.length - fixed.length;
      const shareOf = (a: Assignment) =>
        a.share !== undefined ? (Math.max(0, a.share) / Math.max(1, fixedSum || 1)) * Math.min(1, fixedSum) : free ? (1 - fixedSum) / free : 0;
      const carriers = carriersA.map((a) =>
        groupOf(byId.get(a.solutionId)!, "loader", slot, shareOf(a), demand * shareOf(a), p, costFactor, { routeM: effectiveRouteM }),
      );
      groups.push(...carriers);

      // Робот без известной производительности свою долю не закрывает — она на людях.
      const covered = carriers.reduce((sum, g) => sum + (g.throughputPerRobot > 0 ? g.share : 0), 0);
      const manualShare = Math.max(0, 1 - covered);
      const before = demand / manualForkliftRate({ ...p, routeLengthM: routeM });
      const after = (demand * manualShare) / manualForkliftRate({ ...p, routeLengthM: effectiveRouteM });
      links.push({ slot, flow: demand, routeM, effectiveRouteM, conveyor, carriers, manualShare, manualHoursBefore: before, manualHoursAfter: after });
      continue;
    }

    const shares = inSlot.map((a) => a.share ?? 1 / inSlot.length);
    const total = shares.reduce((a, b) => a + b, 0) || 1;
    inSlot.forEach((a, i) => {
      const solution = byId.get(a.solutionId)!;
      const share = shares[i]! / total;
      groups.push(groupOf(solution, fleetKindOf(solution)!, slot, share, demand * share, p, costFactor));
    });
  }
  return { groups, links };
}

/** Старый вызов: набор решений без слотов — слоты по умолчанию. */
export function buildFleet(solutions: CatalogSolution[], p: WarehouseParams, costFactor = 1): FleetGroup[] {
  return buildScenarioFleet({ solutions }, p, costFactor).groups;
}

// ─── Труд ───────────────────────────────────────────────────────────────
interface Labor {
  pickerCost: number;
  forkliftCost: number;
  baseline: number;
  savings: number;
  pickerFraction: number;
  forkliftFraction: number;
  armCapacityFraction: number | null;
  /** Доля часов операторов погрузчиков, которая остаётся на связях (null — связи не тронуты). */
  forkliftRemaining: number | null;
  oversizedCeiling: number;
}

function laborOf(p: WarehouseParams, groups: FleetGroup[], links: LinkPlan[]): Labor {
  const payroll = (count: number, wage: number) => count * wage * 12 * p.payrollTaxFactor;
  const pickerCost = payroll(p.pickerCount, p.pickerWageMonth);
  const forkliftCost = payroll(p.forkliftOperatorCount, p.forkliftWageMonth);
  const oversizedCeiling = 1 - Math.min(1, Math.max(0, p.oversizedCargoPct / 100));

  // Отборщики: пропускная способность роборук и сортера против того, что роль делает сейчас.
  const perShift = (roster: number) => roster / p.shifts / (1 + p.staffLossFactor);
  const pickerCapacity = perShift(p.pickerCount) * p.manualProductivity;
  const pickGroups = groups.filter((g) => g.kind === "arm" || g.kind === "sorter");
  const pickThroughput = pickGroups.reduce(
    (sum, g) => sum + (g.count * g.throughputPerRobot) / (g.kind === "sorter" ? p.itemsPerLine : 1),
    0,
  );
  const armCapacityFraction = pickGroups.length
    ? pickThroughput <= 0
      ? 0
      : pickerCapacity > 0
        ? Math.min(1, pickThroughput / pickerCapacity)
        : 1
    : null;
  const pickerFraction = armCapacityFraction === null ? 0 : Math.min(oversizedCeiling, armCapacityFraction);

  // Операторы погрузчиков: сколько часов ручной работы остаётся на связях приёмки и отгрузки.
  const touched = links.some((l) => l.conveyor || l.carriers.length);
  const before = links.reduce((sum, l) => sum + l.manualHoursBefore, 0);
  const after = links.reduce((sum, l) => sum + l.manualHoursAfter, 0);
  const forkliftRemaining = touched && before > 0 ? after / before : null;
  const forkliftFraction = forkliftRemaining === null ? 0 : Math.min(oversizedCeiling, 1 - forkliftRemaining);

  const savings = pickerCost * pickerFraction + forkliftCost * forkliftFraction;
  // Базовый ФОТ — обе роли, как у Егора; незамещённая часть входит в TCO сценариев
  // роботизации как оставшийся ФОТ, поэтому сравнение с «Как есть» честное.
  const baseline = pickerCost + forkliftCost;

  return {
    pickerCost,
    forkliftCost,
    baseline,
    savings,
    pickerFraction,
    forkliftFraction,
    armCapacityFraction,
    forkliftRemaining,
    oversizedCeiling,
  };
}

// ─── Сценарии (scenarioEngine.buildScenario, economics.tco) ──────────────
export interface WarehouseScenario {
  capex: number;
  capexRaw: { equipment: number; software: number; implementation: number; reserve: number };
  opexPerYear: number;
  service: number;
  energy: number;
  /** ФОТ ролей, который парк не замещает. */
  residualLabor: number;
  effect: number;
  paybackYears: number | null;
  roiPct: number | null;
  tco: number;
  replacementCapex: number;
  residualValue: number;
  lifespanYears: number;
}

function tcoParts(capex: number, horizon: number, lifespan: number) {
  let replacements = 0;
  if (lifespan > 0 && lifespan < horizon) replacements = Math.floor((horizon - 1) / lifespan);
  let residual = 0;
  if (lifespan > 0) {
    const yearsSinceLastPurchase = horizon - replacements * lifespan;
    residual = capex * Math.max(0, 1 - yearsSinceLastPurchase / lifespan);
  }
  return { replacementCapex: replacements * capex, residualValue: residual };
}

export function buildWarehouseScenario(kind: "purchase" | "raas", p: WarehouseParams, groups: FleetGroup[], labor: Labor): WarehouseScenario {
  let equipment = 0;
  let software = 0;
  let implementation = 0;
  let service = 0;
  let energy = 0;
  const spans: number[] = [];
  for (const g of groups) {
    energy += energyPerYear(g.robot, g.count, p);
    spans.push(g.costs.lifespanYears);
    if (kind === "raas") {
      service += g.count * g.costs.raasMonthly * 12;
      continue;
    }
    equipment += g.count * g.costs.equipment;
    software += g.count * g.costs.software;
    implementation += g.count * g.costs.implementationPerRobot + g.costs.implementationProject;
    service += g.count * g.costs.serviceYear;
  }
  const raw = equipment + software + implementation;
  const reserve = raw * WAREHOUSE_NORMS.capexReserveRatio;
  const capex = raw + reserve;
  const opexPerYear = service + energy;
  const effect = labor.savings - opexPerYear;
  const horizon = p.horizonYears;
  const lifespanYears = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 0;
  const { replacementCapex, residualValue } = kind === "raas" ? { replacementCapex: 0, residualValue: 0 } : tcoParts(capex, horizon, lifespanYears);
  const residualLabor = labor.baseline - labor.savings;
  return {
    capex,
    capexRaw: { equipment, software, implementation, reserve },
    opexPerYear,
    service,
    energy,
    residualLabor,
    effect,
    paybackYears: effect > 0 && capex > 0 ? capex / effect : null,
    roiPct: capex > 0 ? ((effect * horizon) / capex) * 100 : null,
    // TCO Егора + ФОТ, который остаётся: так «Покупка» сравнима с «Как есть».
    tco: capex + replacementCapex - residualValue + (opexPerYear + residualLabor) * horizon,
    replacementCapex,
    residualValue,
    lifespanYears,
  };
}

export interface WarehouseModel {
  params: WarehouseParams;
  groups: FleetGroup[];
  links: LinkPlan[];
  labor: Labor;
  purchase: WarehouseScenario;
  raas: WarehouseScenario;
  baselineTco: number;
}

export function runWarehouseModel(plan: ScenarioPlan, p: WarehouseParams, costFactor = 1): WarehouseModel {
  const { groups, links } = buildScenarioFleet(plan, p, costFactor);
  const labor = laborOf(p, groups, links);
  return {
    params: p,
    groups,
    links,
    labor,
    purchase: buildWarehouseScenario("purchase", p, groups, labor),
    raas: buildWarehouseScenario("raas", p, groups, labor),
    baselineTco: labor.baseline * p.horizonYears,
  };
}

// ─── Тексты допущений ────────────────────────────────────────────────────
function roleLine(role: string, fraction: number, capacityFraction: number | null): string {
  if (capacityFraction !== null && capacityFraction < 1 && capacityFraction <= fraction + 1e-9) {
    return `${role} — парк физически успевает ${Math.round(capacityFraction * 100)}% того, что делает эта роль сейчас, экономия по ней ограничена этой долей.`;
  }
  if (fraction >= 1) return `${role} — заменяется полностью.`;
  return `${role} — заменяется на ${Math.round(fraction * 100)}%.`;
}

export function laborAssumption(model: WarehouseModel): string {
  const { labor, groups, links } = model;
  const lines: string[] = [];
  if (groups.some((g) => g.kind === "arm" || g.kind === "sorter")) {
    lines.push(roleLine("Отборщики", labor.pickerFraction, labor.armCapacityFraction));
  }
  if (labor.forkliftRemaining !== null) {
    const parts = links
      .filter((l) => l.conveyor || l.carriers.length)
      .map((l) => {
        const how = [
          l.conveyor ? `конвейер до последних ${l.effectiveRouteM} м` : "",
          l.shuttle
            ? `транспортировщик везёт, перегрузку (2 на паллету, ~${TRANSFER_ROUTE_M} м) делают ${l.shuttle.lifters ? "погрузчики-роботы" : "операторы: сам транспортировщик груз не берёт"}`
            : l.carriers.length
              ? `роботы везут ${Math.round((1 - l.manualShare) * 100)}% потока`
              : "",
        ]
          .filter(Boolean)
          .join(", ");
        return `${l.slot === "inbound" ? "приёмка" : "отгрузка"} — ${how}`;
      });
    lines.push(
      `Операторы погрузчиков — остаётся ${Math.round(labor.forkliftRemaining * 100)}% часов (${parts.join("; ")}), заменяется ${Math.round(labor.forkliftFraction * 100)}%.`,
    );
  }
  if (!lines.length) {
    return "Уборщиков в паспорте склада нет — экономия труда для уборки не считается, только её собственные затраты.";
  }
  const ceiling = labor.oversizedCeiling < 1
    ? ` Потолок экономии — ${Math.round(labor.oversizedCeiling * 100)}%: негабаритные грузы остаются ручными при любом парке.`
    : "";
  return `Экономия труда считается по каждой роли отдельно. ${lines.join(" ")}${ceiling}`;
}

export function fleetSubstitutions(groups: FleetGroup[]): Array<{ name: string; items: Substitution[] }> {
  return groups
    .filter((g) => g.robot.substitutions.length)
    .map((g) => ({ name: g.robot.solution.name, items: g.robot.substitutions }));
}

export { FLEET_LABEL };
