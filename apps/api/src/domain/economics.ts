/**
 * Расчёт экономики по паспорту объекта и выбранному решению каталога (ТЗ 3.5).
 * Модуль без зависимостей: его вызывают и API (POST /calculations), и MSW-моки
 * фронтенда — результат одинаковый в обоих режимах.
 *
 * Принцип: число из паспорта или карточки — используем; нет числа — не выдумываем,
 * а берём явно названное допущение и выносим его в «Допущения» и предупреждение.
 */
import { OBJECT_LABEL, type CatalogSolution } from "./catalog.js";
import type { FleetKind, Substitution } from "./fleet.js";
import { decodeLayoutCells, rackStorageOf, storageLevels } from "./warehouseLayout.js";
import {
  DEMAND_UNIT,
  FLEET_LABEL,
  WAREHOUSE_NORMS,
  fleetSubstitutions,
  laborAssumption,
  manualForkliftRate,
  MANUAL_FORKLIFT_SPEED,
  pickComplexityFactor,
  runWarehouseModel,
  warehouseParamsOf,
  type Assignment,
  type SlotId,
  SLOT_LABEL,
  type WarehouseModel,
  type WarehouseParams,
} from "./warehouseEconomics.js";

export const ECONOMICS_MODEL_VERSION = "economics-2026.09c";

type Params = Record<string, string>;
type Confidence = "confirmed" | "needs-review";

export interface CalculationInput {
  objectType: string;
  /** Значения паспорта; пустые поля добираются из defaultValue. */
  parameters: Params;
  fields: Array<{ id: string; label: string; defaultValue?: string }>;
  processes?: string[];
  solution: CatalogSolution;
  /** Набор роботов (по одному на флот); solution — главный из них. Нет — только solution. */
  solutions?: CatalogSolution[];
  /** Склад: какой робот в каком слоте сценария (приёмка, отгрузка, отбор…); нет — по виду робота. */
  assignments?: Assignment[];
}

export interface ScenarioOutput {
  links: Array<{
    slot: SlotId;
    label: string;
    flowPerHour: number;
    routeM: number;
    /** Путь транспорта после конвейера (последние метры) или весь путь. */
    effectiveRouteM: number;
    conveyorSolutionId?: string;
    /** Доля потока на людях (0..1). */
    manualShare: number;
  }>;
}

/** Флот в расчёте склада — те же числа идут в 3D-сцену. */
export interface FleetOutput {
  kind: FleetKind;
  /** Слот сценария: приёмка, отгрузка, отбор, сортировка, уборка. */
  slot: SlotId;
  /** Доля потока слота (0..1). */
  share: number;
  /** Путь в одну сторону для транспорта, м. */
  routeM?: number;
  /** Длина одной конвейерной линии, м. */
  lineLengthM?: number;
  label: string;
  /** Ключ 3D-модели сцены (washer, transporter, storagecube…). */
  model?: string;
  solutionId: string;
  name: string;
  count: number;
  /** Эффективная производительность одного робота на этом складе. */
  throughputPerRobot: number;
  unit: string;
  peakDemand: number;
  speedMps?: number;
  capacityKg?: number;
  autonomyHours?: number;
  chargeHours?: number;
  workPowerKw: number;
  idlePowerKw: number;
  substitutions: Substitution[];
  /** СтойкаБокс: башен в сетке — ёмкость хранения (роботы — шаттлы, count). */
  storageTowers?: number;
  /** Габарит робота в плане, м — по нему сцена масштабирует модель и расставляет роботов. */
  footprint: { lengthM: number; widthM: number; estimated: boolean; basis: string };
}

export interface CalculationOutput {
  objectTitle: string;
  meta: string;
  payback: Kpi;
  capex: Kpi;
  roi: Kpi;
  opexSaving: { series: number[]; percent: string; meta: string };
  warning: string;
  assumptions: string[];
  scenarios: Array<{
    id: string;
    title: string;
    subtitle: string;
    tco: number;
    share: number;
    delta: string;
    detail?: string;
    recommended?: boolean;
  }>;
  costGroups: Array<{
    id: string;
    title: string;
    amount: number;
    share: number;
    confidence: Confidence;
    lines: Array<{ title: string; amount: number; share: number; source: string; confidence?: Confidence }>;
  }>;
  totalTco: number;
  sensitivity: Array<{ id: string; label: string; impact: number; direction: "up" | "down"; low?: string; high?: string }>;
  solutionId?: string;
  /** Сколько роботов заложено в расчёт и почему. */
  robots: { count: number; basis: string };
  fleet?: FleetOutput[];
  /** Склад: связи приёмки и отгрузки — поток, путь, конвейер, доля на людях. */
  scenario?: ScenarioOutput;
}

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  trend?: "up" | "down" | "none";
}

// ─── Нормативы модели (docs/05-economics.md) ─────────────────────────────
export const NORMS = {
  loadFactor: 0.85,
  availability: 0.95,
  reserveRatio: 0.05,
  /** Обслуживание в год, доля цены оборудования, если в карточке нет своей цифры. */
  serviceShare: 0.07,
  /** Внедрение, интеграция, зарядная инфраструктура — доля цены оборудования. */
  implementationShare: 0.15,
  /** RaaS: месячный платёж за робота, доля его цены (включает сервис). */
  raasMonthlyShare: 0.025,
  lifespanYears: 7,
  wageGrowth: 0.09,
  tariffRubPerKwh: 7,
  /** Один оператор парка в смену на столько роботов. */
  robotsPerOperator: 10,
  /** Погрузка/разгрузка паллеты в цикле погрузчика, с. */
  handlingSeconds: 60,
} as const;

// ─── Профили процессов: чей труд замещает робот и чем меряется поток ─────
interface Role {
  label: string;
  headcount: string;
  wage: string;
  /** Заработная плата взята у смежной роли — показываем это. */
  wageNote?: string;
}

interface Demand {
  label: string;
  unit: string;
  fields: string[];
  /** Какие единицы производительности робота сопоставимы с этим потоком. */
  robotUnit: RegExp;
  /** Цикл «туда-обратно» по объекту — если в карточке нет производительности, считаем по скорости. */
  bySpeed?: boolean;
}

interface Profile {
  process: string;
  label: string;
  roles: Role[];
  demand?: Demand;
  shifts?: string;
  /** Смен (бригад) при круглосуточной работе, если в паспорте поля нет. */
  fixedShifts?: number;
  hoursPerShift?: string;
  /** Поле с полной длительностью суток работы, если смен нет (стационар 24/7). */
  fixedHoursPerDay?: number;
  days?: string;
  fixedDays?: number;
  payrollFactor?: string;
  horizon?: string;
  area?: string;
  /** Планируемый бюджет на роботизацию, млн ₽. */
  budget?: string;
}

const WAREHOUSE_BASE = {
  shifts: "wh_kolichestvo_rabochih_smen_sutki",
  hoursPerShift: "wh_prodolzhitelnost_smeny",
  days: "wh_rabochih_dney_godu",
  payrollFactor: "wh_koeffitsient_nachisleniy_fot",
  horizon: "wh_gorizont_rascheta_okupaemosti",
  area: "wh_obschaya_ploschad_sklada",
  budget: "wh_planiruemyy_byudzhet_robotizatsiyu",
};
const AIRPORT_BASE = {
  fixedShifts: 4,
  fixedHoursPerDay: 24,
  fixedDays: 365,
  payrollFactor: "ap_koeffitsient_nachisleniy_fot",
  horizon: "ap_gorizont_rascheta_okupaemosti",
  area: "ap_summarnaya_ploschad_terminala",
  budget: "ap_planiruemyy_byudzhet_robotizatsiyu",
};
const CLINIC_BASE = {
  shifts: "cl_kolichestvo_smen_medpersonala",
  fixedHoursPerDay: 24,
  fixedDays: 365,
  payrollFactor: "cl_koeffitsient_nachisleniy_fot",
  horizon: "cl_gorizont_rascheta_okupaemosti",
  area: "cl_obschaya_ploschad_zdaniya",
  budget: "cl_planiruemyy_byudzhet_robotizatsiyu",
};

