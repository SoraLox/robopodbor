/**
 * Роботы склада в терминах модели Егора (bam-low/lct, domain/warehouseAdapter.js):
 * к какому флоту относится решение каталога, какой 3D-моделью оно показывается
 * в сцене и какие паспортные числа у него есть. Чего в карточке нет, берётся у
 * демо-робота того же вида из демо-каталога Егора — с пометкой в substitutions,
 * чтобы экономика и сцена считали по одним и тем же числам.
 */
import { isTeamEstimate, type CatalogSolution } from "./catalog.js";

/**
 * Флот сцены и группа расчёта: уборка, отбор роборуками, перемещение паллет,
 * статическая сортировка (кросс-белт, тилт-трей) и конвейерные линии.
 */
export type FleetKind = "vacuum" | "arm" | "loader" | "sorter" | "conveyor";

export const FLEET_KINDS: FleetKind[] = ["vacuum", "arm", "loader", "sorter", "conveyor"];

export const FLEET_LABEL: Record<FleetKind, string> = {
  vacuum: "Уборка",
  arm: "Отбор и сортировка",
  loader: "Перемещение и хранение паллет",
  sorter: "Сортировочная система",
  conveyor: "Конвейерные линии",
};

/** Процессы мастера, которые закрывает флот. */
export const FLEET_PROCESSES: Record<FleetKind, string[]> = {
  vacuum: ["cleaning"],
  arm: ["picking", "sorting"],
  loader: ["transport", "receiving", "storage"],
  sorter: ["sorting"],
  conveyor: ["transport", "receiving"],
};

const KIND_BY_SOLUTION_TYPE: Record<string, FleetKind> = {
  cleaner: "vacuum",
  disinfection: "vacuum",
  manipulator: "arm",
  cell: "arm",
  sorter: "sorter",
  conveyor: "conveyor",
  asrs: "loader",
  amr: "loader",
  fmr: "loader",
  stacker: "loader",
  tug: "loader",
  platform: "loader",
};

const KIND_KEYWORDS: ReadonlyArray<readonly [FleetKind, RegExp]> = [
  ["vacuum", /уборк|клининг|мойк|дезинфекц/i],
  ["conveyor", /конвейер|транспортёр|рольганг/i],
  ["sorter", /сортер|сортировочн\S* (систем|лини)|кросс-?бел|тилт-?трей|cross-?belt|tilt-?tray/i],
  ["arm", /манипулятор|сортир|сортер|пикинг/i],
  ["loader", /паллет|штабел|погрузчик|agv|буксир|тележ|транспорт/i],
];

