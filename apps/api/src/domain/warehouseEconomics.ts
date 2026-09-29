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

// ─── Флот ───────────────────────────────────────────────────────────────
export interface FleetGroup {
  kind: FleetKind;
  robot: FleetRobot;
  count: number;
  throughputPerRobot: number;
  peakDemand: number;
  costs: UnitCosts;
}

export function buildFleet(
  solutions: CatalogSolution[],
  p: WarehouseParams,
  overrides?: Partial<Record<FleetKind, number>>,
  costFactor = 1,
): FleetGroup[] {
  const groups: FleetGroup[] = [];
  for (const solution of solutions) {
    const kind = fleetKindOf(solution);
    // Один флот каждого вида: второй робот того же вида делил бы тот же поток.
    if (!kind || groups.some((g) => g.kind === kind)) continue;
    const robot = fleetRobotOf(solution, kind);
    // Линия, у которой цена и мощность заданы за метр: длина — путь от ворот до хранения.
    const lineM = solution.perMeter ? p.routeLengthM : 1;
    if (lineM !== 1) {
      robot.workPowerKw *= lineM;
      robot.idlePowerKw *= lineM;
    }
    const throughputPerRobot = effectiveThroughput(robot, p);
    const peakDemand = peakDemandOf(kind, p);
    const counted = requiredRobotCount(peakDemand, throughputPerRobot);
    groups.push({
      kind,
      robot,
      count: Math.max(1, overrides?.[kind] ?? counted),
      throughputPerRobot,
      peakDemand,
      costs: scaleCosts(unitCostsOf(solution, costFactor), lineM),
    });
  }
  return groups;
}

// ─── Труд (laborSavingsFractionOf) ───────────────────────────────────────
interface Labor {
  pickerCost: number;
  forkliftCost: number;
  baseline: number;
  savings: number;
  pickerFraction: number;
  forkliftFraction: number;
  armCapacityFraction: number | null;
  loaderCapacityFraction: number | null;
  oversizedCeiling: number;
}

function laborOf(p: WarehouseParams, groups: FleetGroup[]): Labor {
  const payroll = (count: number, wage: number) => count * wage * 12 * p.payrollTaxFactor;
  const pickerCost = payroll(p.pickerCount, p.pickerWageMonth);
  const forkliftCost = payroll(p.forkliftOperatorCount, p.forkliftWageMonth);

  const oversizedCeiling = 1 - Math.min(1, Math.max(0, p.oversizedCargoPct / 100));
  // Сколько роль делает в час сейчас: штат одной смены за вычетом потерь рабочего времени.
  const perShift = (roster: number) => roster / p.shifts / (1 + p.staffLossFactor);
  const pickerCapacity = perShift(p.pickerCount) * p.manualProductivity;
  const forkliftCapacity = perShift(p.forkliftOperatorCount) * manualForkliftRate(p);

  const fleetOf = (kind: FleetKind) => groups.find((g) => g.kind === kind);
  // Роль замещают несколько флотов вместе: отборщиков — роборуки и сортер (его
  // штуки переводим в строки), операторов погрузчиков — погрузчики и конвейеры.
  const throughputOf = (kind: FleetKind, perUnit = 1) => {
    const group = fleetOf(kind);
    return group ? (group.count * group.throughputPerRobot) / perUnit : 0;
  };
  // Флота нет — null (роль не затронута); флот есть, а производительность не
  // известна — 0: замещать работу, которую парк не успевает, нечем.
  const capacityFraction = (present: boolean, total: number, roleCapacity: number) => {
    if (!present) return null;
    if (total <= 0) return 0;
    return roleCapacity > 0 ? Math.min(1, total / roleCapacity) : 1;
  };
  const armCapacityFraction = capacityFraction(
    Boolean(fleetOf("arm") || fleetOf("sorter")),
    throughputOf("arm") + throughputOf("sorter", p.itemsPerLine),
    pickerCapacity,
  );
  const loaderCapacityFraction = capacityFraction(
    Boolean(fleetOf("loader") || fleetOf("conveyor")),
    throughputOf("loader") + throughputOf("conveyor"),
    forkliftCapacity,
  );
  const pickerFraction = Math.min(oversizedCeiling, armCapacityFraction ?? 1);
  const forkliftFraction = Math.min(oversizedCeiling, loaderCapacityFraction ?? 1);

  const replacesPickers = Boolean(fleetOf("arm") || fleetOf("sorter"));
  const replacesForklifts = Boolean(fleetOf("loader") || fleetOf("conveyor"));
  const savings = (replacesPickers ? pickerCost * pickerFraction : 0) + (replacesForklifts ? forkliftCost * forkliftFraction : 0);
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
    loaderCapacityFraction,
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
  labor: Labor;
  purchase: WarehouseScenario;
  raas: WarehouseScenario;
  baselineTco: number;
}

export function runWarehouseModel(
  solutions: CatalogSolution[],
  p: WarehouseParams,
  overrides?: Partial<Record<FleetKind, number>>,
  costFactor = 1,
): WarehouseModel {
  const groups = buildFleet(solutions, p, overrides, costFactor);
  const labor = laborOf(p, groups);
  return {
    params: p,
    groups,
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
  const { labor, groups } = model;
  const lines: string[] = [];
  if (groups.some((g) => g.kind === "arm" || g.kind === "sorter")) {
    lines.push(roleLine("Отборщики", labor.pickerFraction, labor.armCapacityFraction));
  }
  if (groups.some((g) => g.kind === "loader" || g.kind === "conveyor")) {
    lines.push(roleLine("Операторы погрузчиков", labor.forkliftFraction, labor.loaderCapacityFraction));
  }
  if (!lines.length) {
    return "Уборщиков в паспорте склада нет — экономия труда для уборки не считается, только её собственные затраты.";
  }
  const ceiling = labor.oversizedCeiling < 1
    ? ` Потолок экономии — ${Math.round(labor.oversizedCeiling * 100)}%: негабаритные грузы остаются ручными при любом парке.`
    : "";
  return `Экономия труда считается по каждой роли отдельно — пропускная способность парка против того, что роль делает сейчас. ${lines.join(" ")}${ceiling}`;
}

export function fleetSubstitutions(groups: FleetGroup[]): Array<{ name: string; items: Substitution[] }> {
  return groups
    .filter((g) => g.robot.substitutions.length)
    .map((g) => ({ name: g.robot.solution.name, items: g.robot.substitutions }));
}

export { FLEET_LABEL };