const FORKLIFT_OPERATORS: Role = {
  label: "операторы погрузчиков",
  headcount: "wh_nih_operatory_pogruzchikov",
  wage: "wh_z_p_operatora_pogruzchika",
};
const PICKERS: Role = { label: "отборщики", headcount: "wh_nih_otborschiki", wage: "wh_z_p_otborschika" };
const PALLET_FLOW: Demand = {
  label: "приёмка и отгрузка",
  unit: "паллет",
  fields: ["wh_obem_priemki", "wh_obem_otgruzki"],
  robotUnit: /паллет|операц|рейс|цикл/i,
  bySpeed: true,
};
const PICK_FLOW: Demand = {
  label: "отбор",
  unit: "строк",
  fields: ["wh_obem_otbora"],
  robotUnit: /строк|операц|заказ|шт|посыл|цикл/i,
};
const GROUND_STAFF: Role = {
  label: "персонал наземного обслуживания",
  headcount: "ap_chislennost_personala_nazemnogo_obsluzhivaniya",
  wage: "ap_z_p_sotrudnika_nazemnogo_obsluzhivaniya",
};
const BAGGAGE_FLOW: Demand = {
  label: "перемещение багажа",
  unit: "ед.",
  fields: ["ap_obem_peremescheniya_bagazha"],
  robotUnit: /ед|багаж|операц|рейс/i,
};
const PORTERS: Role = {
  label: "санитары и транспортировщики",
  headcount: "cl_chislennost_sanitarov_transportirovschikov",
  wage: "cl_z_p_sanitara_transportirovschika",
};

const PROFILES: Record<string, Profile[]> = {
  warehouse: [
    ...["transport", "receiving", "storage"].map((process) => ({
      ...WAREHOUSE_BASE,
      process,
      label: "перемещение паллет",
      roles: [FORKLIFT_OPERATORS],
      demand: PALLET_FLOW,
    })),
    ...["picking", "sorting"].map((process) => ({
      ...WAREHOUSE_BASE,
      process,
      label: "отбор и сортировка",
      roles: [PICKERS],
      demand: PICK_FLOW,
    })),
  ],
  airport: [
    ...["baggage", "ramp", "cargo"].map((process) => ({
      ...AIRPORT_BASE,
      process,
      label: "наземное обслуживание и багаж",
      roles: [GROUND_STAFF],
      demand: BAGGAGE_FLOW,
    })),
    {
      ...AIRPORT_BASE,
      process: "cleaning",
      label: "уборка терминала",
      roles: [
        {
          label: "операторы уборочных машин",
          headcount: "ap_kolichestvo_uborochnyh_mashin",
          wage: "ap_z_p_uborschika_terminala",
        },
      ],
      demand: {
        label: "уборка терминала",
        unit: "м²",
        fields: ["ap_ploschad_ubiraemaya_robotizirovannoy_uborkoy"],
        robotUnit: /м²|м2/i,
      },
    },
  ],
  clinic: [
    ...["delivery", "pharmacy", "laboratory"].map((process) => ({
      ...CLINIC_BASE,
      process,
      label: "доставка медикаментов и анализов",
      roles: [PORTERS],
    })),
    {
      ...CLINIC_BASE,
      process: "linen",
      label: "транспортировка белья и питания",
      roles: [
        {
          label: "сотрудники прачечной (транспорт белья)",
          headcount: "cl_chislennost_sotrudnikov_prachechnoy",
          wage: "cl_z_p_sanitara_transportirovschika",
          wageNote: "з/п санитара-транспортировщика — отдельной з/п прачечной в паспорте нет",
        },
        {
          label: "сотрудники пищеблока (раздача)",
          headcount: "cl_chislennost_sotrudnikov_pischebloka",
          wage: "cl_z_p_sotrudnika_pischebloka",
        },
      ],
    },
  ],
};

// Машины уборки аэропорта считаются в штуках: на каждую — один оператор в смену.
const HEADCOUNT_PER_SHIFT = new Set(["ap_kolichestvo_uborochnyh_mashin"]);