export function fleetKindOf(solution: Pick<CatalogSolution, "solutionType" | "name" | "useCase">): FleetKind | null {
  // Тип решения известен — флот для него либо есть, либо нет (ПО, дроны, охрана).
  // Ключевые слова — только для решений без типа, например добавленных вручную.
  if (solution.solutionType) return KIND_BY_SOLUTION_TYPE[solution.solutionType] ?? null;
  const text = `${solution.name} ${solution.useCase}`;
  return KIND_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/**
 * 3D-модель сцены (ключ фабрик в useSimulation.js). undefined — модель флота
 * по умолчанию: пылесос, процедурная роборука, погрузчик.
 */
export function fleetModelOf(
  solution: Pick<CatalogSolution, "solutionType" | "name" | "useCase">,
  kind: FleetKind,
): string | undefined {
  const text = `${solution.name} ${solution.useCase}`;
  if (kind === "vacuum") return /поломо|мою|мойщ|влажн/i.test(text) ? "washer" : undefined;
  if (kind === "arm") return /укладк|паллетиз|палетиз/i.test(text) ? "stacker" : undefined;
  if (solution.solutionType === "asrs") return "storagecube";
  if (solution.solutionType === "amr" || solution.solutionType === "tug") return "transporter";
  return undefined;
}

/** Паспорт демо-робота Егора (domain/catalog.js): технические числа, которыми закрываются пробелы карточки. */
interface DemoRobot {
  name: string;
  throughput: number;
  throughputUnit: string;
  speed: number | null;
  capacityKg: number | null;
  autonomyHours: number | null;
  chargeHours: number | null;
  workPowerKw: number;
  idlePowerKw: number;
}

const DEMO: Record<string, DemoRobot> = {
  vacuum: { name: "CleanBot Lite 500", throughput: 1800, throughputUnit: "м²/ч", speed: 1.1, capacityKg: null, autonomyHours: 4, chargeHours: 1.5, workPowerKw: 0.4, idlePowerKw: 0.02 },
  washer: { name: "АкваБот AB-200", throughput: 2200, throughputUnit: "м²/ч", speed: 1.2, capacityKg: null, autonomyHours: 3.5, chargeHours: 2, workPowerKw: 0.6, idlePowerKw: 0.03 },
  arm: { name: "ArmTech Sorter S1", throughput: 900, throughputUnit: "оп/ч", speed: null, capacityKg: null, autonomyHours: null, chargeHours: null, workPowerKw: 3, idlePowerKw: 0.3 },
  stacker: { name: "Битроботикс УК-450", throughput: 3000, throughputUnit: "оп/ч", speed: null, capacityKg: null, autonomyHours: null, chargeHours: null, workPowerKw: 4.2, idlePowerKw: 0.4 },
  loader: { name: "ForkBot L100", throughput: 90, throughputUnit: "ед./ч", speed: 2, capacityKg: 100, autonomyHours: 8, chargeHours: 2, workPowerKw: 0.9, idlePowerKw: 0.05 },
  transporter: { name: "LowCart T1", throughput: 75, throughputUnit: "ед./ч", speed: 1.8, capacityKg: 150, autonomyHours: 9, chargeHours: 1.5, workPowerKw: 0.5, idlePowerKw: 0.03 },
  storagecube: { name: "СтойкаБокс SB-400", throughput: 90, throughputUnit: "ед./ч", speed: null, capacityKg: null, autonomyHours: null, chargeHours: null, workPowerKw: 1.4, idlePowerKw: 0.15 },
};

/** Демо-робота Егора нет (сортер, конвейер): пробелы карточки не закрываются ничем. */
const NO_DEMO = {
  name: "",
  throughput: null,
  throughputUnit: "",
  speed: null,
  capacityKg: null,
  autonomyHours: null,
  chargeHours: null,
  workPowerKw: null,
  idlePowerKw: null,
} as const;

export function demoRobotOf(kind: FleetKind, model: string | undefined) {
  return (model ? DEMO[model] : undefined) ?? DEMO[kind] ?? NO_DEMO;
}

/** «1 500 кг» → 1500, «1.8 м/с» → 1.8, «—» → null. */
export function leadingNumber(text: string | undefined): number | null {
  const match = text?.replace(/\s/g, "").replace(",", ".").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** «Сортировка заказов, 8 000 посылок/ч» → 8000. */
function hourlyRateFrom(useCase: string): number | null {
  const match = useCase.match(/(\d[\d\s]*)\s*[^\d,/]*\/ч/);
  return match?.[1] ? leadingNumber(match[1]) : null;
}

const UNIT_OF_KIND: Record<FleetKind, RegExp> = {
  vacuum: /м²|м2/i,
  arm: /строк|операц|оп\/|заказ|шт|посыл|цикл/i,
  loader: /паллет|поддон|ед|операц|цикл|рейс/i,
  sorter: /шт|посыл|отправл|ед|предмет|item|pcs/i,
  conveyor: /паллет|поддон|короб|тар|ед|шт/i,
};

export interface Substitution {
  field: string;
  value: string;
}

/** Паспорт робота для расчёта и сцены: из карточки, пробелы — от демо-робота. */
export interface FleetRobot {
  kind: FleetKind;
  model: string | undefined;
  solution: CatalogSolution;
  /** Паспортная производительность; null — считать по циклу (погрузчики со скоростью). */
  nominalThroughput: number | null;
  throughputUnit: string;
  speed: number | null;
  capacityKg: number | null;
  autonomyHours: number | null;
  chargeHours: number | null;
  workPowerKw: number;
  idlePowerKw: number;
  /** Мобильный робот со скоростью — его цикл зависит от маршрута. */
  mobile: boolean;
  substitutions: Substitution[];
}

export function fleetRobotOf(solution: CatalogSolution, kind: FleetKind): FleetRobot {
  const model = fleetModelOf(solution, kind);
  const demo = demoRobotOf(kind, model);
  const substitutions: Substitution[] = [];
  const take = <T,>(own: T | null | undefined, fallback: T | null, field: string, shown: string): T | null => {
    if (own !== null && own !== undefined) return own;
    // У демо-робота этой величины тоже нет (стационарная система не ездит) — подставлять нечего.
    if (fallback !== null && fallback !== undefined) substitutions.push({ field, value: shown });
    return fallback;
  };

  const ownSpeed = leadingNumber(solution.speed);
  const stationary = kind === "arm" || kind === "sorter" || kind === "conveyor" || model === "storagecube";
  const speed = stationary ? ownSpeed : take(ownSpeed, demo.speed, "скорость", `${demo.speed} м/с`);
  const capacityKg =
    kind === "loader" && !stationary
      ? take(solution.payloadKg || null, demo.capacityKg, "грузоподъёмность", `${demo.capacityKg} кг`)
      : solution.payloadKg ?? null;

  // Оценка команды — не паспортная производительность: парк считаем по циклу или демо-роботу.
  const cardRate =
    solution.throughput && !isTeamEstimate(solution, "throughput") && UNIT_OF_KIND[kind].test(solution.throughputUnit ?? "")
      ? solution.throughput
      : null;
  const ownRate = cardRate ?? (kind === "arm" ? hourlyRateFrom(solution.useCase) : null);
  // Погрузчик со скоростью считается по циклу маршрута (как у Егора), паспортная
  // производительность — только верхняя граница; без скорости — от демо-робота.
  const byCycle = kind === "loader" && speed !== null && !stationary;
  const nominalThroughput = ownRate ?? (byCycle ? null : take(null, demo.throughput, "производительность", `${demo.throughput} ${demo.throughputUnit}`));
  const throughputUnit = ownRate ? solution.throughputUnit ?? demo.throughputUnit : demo.throughputUnit;

  const autonomyHours = stationary ? solution.autonomyHours ?? null : take(solution.autonomyHours, demo.autonomyHours, "время работы", `${demo.autonomyHours} ч`);
  const chargeHours = stationary ? solution.chargeHours ?? null : take(solution.chargeHours, demo.chargeHours, "время зарядки", `${demo.chargeHours} ч`);
  const ownPower =
    solution.powerKw ??
    (solution.batteryKwh && solution.autonomyHours ? solution.batteryKwh / solution.autonomyHours : null);
  const workPowerKw = take(ownPower, demo.workPowerKw, "мощность", `${demo.workPowerKw} кВт`) ?? 0;
  // Простой — та же доля от рабочей мощности, что у демо-робота; без демо — 10%.
  const idleShare = demo.workPowerKw && demo.idlePowerKw !== null ? demo.idlePowerKw / demo.workPowerKw : 0.1;
  const idlePowerKw = idleShare * workPowerKw;

  return {
    kind,
    model,
    solution,
    nominalThroughput,
    throughputUnit,
    speed,
    capacityKg,
    autonomyHours,
    chargeHours,
    workPowerKw,
    idlePowerKw,
    mobile: !stationary && speed !== null,
    substitutions,
  };
}