// ─── Вспомогательное ─────────────────────────────────────────────────────
function numberOf(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const match = text.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
/** Доля → проценты для подписи: 0.07 → «7», 0.025 → «2,5» (без хвостов плавающей точки). */
const pct = (share: number) => fmt(share * 100);
const mln = (rub: number) => rub / 1_000_000;

function fmt(value: number): string {
  return round1(value).toLocaleString("ru-RU", { maximumFractionDigits: 1 }).replace(/ /g, " ");
}

function yearsText(years: number | null): string {
  if (years === null) return "не окупается";
  if (years < 0.1) return "меньше 0,1 года";
  return `${fmt(years)} ${yearsUnit(round1(years))}`;
}

function yearsUnit(value: number): string {
  const n = Math.floor(value);
  if (!Number.isInteger(value)) return "года";
  if (n % 10 === 1 && n % 100 !== 11) return "год";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "года";
  return "лет";
}

function profileFor(objectType: string, solution: CatalogSolution, selected: string[] | undefined): Profile | undefined {
  const list = PROFILES[objectType] ?? [];
  const own = solution.processes ?? [];
  // Сначала процесс, который отметил пользователь и который робот поддерживает.
  const order = [
    ...own.filter((process) => selected?.includes(process)),
    ...own,
    ...(selected ?? []),
  ];
  for (const process of order) {
    const found = list.find((profile) => profile.process === process);
    if (found) return found;
  }
  return undefined;
}

// ─── Расчёт ─────────────────────────────────────────────────────────────
interface Scenario {
  capex: number; // ₽
  opexYear: number; // ₽ в первый год, без роста
  residualLaborYear: number; // ₽ в первый год, растёт с зарплатами
  replacementCapex: number; // ₽, повторная покупка за горизонт
}

interface Core {
  baselineLaborYear: number;
  horizon: number;
  purchase: Scenario;
  raas: Scenario;
}

function laborAt(year: number, base: number) {
  return base * (1 + NORMS.wageGrowth) ** (year - 1);
}

/** Поток денег: экономия ФОТ минус затраты сценария, по годам. */
function yearlyEffects(core: Core, scenario: Scenario): number[] {
  return Array.from({ length: core.horizon }, (_, index) => {
    const year = index + 1;
    return laborAt(year, core.baselineLaborYear) - laborAt(year, scenario.residualLaborYear) - scenario.opexYear;
  });
}

function paybackYears(core: Core, scenario: Scenario): number | null {
  let remaining = scenario.capex;
  const effects = yearlyEffects(core, scenario);
  for (let index = 0; index < effects.length + 30; index += 1) {
    const year = index + 1;
    const effect =
      effects[index] ??
      laborAt(year, core.baselineLaborYear) - laborAt(year, scenario.residualLaborYear) - scenario.opexYear;
    if (effect <= 0) {
      if (index === 0) return null;
      continue;
    }
    if (remaining <= effect) return index + remaining / effect;
    remaining -= effect;
  }
  return null;
}

function tcoOf(core: Core, scenario: Scenario): number {
  let total = scenario.capex + scenario.replacementCapex;
  for (let year = 1; year <= core.horizon; year += 1) {
    total += scenario.opexYear + laborAt(year, scenario.residualLaborYear);
  }
  return total;
}

function baselineTco(core: Core): number {
  let total = 0;
  for (let year = 1; year <= core.horizon; year += 1) total += laborAt(year, core.baselineLaborYear);
  return total;
}

export function calculateEconomics(input: CalculationInput): CalculationOutput {
  if (input.objectType === "warehouse") return calculateWarehouseEconomics(input);
  const { objectType, solution } = input;
  const values: Params = {
    ...Object.fromEntries(input.fields.map((field) => [field.id, field.defaultValue ?? ""])),
    ...Object.fromEntries(Object.entries(input.parameters).filter(([, value]) => value?.trim() !== "")),
  };
  const entered = new Set(Object.entries(input.parameters).filter(([, v]) => v?.trim()).map(([k]) => k));
  const labelOf = (id: string) => input.fields.find((field) => field.id === id)?.label ?? id;
  const value = (id: string | undefined) => (id ? numberOf(values[id]) : undefined);

  const assumptions: string[] = [];
  const gaps: string[] = [];
  const defaultsUsed: string[] = [];
  const track = (id: string | undefined) => {
    if (id && !entered.has(id) && values[id]) defaultsUsed.push(labelOf(id));
  };

  const profile = profileFor(objectType, solution, input.processes);
  const base = profile ?? (PROFILES[objectType]?.[0] as Profile | undefined);
  const horizon = Math.max(1, Math.round(value(base?.horizon) ?? 7));
  const shifts = Math.max(1, value(base?.shifts) ?? base?.fixedShifts ?? 1);
  if (base?.fixedShifts && !base.shifts) {
    assumptions.push(`Круглосуточный режим: ${base.fixedShifts} бригады (в паспорте числа смен нет).`);
  }
  const hoursPerDay = base?.fixedHoursPerDay ?? Math.max(1, (value(base?.hoursPerShift) ?? 8) * shifts);
  const days = base?.fixedDays ?? value(base?.days) ?? 365;
  const payrollFactor = value(base?.payrollFactor) ?? 1.302;
  [base?.horizon, base?.shifts, base?.hoursPerShift, base?.days, base?.payrollFactor].forEach(track);

  // ─ Замещаемый труд
  let replacedHeadcount = 0;
  let baselineLaborYear = 0;
  let perShiftStaff = 0;
  let meanWage = 0;
  if (profile) {
    for (const role of profile.roles) {
      const count = value(role.headcount);
      const wage = value(role.wage);
      track(role.headcount);
      track(role.wage);
      if (count === undefined || wage === undefined) {
        gaps.push(`нет численности или з/п: ${role.label}`);
        continue;
      }
      const headcount = HEADCOUNT_PER_SHIFT.has(role.headcount) ? count * shifts : count;
      replacedHeadcount += headcount;
      baselineLaborYear += headcount * wage * 12 * payrollFactor;
      perShiftStaff += HEADCOUNT_PER_SHIFT.has(role.headcount) ? count : count / shifts;
      if (role.wageNote) assumptions.push(`Для роли «${role.label}» взята ${role.wageNote}.`);
    }
    meanWage = replacedHeadcount ? baselineLaborYear / replacedHeadcount / 12 / payrollFactor : 0;
    assumptions.push(
      `Робот замещает труд на процессе «${profile.label}»: ${profile.roles.map((r) => r.label).join(", ")} — ${Math.round(replacedHeadcount)} чел. Другие роли в расчёт не входят.`,
    );
  } else {
    gaps.push("для процессов этого решения в паспорте объекта нет численности и зарплат персонала");
  }

  // Полная стоимость одного робота с внедрением и резервом — для оценки по бюджету.
  const unitCapexRub = () => {
    const price = solution.costs?.equipment ?? numberOf(solution.price);
    if (!price) return undefined;
    const equipment = price * 1_000_000 + (solution.costs?.software ?? 0) * 1_000_000;
    return equipment * (1 + NORMS.implementationShare) * (1 + NORMS.reserveRatio);
  };

  // ─ Число роботов
  let count = 0;
  let basis = "";
  const throughput = solution.throughput;
  const unit = solution.throughputUnit ?? "";
  const demand = profile?.demand;
  const demandPerDay = demand
    ? demand.fields.map((id) => value(id)).filter((v): v is number => v !== undefined).reduce((a, b) => a + b, 0)
    : 0;
  demand?.fields.forEach(track);
  const peakFactor = objectType === "warehouse" ? value("wh_pikovyy_koeffitsient_nagruzki") ?? 1.5 : 1;
  const peakPerHour = (demandPerDay / hoursPerDay) * peakFactor;
  let perRobot: number | undefined;
  let perRobotSource = "";

  if (demand && demandPerDay > 0) {
    if (throughput && demand.robotUnit.test(unit)) {
      perRobot = throughput;
      perRobotSource = `производительность из карточки — ${fmt(throughput)} ${unit}`;
    } else if (demand.bySpeed) {
      const speed = numberOf(solution.speed);
      const areaM2 = value(base?.area);
      if (speed && speed > 0 && areaM2) {
        const route = Math.sqrt(areaM2) / 2;
        const cycle = (2 * route) / speed + NORMS.handlingSeconds;
        perRobot = 3600 / cycle;
        perRobotSource = `по скорости ${fmt(speed)} м/с и маршруту ${Math.round(route)} м в одну сторону (половина стороны квадратного склада) + ${NORMS.handlingSeconds} с на погрузку — ${fmt(perRobot)} паллет/ч`;
      }
    }
  }

  if (perRobot && perRobot > 0) {
    const effective = perRobot * NORMS.loadFactor * NORMS.availability;
    count = Math.ceil(peakPerHour / effective);
    count += Math.ceil(count * NORMS.reserveRatio);
    basis = `Пиковый поток «${demand!.label}» ${fmt(peakPerHour)} ${demand!.unit}/ч${peakFactor !== 1 ? ` (с пиковым коэффициентом ${peakFactor})` : ""}; на робота ${perRobotSource}; загрузка ${NORMS.loadFactor}, готовность ${NORMS.availability}, резерв ${pct(NORMS.reserveRatio)}%.`;
  } else if (perShiftStaff > 0) {
    count = Math.max(1, Math.ceil(perShiftStaff));
    basis = `Производительности робота в карточке нет${demand ? ", по скорости не пересчитать" : ""}: 1 робот на 1 пост в смене — ${count} шт.`;
    // Без производительности парк на весь штат — не оценка, а экстраполяция.
    // Ограничиваем его бюджетом из паспорта: столько роботов заказчик готов купить.
    const budget = value(base?.budget);
    const unit = unitCapexRub();
    if (budget && unit) {
      track(base?.budget);
      const affordable = Math.max(1, Math.floor((budget * 1_000_000) / unit));
      if (affordable < count) {
        count = affordable;
        basis += ` Столько не укладывается в бюджет ${fmt(budget)} млн ₽ — взято ${count} шт. на весь бюджет.`;
      }
    }
    gaps.push("производительность робота");
  } else {
    count = 1;
    basis = "Потребность не посчитать: нет ни потока, ни численности персонала — заложен 1 робот.";
  }
  assumptions.push(`Роботов в расчёте: ${count}. ${basis}`);

  // ─ Сколько людей реально замещают роботы: 1 робот = 1 пост в каждой смене.
  // Штат шире числа постов на отпуска и болезни — это коэффициент потерь.
  const lossPct = objectType === "warehouse" ? value("wh_koeffitsient_poter_rabochego_vremeni") : undefined;
  if (lossPct !== undefined) track("wh_koeffitsient_poter_rabochego_vremeni");
  const staffPerPost = 1 / (1 - Math.min(0.6, Math.max(0, (lossPct ?? 0) / 100)));
  if (replacedHeadcount > 0) {
    const covered = count * shifts * staffPerPost;
    if (covered < replacedHeadcount) {
      const share = covered / replacedHeadcount;
      assumptions.push(
        `Роботы закрывают ${Math.round(covered)} из ${Math.round(replacedHeadcount)} чел.: 1 робот = 1 пост в каждой из ${shifts} смен${lossPct ? `, штат на пост ${fmt(staffPerPost)} с учётом потерь рабочего времени ${lossPct}%` : ""}. Остальной персонал процесса остаётся.`,
      );
      baselineLaborYear *= share;
      replacedHeadcount = covered;
    }
  }

  // ─ Стоимость
  const unitPrice = solution.costs?.equipment ?? numberOf(solution.price);
  const unitPriceRub = unitPrice !== undefined ? unitPrice * 1_000_000 : undefined;
  if (unitPriceRub === undefined) gaps.push("цена робота");
  const priceKnown = unitPriceRub !== undefined && unitPriceRub > 0;
  const equipment = (unitPriceRub ?? 0) * count;
  const software = (solution.costs?.software ?? 0) * 1_000_000 * count;
  const implementationFromCard = solution.costs?.implementation !== undefined;
  const implementation = implementationFromCard
    ? solution.costs!.implementation! * 1_000_000
    : equipment * NORMS.implementationShare;
  const reserve = (equipment + software + implementation) * NORMS.reserveRatio;
  const capex = equipment + software + implementation + reserve;

  const serviceFromCard = solution.costs?.maintenancePerYear !== undefined;
  const serviceYear = serviceFromCard
    ? solution.costs!.maintenancePerYear! * 1_000_000 * count
    : equipment * NORMS.serviceShare;

  let energyYear = 0;
  let energyNote = "";
  const operatingHours = hoursPerDay * days * NORMS.loadFactor;
  if (solution.powerKw) {
    energyYear = solution.powerKw * operatingHours * NORMS.tariffRubPerKwh * count;
    energyNote = `мощность ${fmt(solution.powerKw)} кВт из карточки`;
  } else if (solution.batteryKwh && solution.autonomyHours) {
    const kw = solution.batteryKwh / solution.autonomyHours;
    energyYear = kw * operatingHours * NORMS.tariffRubPerKwh * count;
    energyNote = `батарея ${fmt(solution.batteryKwh)} кВт·ч / ${fmt(solution.autonomyHours)} ч работы`;
  } else {
    gaps.push("потребляемая мощность (электроэнергия не учтена)");
  }

  const operators = count > 0 ? Math.ceil(count / NORMS.robotsPerOperator) * shifts : 0;
  const operatorsYear = operators * meanWage * 12 * payrollFactor;

  const lifespan = solution.lifespanYears ?? NORMS.lifespanYears;
  if (!solution.lifespanYears) assumptions.push(`Срок службы робота — ${NORMS.lifespanYears} лет (в карточке не указан).`);
  const replacements = lifespan < horizon ? Math.floor((horizon - 1) / lifespan) : 0;

  const raasYear = (unitPriceRub ?? 0) * NORMS.raasMonthlyShare * 12 * count;

  const core: Core = {
    baselineLaborYear,
    horizon,
    purchase: {
      capex,
      opexYear: serviceYear + energyYear,
      residualLaborYear: operatorsYear,
      replacementCapex: replacements * (equipment + software),
    },
    raas: {
      capex: implementation + implementation * NORMS.reserveRatio,
      opexYear: raasYear + energyYear,
      residualLaborYear: operatorsYear,
      replacementCapex: 0,
    },
  };

  const asIsTco = baselineTco(core);
  const purchaseTco = tcoOf(core, core.purchase);
  const raasTco = tcoOf(core, core.raas);
  const purchasePayback = priceKnown ? paybackYears(core, core.purchase) : null;
  const raasPayback = priceKnown ? paybackYears(core, core.raas) : null;
  const effects = yearlyEffects(core, core.purchase);
  const netBenefit = effects.reduce((a, b) => a + b, 0) - capex - core.purchase.replacementCapex;
  const roiPct = capex > 0 ? (netBenefit / capex) * 100 : null;

  const recommendedId = !priceKnown || baselineLaborYear === 0
    ? null
    : Math.min(purchaseTco, raasTco) < asIsTco
      ? purchaseTco <= raasTco ? "purchase" : "raas"
      : null;

  // ─ KPI
  const payback: Kpi = purchasePayback !== null
    ? {
        label: "Срок окупаемости",
        value: fmt(purchasePayback),
        unit: yearsUnit(round1(purchasePayback)),
        trend: "down",
        note:
          raasPayback !== null
            ? `Покупка; аренда (RaaS) окупается за ${yearsText(raasPayback)}.`
            : "Покупка; аренда (RaaS) не окупается.",
      }
    : {
        label: "Срок окупаемости",
        value: "—",
        unit: "",
        trend: "none",
        note: priceKnown
          ? baselineLaborYear === 0
            ? "Нет данных о замещаемом персонале — эффект не посчитать."
            : "Экономия не покрывает затраты — не окупается."
          : "Нет цены робота — окупаемость не посчитать.",
      };

  const firstYearSaving = effects[0] ?? 0;
  const opexPercent = baselineLaborYear > 0 ? (firstYearSaving / baselineLaborYear) * 100 : 0;

  // ─ Структура затрат (сценарий «Покупка», за горизонт)
  const residualTotal = Array.from({ length: horizon }, (_, i) => laborAt(i + 1, operatorsYear)).reduce((a, b) => a + b, 0);
  const capexLines = [
    {
      title: `${count} × ${solution.name}`,
      amount: equipment,
      source: solution.source ? `Каталог: ${solution.source}` : "Каталог решений",
      confidence: (solution.fieldSources?.["costs.equipment"]?.confirmed === false ? "needs-review" : "confirmed") as Confidence,
    },
    ...(software > 0
      ? [{ title: "Программное обеспечение", amount: software, source: "Каталог решений", confidence: "confirmed" as Confidence }]
      : []),
    {
      title: implementationFromCard
        ? "Внедрение и интеграция"
        : `Внедрение, интеграция, зарядка — ${pct(NORMS.implementationShare)}% от оборудования`,
      amount: implementation,
      source: implementationFromCard ? "Каталог решений" : "Оценка",
      confidence: (implementationFromCard ? "confirmed" : "needs-review") as Confidence,
    },
    { title: `Резерв ${pct(NORMS.reserveRatio)}%`, amount: reserve, source: "Методика", confidence: "needs-review" as Confidence },
    ...(core.purchase.replacementCapex > 0
      ? [{
          title: `Замена оборудования после ${fmt(lifespan)} лет`,
          amount: core.purchase.replacementCapex,
          source: solution.lifespanYears ? "Каталог решений" : "Оценка",
          confidence: "needs-review" as Confidence,
        }]
      : []),
  ];
  const opexLines = [
    {
      title: serviceFromCard ? "Обслуживание" : `Обслуживание, ${pct(NORMS.serviceShare)}% цены в год`,
      amount: serviceYear * horizon,
      source: serviceFromCard ? "Каталог решений" : "Отраслевой бенчмарк",
      confidence: (serviceFromCard ? "confirmed" : "needs-review") as Confidence,
    },
    {
      title: energyYear > 0 ? `Электроэнергия (${energyNote}, ${NORMS.tariffRubPerKwh} ₽/кВт·ч)` : "Электроэнергия — нет данных о мощности",
      amount: energyYear * horizon,
      source: energyYear > 0 ? "Каталог + тариф" : "Нет данных",
      confidence: "needs-review" as Confidence,
    },
    {
      title: `Операторы парка: ${operators} чел. (1 на ${NORMS.robotsPerOperator} роботов в смену)`,
      amount: residualTotal,
      source: "Оценка",
      confidence: "needs-review" as Confidence,
    },
  ];
  const totalTco = purchaseTco;
  const share = (amount: number) => (totalTco > 0 ? Math.round((amount / totalTco) * 100) : 0);
  const group = (id: string, title: string, lines: typeof capexLines) => {
    const amount = lines.reduce((sum, line) => sum + line.amount, 0);
    return {
      id,
      title,
      amount: round1(mln(amount)),
      share: share(amount),
      confidence: (lines.some((line) => line.confidence === "needs-review") ? "needs-review" : "confirmed") as Confidence,
      lines: lines.map((line) => ({ ...line, amount: round1(mln(line.amount)), share: share(line.amount) })),
    };
  };

  // ─ Сценарии
  const maxTco = Math.max(asIsTco, purchaseTco, raasTco, 1);
  const delta = (tco: number) => {
    const diff = mln(tco - asIsTco);
    return `${diff < 0 ? "−" : "+"}${fmt(Math.abs(diff))}`;
  };
  const scenarios = [
    {
      id: "as-is",
      title: "Как есть",
      subtitle: "Без автоматизации",
      tco: round1(mln(asIsTco)),
      share: round1(asIsTco / maxTco * 100) / 100,
      delta: "база",
      detail: `${fmt(mln(asIsTco))} млн ₽: ФОТ замещаемых ролей за ${horizon} ${yearsUnit(horizon)} с ростом ${pct(NORMS.wageGrowth)}% в год`,
    },
    {
      id: "purchase",
      title: "Покупка",
      subtitle: "CAPEX + сервис",
      tco: round1(mln(purchaseTco)),
      share: round1(purchaseTco / maxTco * 100) / 100,
      delta: delta(purchaseTco),
      ...(recommendedId === "purchase" ? { recommended: true } : {}),
    },
    {
      id: "raas",
      title: "RaaS",
      subtitle: "Аренда, без покупки",
      tco: round1(mln(raasTco)),
      share: round1(raasTco / maxTco * 100) / 100,
      delta: delta(raasTco),
      ...(recommendedId === "raas" ? { recommended: true } : {}),
    },
  ];

  // ─ Чувствительность: ±20% по ключевым входам, срок окупаемости покупки
  const sensitivity: CalculationOutput["sensitivity"] = [];
  if (purchasePayback !== null) {
    const variants: Array<{ id: string; label: string; direction: "up" | "down"; apply: (k: number) => Core }> = [
      {
        id: "wage",
        label: "Зарплата замещаемого персонала",
        direction: "down",
        apply: (k) => ({ ...core, baselineLaborYear: baselineLaborYear * k, purchase: { ...core.purchase, residualLaborYear: operatorsYear * k } }),
      },
      {
        id: "equipment",
        label: "Цена оборудования",
        direction: "up",
        apply: (k) => ({ ...core, purchase: { ...core.purchase, capex: capex * k, opexYear: serviceYear * k + energyYear } }),
      },
      {
        id: "count",
        label: "Число роботов (производительность)",
        direction: "up",
        apply: (k) => ({
          ...core,
          purchase: {
            ...core.purchase,
            capex: capex * k,
            opexYear: (serviceYear + energyYear) * k,
            residualLaborYear: operatorsYear * k,
          },
        }),
      },
      {
        id: "service",
        label: "Обслуживание и энергия",
        direction: "up",
        apply: (k) => ({ ...core, purchase: { ...core.purchase, opexYear: (serviceYear + energyYear) * k } }),
      },
    ];
    const describe = yearsText;
    for (const variant of variants) {
      const optimistic = variant.apply(variant.direction === "down" ? 1.2 : 0.8);
      const cautious = variant.apply(variant.direction === "down" ? 0.8 : 1.2);
      const opt = paybackYears(optimistic, optimistic.purchase);
      const cau = paybackYears(cautious, cautious.purchase);
      const spread = (cau ?? purchasePayback * 2) - (opt ?? purchasePayback);
      sensitivity.push({
        id: variant.id,
        label: `${variant.label}, ±20%`,
        impact: round1(Math.abs(spread) / 2 / purchasePayback * 100) / 100,
        direction: variant.direction,
        low: describe(opt),
        high: describe(cau),
      });
    }
    sensitivity.sort((a, b) => b.impact - a.impact);
  }

  assumptions.push(
    `Горизонт ${horizon} ${yearsUnit(horizon)}, рост зарплат ${pct(NORMS.wageGrowth)}% в год, без дисконтирования.`,
    `ФОТ = численность × з/п × 12 × коэффициент начислений ${payrollFactor}.`,
    `Режим работы: ${fmt(hoursPerDay)} ч в сутки, ${days} дн. в году.`,
    `RaaS: ${pct(NORMS.raasMonthlyShare)}% цены робота в месяц, сервис включён; внедрение оплачивается отдельно (оценка рынка).`,
  );
  if (defaultsUsed.length) {
    assumptions.push(`Значения по умолчанию (в паспорте не введены): ${[...new Set(defaultsUsed)].join(", ")}.`);
  }

  const budgetMln = value(base?.budget);
  if (budgetMln && priceKnown && mln(capex) > budgetMln * 1.001) {
    gaps.push(`CAPEX ${fmt(mln(capex))} млн ₽ больше бюджета ${fmt(budgetMln)} млн ₽ из паспорта`);
  }
  const area = value(base?.area);
  const warning = gaps.length
    ? `Не хватает данных: ${[...new Set(gaps)].join("; ")}. Там, где данных нет, приняты допущения — результат предварительный.`
    : "Цены и производительность — из каталога; обслуживание, внедрение и тариф RaaS — отраслевые оценки. Уточните у поставщика перед защитой бюджета.";

  return {
    objectTitle: `${OBJECT_LABEL[objectType] ?? "Объект"}${area ? ` · ${Math.round(area).toLocaleString("ru-RU").replace(/ /g, " ")} м²` : ""}`,
    meta: `${count} × ${solution.name} · ${objectType === "warehouse" ? `${shifts} ${shifts === 1 ? "смена" : "смены"} · ` : ""}${Math.round(replacedHeadcount)} чел. замещаемых ролей · горизонт ${horizon} ${yearsUnit(horizon)}`,
    payback,
    capex: { label: "CAPEX", value: fmt(mln(capex)), note: "млн ₽, разово", trend: "none" },
    roi: {
      label: `ROI, ${horizon} ${yearsUnit(horizon)}`,
      value: roiPct === null || baselineLaborYear === 0 ? "—" : `${Math.round(roiPct)}%`,
      note: `Чистая выгода ${fmt(mln(netBenefit))} млн ₽`,
      trend: roiPct !== null && roiPct > 0 ? "up" : "down",
    },
    opexSaving: {
      series: effects.map((effect) => round1(mln(effect))),
      percent: baselineLaborYear > 0 ? `${opexPercent >= 0 ? "+" : "−"}${fmt(Math.abs(opexPercent))}%` : "—",
      meta: `${fmt(mln(effects[effects.length - 1] ?? 0))} млн ₽ в год к ${horizon}-му году`,
    },
    warning,
    assumptions,
    scenarios,
    costGroups: [
      group("capex", "CAPEX — разовая покупка", capexLines),
      group("opex", `OPEX — расходы за ${horizon} ${yearsUnit(horizon)}`, opexLines),
    ],
    totalTco: round1(mln(totalTco)),
    sensitivity,
    solutionId: solution.id,
    robots: { count, basis },
  };
}

// ─── Склад: модель Егора (warehouseEconomics.ts) ─────────────────────────
function paybackKpi(model: WarehouseModel, priceKnown: boolean): Kpi {
  const { purchase, raas, labor } = model;
  if (purchase.paybackYears !== null) {
    return {
      label: "Срок окупаемости",
      value: fmt(purchase.paybackYears),
      unit: yearsUnit(round1(purchase.paybackYears)),
      trend: "down",
      note:
        raas.effect > 0
          ? `Покупка: CAPEX / годовой эффект. Аренда (RaaS) даёт ${fmt(mln(raas.effect))} млн ₽ в год без вложений.`
          : "Покупка: CAPEX / годовой эффект. Аренда (RaaS) не окупается.",
    };
  }
  return {
    label: "Срок окупаемости",
    value: "—",
    unit: "",
    trend: "none",
    note: !priceKnown
      ? "Нет цены робота — окупаемость не посчитать."
      : labor.savings === 0
        ? "Парк не замещает ролей с зарплатой в паспорте — эффекта нет."
        : "Экономия ФОТ не покрывает расходы на парк — не окупается.",
  };
}

function calculateWarehouseEconomics(input: CalculationInput): CalculationOutput {
  const values: Params = {
    ...Object.fromEntries(input.fields.map((field) => [field.id, field.defaultValue ?? ""])),
    ...Object.fromEntries(Object.entries(input.parameters).filter(([, value]) => value?.trim() !== "")),
  };
  const entered = new Set(Object.entries(input.parameters).filter(([, v]) => v?.trim()).map(([k]) => k));
  const labelOf = (id: string) => input.fields.find((field) => field.id === id)?.label ?? id;
  const defaultsUsed = input.fields
    .filter((field) => !entered.has(field.id) && field.defaultValue && /^wh_/.test(field.id))
    .map((field) => labelOf(field.id));

  const params = warehouseParamsOf(values);
  const solutions = input.solutions?.length ? input.solutions : [input.solution];
  const plan = { solutions, ...(input.assignments ? { assignments: input.assignments } : {}) };
  const model = runWarehouseModel(plan, params);
  const { groups, labor, purchase, raas } = model;
  const horizon = params.horizonYears;
  const gaps: string[] = [];

  if (!groups.length) gaps.push(`для «${input.solution.name}» в модели склада нет флота (уборка, отбор, перемещение паллет)`);
  const priceKnown = groups.length > 0 && groups.every((g) => g.costs.priceKnown);
  if (!priceKnown) gaps.push("цена робота");
  if (labor.baseline === 0) gaps.push("численность и з/п отборщиков и операторов погрузчиков");
  for (const g of groups.filter((item) => item.throughputPerRobot <= 0)) {
    gaps.push(`производительность «${g.robot.solution.name}» не указана — заложена 1 система, экономия по ней не считается`);
  }
  const substituted = fleetSubstitutions(groups);
  if (substituted.length) {
    gaps.push(
      substituted
        .map(({ name, items }) => `${name} — из демо-робота: ${items.map((item) => item.field).join(", ")}`)
        .join("; "),
    );
  }
  const peakPowerKw = groups.reduce((sum, g) => sum + g.robot.workPowerKw * g.count, 0);
  if (params.availablePowerKw !== undefined && peakPowerKw > params.availablePowerKw) {
    gaps.push(`пиковая мощность парка ${fmt(peakPowerKw)} кВт больше доступной ${fmt(params.availablePowerKw)} кВт`);
  }
  if (params.budgetMln && priceKnown && mln(purchase.capex) > params.budgetMln * 1.001) {
    gaps.push(`CAPEX ${fmt(mln(purchase.capex))} млн ₽ больше бюджета ${fmt(params.budgetMln)} млн ₽ из паспорта`);
  }

  // Планировка из конструктора: ёмкость нарисованных стеллажей против паспорта.
  const layout = decodeLayoutCells(values.wh_layout);
  const num = (id: string, fallback: number) => numberOf(values[id]) ?? fallback;
  const storage = layout
    ? rackStorageOf(layout, {
        areaM2: params.floorAreaM2,
        ceilingM: num("wh_vysota_potolkov_zone_hraneniya", 10),
        palletLengthM: num("wh_pallet_length", 1200) / 1000,
        palletWidthM: num("wh_pallet_width", 800) / 1000,
        palletHeightM: num("wh_pallet_height", 1600) / 1000,
      })
    : null;
  const palletSlots = num("wh_kolichestvo_palletomest", 0);
  if (storage && palletSlots && storage.pallets < palletSlots * 0.9) {
    gaps.push(
      `стеллажи на планировке вмещают ≈ ${Math.round(storage.pallets).toLocaleString("ru-RU")} из ${palletSlots.toLocaleString("ru-RU")} паллетомест паспорта`,
    );
  }

  // СтойкаБокс: роботы — шаттлы (их считает поток), сетка башен — ёмкость хранения.
  const cubeLevels = storageLevels(num("wh_vysota_potolkov_zone_hraneniya", 10), num("wh_pallet_height", 1600) / 1000);
  const cubeTowers = palletSlots ? Math.ceil(palletSlots / cubeLevels) : undefined;
  const cube = groups.find((g) => g.robot.model === "storagecube");

  const count = groups.reduce((sum, g) => sum + g.count, 0);
  const fleetLine = (g: (typeof groups)[number]) =>
    `${SLOT_LABEL[g.slot]}: ${g.count} × ${g.robot.solution.name}${g.share < 1 ? ` (${Math.round(g.share * 100)}% потока)` : ""} — пик ${fmt(g.peakDemand)} ${DEMAND_UNIT[g.kind]}, на робота ${fmt(g.throughputPerRobot)} ${DEMAND_UNIT[g.kind]}`;
  const basis = groups.length
    ? `${groups.map(fleetLine).join("; ")}. Загрузка ${WAREHOUSE_NORMS.loadFactor}, готовность ${WAREHOUSE_NORMS.availability}, резерв парка ×${WAREHOUSE_NORMS.reserveFactor}.`
    : "Решение не относится ни к одному флоту склада — заложен 1 робот.";

  const assumptions = [
    `Роботов в расчёте: ${count}. ${basis}`,
    laborAssumption(model),
    `ФОТ = численность × з/п × 12 × коэффициент начислений ${params.payrollTaxFactor}. Сколько роль делает в час — штат одной смены с учётом потерь рабочего времени ${Math.round(params.staffLossFactor * 100)}%; для операторов погрузчиков нормы выработки в паспорте нет — оператор проходит тот же маршрут со скоростью ${MANUAL_FORKLIFT_SPEED} м/с: ${fmt(manualForkliftRate(params))} паллет/ч.`,
    ...(groups.some((g) => g.kind === "arm")
      ? [`Производительность отбора скорректирована на состав заказов: ${params.piecePickSharePct}% мелкоштучного и ${params.fastSkuSharePct}% SKU А-класса — множитель ×${pickComplexityFactor(params).toFixed(2)}.`]
      : []),
    ...(groups.some((g) => g.kind === "loader" && g.robot.mobile)
      ? [`Цикл погрузчика: маршрут ${params.routeLengthM} м туда порожним и обратно с грузом ${params.cargoWeightKg} кг (с грузом медленнее) + ${WAREHOUSE_NORMS.loaderHandlingSeconds} с на вилы.`]
      : []),
    ...(layout
      ? [
          `Планировка из конструктора: путь погрузчика ${params.routeLengthM} м — средний путь по проездам от ближайших ворот до стеллажа.${
            storage
              ? ` Стеллажи ${fmt(storage.rackAreaM2)} м² × ${storage.levels} ярусов (потолок / высота паллеты с зазором) × ${fmt(storage.perLevelPerM2)} паллет на м² ≈ ${Math.round(storage.pallets).toLocaleString("ru-RU")} паллетомест.`
              : ""
          }`,
        ]
      : []),
    ...(cube
      ? [
          `${cube.robot.solution.name}: роботы — шаттлы над сеткой башен, их ${cube.count} по потоку; сетка — ёмкость хранения${
            cubeTowers ? `: ${cubeTowers.toLocaleString("ru-RU")} башен по ${cubeLevels} ярусов на ${palletSlots.toLocaleString("ru-RU")} паллетомест паспорта` : ""
          }. Цена карточки — модуль «шаттл + участок сетки»: отдельной цены сетки в каталоге нет.`,
        ]
      : []),
    ...(groups.some((g) => g.kind === "vacuum")
      ? [`Уборка: активная зона ${fmt(params.activeAreaM2)} м² за одну смену ${params.hoursPerShift} ч.`]
      : []),
    `Окупаемость = CAPEX / годовой эффект; эффект = экономия ФОТ − OPEX парка. ROI = эффект × ${horizon} ${yearsUnit(horizon)} / CAPEX.`,
    `TCO = CAPEX + замена оборудования по сроку службы − остаточная стоимость + (OPEX + оставшийся ФОТ) × горизонт.`,
    `Резерв CAPEX ${pct(WAREHOUSE_NORMS.capexReserveRatio)}%. Нет в карточке: внедрение ${pct(WAREHOUSE_NORMS.implementationShare)}% цены, сервис ${pct(WAREHOUSE_NORMS.serviceShare)}% цены в год, срок службы ${WAREHOUSE_NORMS.lifespanYears} лет, RaaS ${pct(WAREHOUSE_NORMS.raasMonthlyShare)}% цены в месяц.`,
    `Электроэнергия ${WAREHOUSE_NORMS.tariffRubPerKwh} ₽/кВт·ч, ${fmt(params.hoursPerDay)} ч в сутки, ${params.daysPerYear} дн. в году; батарейные роботы берут из сети на ${Math.round((1 / WAREHOUSE_NORMS.chargeEfficiency - 1) * 100)}% больше.`,
    ...(defaultsUsed.length ? [`Значения по умолчанию (в паспорте не введены): ${[...new Set(defaultsUsed)].join(", ")}.`] : []),
  ];

  // ─ Структура затрат (покупка, за горизонт)
  const capexLines = [
    ...groups.map((g) => ({
      title: g.robot.solution.perMeter
        ? `${g.count} × ${g.robot.solution.name}, линия ${g.lineLengthM ?? params.routeLengthM} м — ${SLOT_LABEL[g.slot].toLowerCase()}`
        : `${g.count} × ${g.robot.solution.name} — ${SLOT_LABEL[g.slot].toLowerCase()}`,
      amount: g.count * g.costs.equipment,
      source: g.robot.solution.source ? `Каталог: ${g.robot.solution.source}` : "Каталог решений",
      confidence: (g.robot.solution.fieldSources?.["costs.equipment"]?.confirmed === false ? "needs-review" : "confirmed") as Confidence,
    })),
    ...(purchase.capexRaw.software > 0
      ? [{ title: "Программное обеспечение", amount: purchase.capexRaw.software, source: "Каталог решений", confidence: "confirmed" as Confidence }]
      : []),
    {
      title: groups.every((g) => g.costs.implementationFromCard)
        ? "Внедрение и интеграция"
        : `Внедрение, интеграция, зарядка — ${pct(WAREHOUSE_NORMS.implementationShare)}% от оборудования`,
      amount: purchase.capexRaw.implementation,
      source: groups.every((g) => g.costs.implementationFromCard) ? "Каталог решений" : "Оценка",
      confidence: "needs-review" as Confidence,
    },
    { title: `Резерв ${pct(WAREHOUSE_NORMS.capexReserveRatio)}%`, amount: purchase.capexRaw.reserve, source: "Методика", confidence: "needs-review" as Confidence },
    ...(purchase.replacementCapex > 0
      ? [{ title: `Замена оборудования после ${fmt(purchase.lifespanYears)} лет`, amount: purchase.replacementCapex, source: "Срок службы", confidence: "needs-review" as Confidence }]
      : []),
    ...(purchase.residualValue > 0
      ? [{ title: `Остаточная стоимость на конец ${horizon}-го года`, amount: -purchase.residualValue, source: "Линейная амортизация", confidence: "needs-review" as Confidence }]
      : []),
  ];
  const opexLines = [
    {
      title: groups.every((g) => g.costs.serviceFromCard) ? "Обслуживание" : `Обслуживание, ${pct(WAREHOUSE_NORMS.serviceShare)}% цены в год`,
      amount: purchase.service * horizon,
      source: groups.every((g) => g.costs.serviceFromCard) ? "Каталог решений" : "Отраслевой бенчмарк",
      confidence: (groups.every((g) => g.costs.serviceFromCard) ? "confirmed" : "needs-review") as Confidence,
    },
    {
      title: `Электроэнергия (${WAREHOUSE_NORMS.tariffRubPerKwh} ₽/кВт·ч)`,
      amount: purchase.energy * horizon,
      source: "Каталог + тариф",
      confidence: "needs-review" as Confidence,
    },
    ...(purchase.residualLabor > 0
      ? [{ title: "Оставшийся ФОТ: работа, которую парк не берёт", amount: purchase.residualLabor * horizon, source: "Паспорт объекта", confidence: "confirmed" as Confidence }]
      : []),
  ];
  const totalTco = purchase.tco;
  const share = (amount: number) => (totalTco > 0 ? Math.round((amount / totalTco) * 100) : 0);
  const group = (id: string, title: string, lines: typeof capexLines) => {
    const amount = lines.reduce((sum, line) => sum + line.amount, 0);
    return {
      id,
      title,
      amount: round1(mln(amount)),
      share: share(amount),
      confidence: (lines.some((line) => line.confidence === "needs-review") ? "needs-review" : "confirmed") as Confidence,
      lines: lines.map((line) => ({ ...line, amount: round1(mln(line.amount)), share: share(line.amount) })),
    };
  };

  // ─ Сценарии
  const asIsTco = model.baselineTco;
  const maxTco = Math.max(asIsTco, purchase.tco, raas.tco, 1);
  const recommendedId =
    !priceKnown || labor.savings === 0
      ? null
      : Math.min(purchase.tco, raas.tco) < asIsTco
        ? purchase.tco <= raas.tco ? "purchase" : "raas"
        : null;
  const delta = (tco: number) => {
    const diff = mln(tco - asIsTco);
    return `${diff < 0 ? "−" : "+"}${fmt(Math.abs(diff))}`;
  };
  const scenarios = [
    {
      id: "as-is",
      title: "Как есть",
      subtitle: "Без автоматизации",
      tco: round1(mln(asIsTco)),
      share: round1((asIsTco / maxTco) * 100) / 100,
      delta: "база",
      detail: `${fmt(mln(asIsTco))} млн ₽: ФОТ отборщиков и операторов погрузчиков за ${horizon} ${yearsUnit(horizon)}`,
    },
    {
      id: "purchase",
      title: "Покупка",
      subtitle: "CAPEX + сервис",
      tco: round1(mln(purchase.tco)),
      share: round1((purchase.tco / maxTco) * 100) / 100,
      delta: delta(purchase.tco),
      ...(recommendedId === "purchase" ? { recommended: true } : {}),
    },
    {
      id: "raas",
      title: "RaaS",
      subtitle: "Аренда, без покупки",
      tco: round1(mln(raas.tco)),
      share: round1((raas.tco / maxTco) * 100) / 100,
      delta: delta(raas.tco),
      ...(recommendedId === "raas" ? { recommended: true } : {}),
    },
  ];

  // ─ Чувствительность (buildSensitivityScenario): ±20% к цене, зарплатам и объёму операций
  const sensitivity: CalculationOutput["sensitivity"] = [];
  const basePayback = purchase.paybackYears;
  if (basePayback !== null) {
    const shift = (k: { cost?: number; labor?: number; demand?: number }) => {
      const p: WarehouseParams = {
        ...params,
        pickerWageMonth: params.pickerWageMonth * (k.labor ?? 1),
        forkliftWageMonth: params.forkliftWageMonth * (k.labor ?? 1),
        loadPerHour: params.loadPerHour * (k.demand ?? 1),
        outboundPerHour: params.outboundPerHour * (k.demand ?? 1),
        sortPerHour: params.sortPerHour * (k.demand ?? 1),
        activeAreaM2: params.activeAreaM2 * (k.demand ?? 1),
      };
      return runWarehouseModel(plan, p, k.cost ?? 1).purchase.paybackYears;
    };
    const variants = [
      { id: "equipment", label: "Цена оборудования", direction: "up" as const, run: (f: number) => shift({ cost: f }) },
      { id: "wage", label: "Зарплата замещаемого персонала", direction: "down" as const, run: (f: number) => shift({ labor: f }) },
      { id: "demand", label: "Объём операций (число роботов)", direction: "up" as const, run: (f: number) => shift({ demand: f }) },
    ];
    for (const variant of variants) {
      const optimistic = variant.run(variant.direction === "down" ? 1.2 : 0.8);
      const cautious = variant.run(variant.direction === "down" ? 0.8 : 1.2);
      const spread = (cautious ?? basePayback * 2) - (optimistic ?? basePayback);
      sensitivity.push({
        id: variant.id,
        label: `${variant.label}, ±20%`,
        impact: round1((Math.abs(spread) / 2 / basePayback) * 100) / 100,
        direction: variant.direction,
        low: yearsText(optimistic),
        high: yearsText(cautious),
      });
    }
    sensitivity.sort((a, b) => b.impact - a.impact);
  }

  const warning = gaps.length
    ? `Не хватает данных: ${[...new Set(gaps)].join("; ")}. Там, где данных нет, приняты допущения — результат предварительный.`
    : "Цены и производительность — из каталога; обслуживание, внедрение и тариф RaaS — отраслевые оценки. Уточните у поставщика перед защитой бюджета.";

  const effect = purchase.effect;
  const fleet: FleetOutput[] = groups.map((g) => ({
    kind: g.kind,
    slot: g.slot,
    share: Math.round(g.share * 1000) / 1000,
    ...(g.routeM !== undefined ? { routeM: g.routeM } : {}),
    ...(g.lineLengthM !== undefined ? { lineLengthM: g.lineLengthM } : {}),
    label: FLEET_LABEL[g.kind],
    ...(g.robot.model ? { model: g.robot.model } : {}),
    solutionId: g.robot.solution.id,
    name: g.robot.solution.name,
    count: g.count,
    throughputPerRobot: round1(g.throughputPerRobot),
    unit: DEMAND_UNIT[g.kind],
    peakDemand: round1(g.peakDemand),
    ...(g.robot.speed !== null ? { speedMps: g.robot.speed } : {}),
    ...(g.robot.capacityKg !== null ? { capacityKg: g.robot.capacityKg } : {}),
    ...(g.robot.autonomyHours !== null ? { autonomyHours: g.robot.autonomyHours } : {}),
    ...(g.robot.chargeHours !== null ? { chargeHours: g.robot.chargeHours } : {}),
    workPowerKw: g.robot.workPowerKw,
    idlePowerKw: g.robot.idlePowerKw,
    substitutions: g.robot.substitutions,
    ...(g.robot.model === "storagecube" && cubeTowers ? { storageTowers: cubeTowers } : {}),
    footprint: g.robot.footprint,
  }));

  return {
    objectTitle: `${OBJECT_LABEL.warehouse} · ${Math.round(params.floorAreaM2).toLocaleString("ru-RU").replace(/ /g, " ")} м²`,
    meta: `${groups.map((g) => `${g.count} × ${g.robot.solution.name}`).join(" + ") || input.solution.name} · ${params.shifts} ${params.shifts === 1 ? "смена" : "смены"} · горизонт ${horizon} ${yearsUnit(horizon)}`,
    payback: paybackKpi(model, priceKnown),
    capex: { label: "CAPEX", value: fmt(mln(purchase.capex)), note: "млн ₽, разово", trend: "none" },
    roi: {
      label: `ROI, ${horizon} ${yearsUnit(horizon)}`,
      value: purchase.roiPct === null || labor.savings === 0 ? "—" : `${Math.round(purchase.roiPct)}%`,
      note: `Годовой эффект ${fmt(mln(effect))} млн ₽`,
      trend: purchase.roiPct !== null && purchase.roiPct > 0 ? "up" : "down",
    },
    opexSaving: {
      series: Array.from({ length: horizon }, () => round1(mln(effect))),
      percent: labor.baseline > 0 ? `${effect >= 0 ? "+" : "−"}${fmt(Math.abs((effect / labor.baseline) * 100))}%` : "—",
      meta: `${fmt(mln(effect))} млн ₽ в год: экономия ФОТ ${fmt(mln(labor.savings))} − OPEX парка ${fmt(mln(purchase.opexPerYear))}`,
    },
    warning,
    assumptions,
    scenarios,
    costGroups: [
      group("capex", "CAPEX — покупка, замена и остаточная стоимость", capexLines),
      group("opex", `OPEX и оставшийся ФОТ за ${horizon} ${yearsUnit(horizon)}`, opexLines),
    ],
    totalTco: round1(mln(totalTco)),
    sensitivity,
    solutionId: input.solution.id,
    robots: { count: Math.max(1, count), basis },
    fleet,
    scenario: {
      links: model.links.map((l) => ({
        slot: l.slot,
        label: SLOT_LABEL[l.slot],
        flowPerHour: round1(l.flow),
        routeM: l.routeM,
        effectiveRouteM: l.effectiveRouteM,
        ...(l.conveyor ? { conveyorSolutionId: l.conveyor.robot.solution.id } : {}),
        manualShare: Math.round(l.manualShare * 1000) / 1000,
      })),
    },
  };
}
