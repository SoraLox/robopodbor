/**
 * Каталог роботов (robots-catalog, структура v2) → каталог решений приложения.
 * Модуль без зависимостей и без файловой системы: файлы каталога приходят
 * объектами. Его используют скрипт build-catalog.ts, загрузка новой версии
 * каталога в админке и MSW-моки фронтенда.
 *
 * Ничего не придумываем: поле, которого нет в каталоге, остаётся пустым.
 * Сами выводим только применимость к объекту по сценариям (objectFit = "inferred"),
 * это видно в карточке и в отчёте.
 */
import type {
  AcquisitionModel,
  CatalogSolution,
  FieldProvenance,
  FieldSource,
  ObjectFit,
  SourceKind,
} from "./catalog.js";

type Flags = Record<string, boolean | null>;
type Range = { min: number | null; max: number | null } | null;

/** Карточка каталога: общие блоки + блок категории. Типизируем только то, что читаем. */
export type CatalogCard = {
  id: string;
  name: string;
  vid: string;
  origin: string | null;
  status: "OP" | "PI" | "RD";
  trl: number | null;
  photos?: string[];
  scen: Flags;
  site: Flags;
  dims?: { l_mm: number | null; w_mm: number | null; h_mm: number | null; mass_kg: number | null };
  move?: { spd_max_mps: number | null; spd_mps: Range; pass_min_mm: number | null };
  load?: { payload_kg: number | null };
  power?: {
    run_min: Range;
    chg: Flags;
    chg_min?: number | null;
    energy_kwh?: number | null;
    cap_ah?: number | null;
    volt_v?: number | null;
    cons_kw?: number | null;
    motor_w?: number | null;
  };
  nav?: { method: Flags; pos_acc_mm: number | null };
  conn?: Flags;
  soft?: { integ: Flags };
  env?: { io: Flags; t_op_c: Range; noise_db: number | null; ip_s: number | null; ip_w: number | null; hum_max_pct: number | null };
  econ?: { price_rub: Range; acq: Flags; life_yr: number | null; warranty_mo: number | null };
  [block: string]: unknown;
};

type IndexItem = { id: string; cat: string; site: string[]; scen: string[] };
type Fact = { rid: string; path: string; val: unknown; sid: string; ok: boolean; used: boolean; note: string | null };
type Doc = { sid: string; type: string; title: string; ref: string | null; pub: string | null; acc: string | null };

/** Файлы каталога, как их кладёт ответственный за каталог (см. robots-catalog/README.md). */
export interface CatalogFiles {
  index: { schema_ver?: string; updated: string; items: IndexItem[] };
  categories: { items: Array<{ code: string; ru: string; file: string }> };
  vendors: { items: Array<{ vid: string; name: string; country: string | null; site: string | null }> };
  codes: { groups: Record<string, Array<{ code: string; ru: string }>> };
  sources: { docs: Doc[]; facts: Fact[] };
  /** Файлы категорий по пути из categories.json: «data/am_mobile_robot.json». */
  data: Record<string, { items: CatalogCard[] }>;
}

/** Дополнения из материалов организатора (catalogSupplements.json). */
export interface CatalogSupplements {
  source: { title: string; date: string };
  examples: Array<{ id: string; objectType: string; process: string }>;
  fields: Record<string, Partial<CatalogSolution>>;
  robots: CatalogSolution[];
  /**
   * Решения, которых нет ни в каталоге ФЦ БАС, ни у организатора (сортеры, конвейеры):
   * найдены командой в открытых источниках. У каждого поля — свой источник в
   * fieldSources; оценки по отрасли помечены confirmed: false и kind: "team".
   */
  researched?: CatalogSolution[];
}

/**
 * Характеристики из открытых источников (catalogResearch.json): каждое значение со
 * своей ссылкой; принято, только если сверено со страницей-источником.
 */
export interface CatalogResearch {
  values: Array<{
    id: string;
    field: string;
    value: unknown;
    source: FieldSource;
    confirmed: boolean;
    note?: string;
  }>;
}

export interface CatalogBuild {
  solutions: CatalogSolution[];
  version: { schema: string; updated: string };
  /** Сколько решений каждого основания по типу объекта. */
  fit: Record<string, Record<ObjectFit, number>>;
  /** Какие пустые поля каталога заполнили дополнения организатора. */
  filled: string[];
  /** Расхождения каталога с организатором и открытыми источниками: не перезаписаны. */
  conflicts: string[];
  /** Какие пустые поля заполнили открытые источники. */
  researched: string[];
}

export const CATALOG_SCHEMA_MAJOR = "2";

// ─── Применимость к типам объектов ─────────────────────────────────────────
// declared: объект есть в site. inferred: сценарий из списка, категория из списка,
// и у робота либо не указаны объекты, либо указан объект того же рода (помещения, склады).
export const FIT_RULES: Record<string, { site: string; scen: string[]; categories: string[] }> = {
  warehouse: { site: "WH", scen: ["WL", "SO", "OP", "IV", "MH"], categories: ["AM", "FL", "AS", "IN", "MM", "SW", "CA", "RC", "FC"] },
  airport: { site: "AP", scen: ["CI", "MH", "CS", "PT"], categories: ["FC", "SC", "AM", "UG", "AV"] },
  clinic: { site: "MD", scen: ["CI", "BM", "CD", "LA"], categories: ["FC", "DL", "RC", "AM", "HU"] },
};
const NEAR_SITES = new Set(["WH", "PR", "TH", "RT", "OF", "LB", "HO", "MD", "AP"]);

/**
 * Точечные решения по роботам поверх правил (разбор 28.09.2026): в каталоге объект
 * не указан, а правило по сценариям робота не цепляет. null — не подходит объекту;
 * process — процесс объекта, если сценарий каталога его не даёт.
 */
type FitOverride = { fit: ObjectFit; process?: string } | null;
const inferred = (process?: string): FitOverride => ({ fit: "inferred", ...(process ? { process } : {}) });
const FIT_OVERRIDES: Record<string, Partial<Record<string, FitOverride>>> = {
  // AMR цеховой логистики — тот же класс, что складские тележки («Дополнения» п. 8.2: склады и цеха).
  AM0015: { warehouse: inferred() },
  AM0016: { warehouse: inferred() },
  AM0017: { warehouse: inferred() },
  AM0018: { warehouse: inferred() },
  AM0019: { warehouse: inferred() },
  // Небольшие AMR — доставка внутри клиники; тягач — тележки с бельём и питанием.
  AM0002: { clinic: inferred("delivery") },
  AM0007: { clinic: inferred("delivery") },
  AM0013: { clinic: inferred("linen") },
  // Манипуляторы со сценарием «сортировка грузов» — сортировка и паллетирование на складе.
  IM0001: { warehouse: inferred() },
  IM0002: { warehouse: inferred() },
  // Охранный робот мониторинга — периметр склада и аэропорта.
  SC0001: { warehouse: inferred(), airport: inferred() },
  // Уличные уборщики — территория, перрон, парковки аэропорта; БРО 2.1 — ещё и промтерритория склада.
  SS0001: { warehouse: inferred(), airport: inferred() },
  SS0002: { airport: inferred() },
  SS0003: { airport: inferred() },
  SS0004: { airport: inferred() }, // «Саранча» — косилка: лётное поле
  SS0005: { airport: inferred() },
  SS0006: { airport: inferred() },
  // БАС мониторинга: инспекция инфраструктуры аэропорта (описание объекта у организатора) и охрана периметра склада.
  UA0021: { warehouse: inferred(), airport: inferred() },
  UA0041: { warehouse: inferred(), airport: inferred() },
  UA0042: { warehouse: inferred(), airport: inferred() },
  UA0043: { warehouse: inferred(), airport: inferred() },
  UA0005: { airport: inferred("inspection") }, // мониторинг дорожного покрытия — ВПП и рулёжки
  // БАС доставки биоматериалов — между корпусами клиники.
  UA0030: { clinic: inferred() },
  UA0031: { clinic: inferred() },
  // Решение пользователя 28.09.2026 по спорным случаям.
  HU0002: { airport: inferred("passengers") }, // Promobot — консультант в терминале
  FB0001: { airport: inferred("passengers") }, // робо-кафе в терминале
  AV0005: { airport: inferred("passengers") }, // беспилотный автобус между терминалами
  ER0001: { airport: inferred("fire") }, // лафетный ствол — перрон и ангары
  DL0001: { clinic: inferred("delivery") }, // курьер между корпусами больничного городка
};

/** Складские AMR и погрузчики подходят и грузовому терминалу аэропорта — так их приводит организатор. */
const AIRPORT_CARGO_CATEGORIES = new Set(["AM", "FL"]);

function fitOf(item: IndexItem) {
  const fit = objectFit(item);
  const processes = new Map<string, string>();
  if (fit.warehouse && !fit.airport && AIRPORT_CARGO_CATEGORIES.has(item.cat)) {
    fit.airport = "inferred";
    processes.set("airport", "cargo");
  }
  for (const [objectType, value] of Object.entries(FIT_OVERRIDES[item.id] ?? {})) {
    if (value === null) delete fit[objectType];
    else if (value) {
      if (fit[objectType] !== "declared") fit[objectType] = value.fit;
      if (value.process) processes.set(objectType, value.process);
    }
  }
  return { fit, processes };
}

function objectFit(item: IndexItem) {
  const fit: Record<string, ObjectFit> = {};
  for (const [objectType, rule] of Object.entries(FIT_RULES)) {
    if (item.site.includes(rule.site)) fit[objectType] = "declared";
    else if (
      rule.categories.includes(item.cat) &&
      item.scen.some((s) => rule.scen.includes(s)) &&
      (item.site.length === 0 || item.site.some((s) => NEAR_SITES.has(s)))
    )
      fit[objectType] = "inferred";
  }
  return fit;
}

// ─── Процессы объекта (уровень «процесс» иерархии, OBJECT_PROCESSES) ─────────
const PROCESS_BY_SCEN: Record<string, Record<string, string>> = {
  warehouse: {
    WL: "transport", PL: "transport", MH: "transport", SO: "sorting", OP: "picking", IV: "inventory",
    CI: "cleaning", CO: "cleaning", PT: "security", MO: "security",
  },
  airport: { CI: "cleaning", CO: "cleaning", PT: "inspection", MO: "inspection", CS: "ramp", MH: "ramp", SO: "baggage" },
  clinic: { CI: "cleaning", CD: "delivery", BM: "delivery", LA: "laboratory", MA: "care" },
};
const PROCESS_BY_CATEGORY: Record<string, Record<string, string>> = {
  warehouse: { AS: "storage", FL: "receiving", IN: "inventory", FC: "cleaning", SS: "cleaning", SC: "security" },
  airport: { FC: "cleaning", SS: "cleaning", SC: "inspection" },
  clinic: { FC: "cleaning", DL: "delivery" },
};

// ─── Тип решения приложения по категории каталога ───────────────────────────
const TYPE_BY_CATEGORY: Record<string, string> = {
  AM: "amr",
  FL: "fmr",
  AS: "asrs",
  FC: "cleaner",
  SS: "cleaner",
  DL: "courier",
  IN: "inventory",
  SC: "security",
  UG: "platform",
  AV: "vehicle",
  IM: "manipulator",
  CB: "manipulator",
  MM: "manipulator",
  RC: "cell",
  CA: "crane",
  SW: "software",
  UA: "uav",
  HU: "service",
};

const ACQ: Record<string, AcquisitionModel> = { pu: "purchase", ls: "leasing", rt: "raas", sb: "raas", sv: "raas" };
const MATURITY = { OP: "operation", PI: "piloting", RD: "rnd" } as const;
const KIND_BY_TYPE: Record<string, SourceKind> = { OR: "organizer", VN: "vendor", RS: "reseller", MD: "media", GV: "registry" };

/** Поле карточки приложения → пути каталога, из которых оно собрано. */
const PATHS_BY_FIELD: Record<string, string[]> = {
  vendor: ["vid"],
  useCase: ["scen"],
  country: ["origin"],
  payloadKg: ["load.payload_kg"],
  weightKg: ["dims.mass_kg"],
  dimensions: ["dims.l_mm", "dims.w_mm", "dims.h_mm"],
  speed: ["move.spd_max_mps", "move.spd_mps"],
  throughput: ["amr.thr_ph", "fork.thr_pal_ph", "stor.thr_ph", "clean.prod_m2h", "task.prod_m2h", "cell.thr_ph", "inv.rate_loc_ph"],
  autonomyHours: ["power.run_min"],
  chargeHours: ["power.chg_min"],
  batteryKwh: ["power.energy_kwh", "power.cap_ah", "power.volt_v"],
  powerKw: ["power.cons_kw", "power.motor_w"],
  positioningAccuracyMm: ["nav.pos_acc_mm"],
  navigation: ["nav.method"],
  operatingConditions: ["env.t_op_c", "env.hum_max_pct", "env.ip_s", "env.ip_w", "env.io"],
  noiseDb: ["env.noise_db"],
  minAisleWidthM: ["move.pass_min_mm"],
  elevatorIntegration: ["soft.integ.el"],
  "infrastructure.charging": ["power.chg"],
  "infrastructure.connectivity": ["conn"],
  "infrastructure.integration": ["soft.integ"],
  price: ["econ.price_rub"],
  "costs.equipment": ["econ.price_rub"],
  acquisitionModels: ["econ.acq"],
  lifespanYears: ["econ.life_yr"],
};

// Описательный текст дополняет каталог, а не спорит с ним: «в помещении» + «ровный бетонный пол».
const TEXT_MERGE_FIELDS = new Set(["operatingConditions"]);

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const num = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const top = (range: Range | undefined) => num(range?.max) ?? num(range?.min);
const fmtNum = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const on = (flags: Flags | undefined) => Object.keys(flags ?? {}).filter((k) => flags![k] === true);
const toRuDate = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join(".") : undefined);

function isFilledValue(value: unknown) {
  return value !== undefined && value !== null && value !== "—" && !(Array.isArray(value) && value.length === 0);
}

export function fieldValue(solution: CatalogSolution, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], solution);
}

/** Пустые поля не попадают в карточку: первый проход убирает undefined, второй — опустевшие объекты. */
function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0 ? undefined : v,
  );
}

/** Главная версия схемы каталога должна совпадать: иначе поля читаются неверно. */
export function checkCatalogFiles(files: Partial<CatalogFiles>): string[] {
  const problems: string[] = [];
  for (const name of ["index", "categories", "vendors", "codes", "sources"] as const) {
    if (!files[name]) problems.push(`Нет файла ${name}.json`);
  }
  const schema = files.index?.schema_ver ?? "";
  if (files.index && schema.split(".")[0] !== CATALOG_SCHEMA_MAJOR) {
    problems.push(`Структура каталога ${schema || "без версии"} — ожидается ${CATALOG_SCHEMA_MAJOR}.x`);
  }
  for (const category of files.categories?.items ?? []) {
    if (!files.data?.[category.file]) problems.push(`Нет файла категории ${category.file} (${category.ru})`);
  }
  return problems;
}

export function buildCatalog(
  files: CatalogFiles,
  supplements: CatalogSupplements,
  photosOf: (id: string) => string[] = () => [],
  research: CatalogResearch = { values: [] },
): CatalogBuild {
  const problems = checkCatalogFiles(files);
  if (problems.length) throw new Error(problems.join("; "));

  const vendors = new Map(files.vendors.items.map((v) => [v.vid, v]));
  const ru = (group: string, code: string) =>
    files.codes.groups[group]?.find((c) => c.code.toLowerCase() === code.toLowerCase())?.ru ?? code;
  const list = (group: string, flags: Flags | undefined) => on(flags).map((code) => ru(group, code));

  // ─── Происхождение характеристик (sources.json) ───────────────────────────
  const docs = new Map(
    files.sources.docs.map((doc): [string, FieldSource] => [
      doc.sid,
      {
        kind: KIND_BY_TYPE[doc.type] ?? "media",
        title: doc.title,
        url: doc.ref && /^https?:\/\//.test(doc.ref) ? doc.ref : undefined,
        date: toRuDate(doc.pub ?? doc.acc),
      },
    ]),
  );
  const factsByRobot = new Map<string, Fact[]>();
  for (const fact of files.sources.facts) {
    // Не попавшие в таблицу альтернативы и «нет» во флагах — не основание для значения.
    if (!fact.used || fact.val === false || fact.val === null) continue;
    factsByRobot.set(fact.rid, [...(factsByRobot.get(fact.rid) ?? []), fact]);
  }

  /**
   * Для каждого заполненного поля: все источники его значений и точность. Поле
   * «точное», если у каждой его составляющей (длина, ширина, высота…) есть
   * значение, которое источник даёт точно.
   */
  function provenanceOf(solution: CatalogSolution): Record<string, FieldProvenance> {
    const facts = factsByRobot.get(solution.id) ?? [];
    const result: Record<string, FieldProvenance> = {};
    for (const [key, prefixes] of Object.entries(PATHS_BY_FIELD)) {
      if (!isFilledValue(fieldValue(solution, key))) continue;
      const matched = facts.filter((fact) => prefixes.some((prefix) => fact.path === prefix || fact.path.startsWith(`${prefix}.`)));
      if (!matched.length) continue;
      const byPath = new Map<string, Fact[]>();
      for (const fact of matched) byPath.set(fact.path, [...(byPath.get(fact.path) ?? []), fact]);
      const confirmed = [...byPath.values()].every((pathFacts) => pathFacts.some((fact) => fact.ok));
      const sources = [...new Set(matched.map((fact) => fact.sid))].flatMap((sid) => docs.get(sid) ?? []);
      const notes = [...new Set(matched.filter((fact) => !fact.ok && fact.note).map((fact) => fact.note!))];
      result[key] = { confirmed, sources, ...(notes.length ? { note: notes.join("; ") } : {}) };
    }
    return result;
  }

  /** Производительность из блока категории: берём верхнюю границу диапазона. */
  function throughputOf(card: CatalogCard): { throughput?: number; throughputUnit?: string } {
    const block = (name: string) => card[name] as Record<string, unknown> | undefined;
    const candidates: Array<[unknown, string]> = [
      [block("amr")?.thr_ph, "операций/ч"],
      [block("fork")?.thr_pal_ph, "паллет/ч"],
      [block("stor")?.thr_ph, "циклов/ч"],
      [block("clean")?.prod_m2h, "м²/ч"],
      [block("task")?.prod_m2h, "м²/ч"],
      [block("cell")?.thr_ph, "шт/ч"],
      [block("inv")?.rate_loc_ph, "ячеек/ч"],
    ];
    for (const [raw, unit] of candidates) {
      const value = typeof raw === "number" ? raw : top(raw as Range);
      if (value !== undefined) return { throughput: value, throughputUnit: unit };
    }
    return {};
  }

  function conditionsOf(card: CatalogCard): string | undefined {
    const env = card.env;
    if (!env) return undefined;
    const parts: string[] = [];
    const t = env.t_op_c;
    const min = num(t?.min);
    const max = num(t?.max);
    const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
    if (min !== undefined && max !== undefined) parts.push(`${sign(min)}…${sign(max)} °C`);
    else if (min !== undefined) parts.push(`от ${sign(min)} °C`);
    else if (max !== undefined) parts.push(`до ${sign(max)} °C`);
    if (num(env.hum_max_pct) !== undefined) parts.push(`влажность до ${env.hum_max_pct}%`);
    if (num(env.ip_s) !== undefined && num(env.ip_w) !== undefined) parts.push(`IP${env.ip_s}${env.ip_w}`);
    const io = list("io", env.io);
    if (io.length) parts.push(io.join(" и "));
    return parts.length ? parts.join(", ") : undefined;
  }

  const sourceDate = toRuDate(files.index.updated);

  function toSolution(card: CatalogCard, item: IndexItem, categoryRu: string): CatalogSolution {
    const vendor = vendors.get(card.vid);
    const unconfirmed: string[] = [];
    const limitations: string[] = [];

    let country = card.origin ? ru("country", card.origin) : undefined;
    let countryFromVendor = false;
    if (!country && vendor?.country) {
      country = ru("country", vendor.country);
      unconfirmed.push("Страна происхождения — по стране производителя");
      countryFromVendor = true;
    }

    const price = card.econ?.price_rub;
    const priceMin = num(price?.min) ?? num(price?.max);
    const priceMax = num(price?.max) ?? priceMin;
    if (priceMin !== undefined && priceMax !== undefined && priceMin !== priceMax) {
      limitations.push(`Цена зависит от отрасли: ${fmtNum(priceMin / 1e6)}–${fmtNum(priceMax / 1e6)} млн ₽`);
    }
    const priceM = priceMin !== undefined ? round(priceMin / 1e6) : undefined;

    const dims = card.dims;
    const dimensions =
      num(dims?.l_mm) && num(dims?.w_mm) && num(dims?.h_mm) ? `${dims!.l_mm}×${dims!.w_mm}×${dims!.h_mm} мм` : undefined;
    const speed = num(card.move?.spd_max_mps) ?? top(card.move?.spd_mps);
    const payloadKg = num(card.load?.payload_kg);
    const runMin = top(card.power?.run_min);
    const io = on(card.env?.io);
    const environment = io.includes("in") && io.includes("ou") ? "both" : io.includes("in") ? "indoor" : io.includes("ou") ? "outdoor" : undefined;
    const integrations = list("integ", card.soft?.integ);
    const elevator = card.soft?.integ?.el;
    const acquisition = [...new Set(on(card.econ?.acq).map((code) => ACQ[code]).filter((m): m is AcquisitionModel => !!m))];

    const { fit, processes: forcedProcesses } = fitOf(item);
    // Процессы общие для всех объектов решения; интерфейс показывает только процессы
    // выбранного объекта (OBJECT_PROCESSES), поэтому пересечения id не мешают.
    const processes = new Set<string>();
    for (const objectType of Object.keys(fit)) {
      for (const s of item.scen) {
        const process = PROCESS_BY_SCEN[objectType]?.[s];
        if (process) processes.add(process);
      }
      const process = PROCESS_BY_CATEGORY[objectType]?.[item.cat];
      if (process) processes.add(process);
      const forced = forcedProcesses.get(objectType);
      if (forced) processes.add(forced);
    }

    const scenarios = item.scen.map((s) => ru("scen", s));
    const useCase = scenarios.length ? scenarios.join(", ") : categoryRu;
    const photos = [...new Set([...(card.photos ?? []), ...photosOf(card.id)])];

    const solution: CatalogSolution = {
      id: card.id,
      name: card.name,
      vendor: vendor?.name ?? "—",
      useCase: useCase[0]!.toUpperCase() + useCase.slice(1),
      price: priceM !== undefined ? String(priceM) : "—",
      payload: payloadKg !== undefined ? `${fmtNum(payloadKg)} кг` : "—",
      speed: speed !== undefined ? `${speed} м/с` : "—",
      maturity: MATURITY[card.status],
      confidence: "confirmed",
      source: "Каталог роботов ФЦ БАС",
      sourceDate,
      sourceUrl: vendor?.site ?? undefined,
      objectTypes: Object.keys(fit),
      solutionType: TYPE_BY_CATEGORY[item.cat] ?? "other",
      country,
      payloadKg,
      weightKg: num(dims?.mass_kg),
      dimensions,
      ...throughputOf(card),
      autonomyHours: runMin !== undefined ? round(runMin / 60, 1) : undefined,
      chargeHours: num(card.power?.chg_min) !== undefined ? round(card.power!.chg_min! / 60, 2) : undefined,
      // Запас энергии: из паспорта, иначе ёмкость × напряжение.
      batteryKwh:
        num(card.power?.energy_kwh) ??
        (num(card.power?.cap_ah) !== undefined && num(card.power?.volt_v) !== undefined
          ? round((card.power!.cap_ah! * card.power!.volt_v!) / 1000, 2)
          : undefined),
      powerKw:
        num(card.power?.cons_kw) ?? (num(card.power?.motor_w) !== undefined ? round(card.power!.motor_w! / 1000, 2) : undefined),
      positioningAccuracyMm: num(card.nav?.pos_acc_mm),
      navigation: list("navm", card.nav?.method).join(", ") || undefined,
      operatingConditions: conditionsOf(card),
      environment,
      minTempC: num(card.env?.t_op_c?.min),
      maxTempC: num(card.env?.t_op_c?.max),
      noiseDb: num(card.env?.noise_db),
      minAisleWidthM: num(card.move?.pass_min_mm) !== undefined ? round(card.move!.pass_min_mm! / 1000) : undefined,
      elevatorIntegration: elevator === true ? true : elevator === false ? false : undefined,
      infrastructure: {
        charging: list("chg", card.power?.chg).join(", ") || undefined,
        connectivity: list("conn", card.conn).join(", ") || undefined,
        integration: integrations.length ? `Интеграция: ${integrations.join(", ")}` : undefined,
      },
      costs: priceM !== undefined ? { equipment: priceM } : undefined,
      // Пустой список в карточке значит «ответили: нет», поэтому при отсутствии данных поле не заполняем.
      acquisitionModels: acquisition.length ? acquisition : undefined,
      lifespanYears: num(card.econ?.life_yr),
      processes: [...processes],
      limitations,
      cases: [],
      unconfirmedFields: unconfirmed,
      catalogCategory: item.cat,
      trl: num(card.trl),
      photos,
      objectFit: fit,
    };
    solution.fieldSources = provenanceOf(solution);
    if (countryFromVendor) {
      solution.fieldSources.country = {
        confirmed: false,
        sources: [{ kind: "team", title: "Страна производителя из справочника производителей каталога" }],
        note: "Страна производства робота в источниках не указана — взята страна компании-производителя",
      };
    }
    return compact(solution);
  }

  const itemsById = new Map(files.index.items.map((item) => [item.id, item]));
  const solutions: CatalogSolution[] = [];
  for (const category of files.categories.items) {
    for (const card of files.data[category.file]!.items) {
      const item = itemsById.get(card.id);
      if (!item) throw new Error(`${card.id} есть в ${category.file}, но нет в index.json`);
      solutions.push(toSolution(card, item, category.ru));
    }
  }

  // ─── Дополнения организатора ──────────────────────────────────────────────
  const byId = new Map(solutions.map((s) => [s.id, s]));
  const conflicts: string[] = [];
  const filled: string[] = [];
  const organizer: FieldSource = { kind: "organizer", title: supplements.source.title, date: supplements.source.date };

  for (const robot of supplements.robots) {
    if (byId.has(robot.id)) throw new Error(`${robot.id} из дополнений организатора уже есть в каталоге — выберите другой ID`);
    const solution: CatalogSolution = {
      ...robot,
      source: supplements.source.title,
      sourceDate: supplements.source.date,
      objectTypes: [],
      processes: [],
      photos: photosOf(robot.id),
      objectFit: {},
    };
    solution.fieldSources = Object.fromEntries(
      Object.keys(PATHS_BY_FIELD)
        .filter((key) => isFilledValue(fieldValue(solution, key)))
        .map((key): [string, FieldProvenance] => [key, { confirmed: true, sources: [organizer] }]),
    );
    // Страну организатор не указывает — это наше знание о компании-производителе.
    if (solution.fieldSources.country) {
      solution.fieldSources.country = {
        confirmed: false,
        sources: [{ kind: "team", title: "Страна регистрации компании-производителя" }],
        note: "В материалах организатора страна не указана",
      };
    }
    solutions.push(solution);
    byId.set(robot.id, solution);
  }

  for (const robot of supplements.researched ?? []) {
    if (byId.has(robot.id)) throw new Error(`${robot.id} из исследования команды уже есть в каталоге — выберите другой ID`);
    const solution: CatalogSolution = {
      ...robot,
      photos: photosOf(robot.id),
      objectFit: robot.objectFit ?? Object.fromEntries((robot.objectTypes ?? []).map((type) => [type, "inferred" as ObjectFit])),
    };
    solutions.push(solution);
    byId.set(robot.id, solution);
  }

  // Пустые поля каталога дополняем; непустые не трогаем, расхождение — в отчёт.
  for (const [id, fields] of Object.entries(supplements.fields)) {
    const solution = byId.get(id);
    if (!solution) {
      conflicts.push(`${id}: робота из дополнений организатора нет в этой версии каталога`);
      continue;
    }
    const record = solution as unknown as Record<string, unknown>;
    const added: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      const current = record[key];
      if (current === undefined || current === null || current === "—") {
        record[key] = value;
        added.push(key);
      } else if (TEXT_MERGE_FIELDS.has(key) && typeof current === "string" && !current.includes(String(value))) {
        record[key] = `${current}, ${value}`;
        added.push(key);
      } else if (JSON.stringify(current) !== JSON.stringify(value)) {
        conflicts.push(`${id} ${solution.name}: ${key} — в каталоге ${JSON.stringify(current)}, у организатора ${JSON.stringify(value)}`);
      }
    }
    for (const key of added) {
      const previous = solution.fieldSources?.[key];
      (solution.fieldSources ??= {})[key] = previous
        ? { ...previous, sources: [...previous.sources, organizer] }
        : { confirmed: true, sources: [organizer] };
    }
    if (added.length) {
      filled.push(`${id}: ${added.join(", ")}`);
      solution.source = `${solution.source}; ${supplements.source.title} (${added.join(", ")})`;
    }
  }

  // Пример организатора подтверждает применимость так же, как объект в каталоге.
  for (const example of supplements.examples) {
    const solution = byId.get(example.id);
    if (!solution) {
      conflicts.push(`${example.id}: пример организатора, но такого робота нет в этой версии каталога`);
      continue;
    }
    const fit = (solution.objectFit ??= {});
    if (fit[example.objectType] !== "declared") fit[example.objectType] = "example";
    solution.objectTypes = Object.keys(fit);
    if (!solution.processes?.includes(example.process)) solution.processes = [...(solution.processes ?? []), example.process];
  }

  // ─── Открытые источники ───────────────────────────────────────────────────
  // Заполняют пустые поля; описательный текст дописывают; страну, взятую нами по
  // производителю, заменяют. Непустое значение каталога не трогают — расхождение в отчёт.
  const RESEARCH_MERGE = new Set(["operatingConditions", "infrastructure.charging", "infrastructure.service"]);
  const researchedBy = new Map<string, string[]>();
  for (const entry of research.values) {
    const solution = byId.get(entry.id);
    if (!solution) {
      conflicts.push(`${entry.id}: значение из открытых источников, но такого робота нет в этой версии каталога`);
      continue;
    }
    const current = fieldValue(solution, entry.field);
    const provenance = solution.fieldSources?.[entry.field];
    const teamGuess = provenance?.sources.every((source) => source.kind === "team") ?? false;
    const record = solution as unknown as Record<string, unknown>;
    let applied = false;
    if (!isFilledValue(current) || teamGuess) {
      setPath(record, entry.field, entry.value);
      (solution.fieldSources ??= {})[entry.field] = {
        confirmed: entry.confirmed,
        sources: [entry.source],
        ...(entry.note ? { note: entry.note } : {}),
      };
      applied = true;
    } else if (RESEARCH_MERGE.has(entry.field) && typeof current === "string") {
      const addition = String(entry.value);
      if (!current.toLowerCase().includes(addition.toLowerCase())) {
        setPath(record, entry.field, `${current}, ${addition}`);
        const merged = solution.fieldSources?.[entry.field];
        (solution.fieldSources ??= {})[entry.field] = merged
          ? { ...merged, sources: [...merged.sources, entry.source] }
          : { confirmed: entry.confirmed, sources: [entry.source] };
        applied = true;
      }
    } else if (JSON.stringify(current) !== JSON.stringify(entry.value)) {
      conflicts.push(
        `${entry.id} ${solution.name}: ${entry.field} — в каталоге ${JSON.stringify(current)}, в открытых источниках ${JSON.stringify(entry.value)} (${entry.source.url ?? entry.source.title})`,
      );
    }
    if (applied) researchedBy.set(entry.id, [...(researchedBy.get(entry.id) ?? []), entry.field]);
  }
  for (const [id, fields] of researchedBy) {
    const solution = byId.get(id)!;
    // Допущение «страна по производителю» снято, если страну нашли в источниках.
    if (fields.includes("country")) {
      solution.unconfirmedFields = (solution.unconfirmedFields ?? []).filter((line) => !line.startsWith("Страна происхождения"));
    }
    if (!solution.source?.includes("открытые источники")) solution.source = `${solution.source}; открытые источники`;
  }

  const fitCounts: CatalogBuild["fit"] = {};
  for (const objectType of Object.keys(FIT_RULES)) {
    const count = (basis: ObjectFit) => solutions.filter((s) => s.objectFit?.[objectType] === basis).length;
    fitCounts[objectType] = { declared: count("declared"), example: count("example"), inferred: count("inferred") };
  }

  return {
    solutions: solutions.map(compact),
    version: { schema: files.index.schema_ver ?? "", updated: sourceDate ?? "" },
    fit: fitCounts,
    filled,
    conflicts,
    researched: [...researchedBy].map(([id, fields]) => `${id}: ${[...new Set(fields)].join(", ")}`),
  };
}

// ─── Новая версия каталога поверх того, что уже в базе ─────────────────────

/** Поля, которые правил администратор: у них в происхождении «правка администратора». */
export function adminEditedFields(solution: CatalogSolution | undefined): Set<string> {
  return new Set(
    Object.entries(solution?.fieldSources ?? {})
      .filter(([, provenance]) => provenance.sources.some((source) => source.kind === "admin"))
      .map(([key]) => key),
  );
}

function setPath(target: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    node[part] = { ...((node[part] as Record<string, unknown> | undefined) ?? {}) };
    node = node[part] as Record<string, unknown>;
  }
  if (value === undefined) delete node[parts[parts.length - 1]!];
  else node[parts[parts.length - 1]!] = value;
}

// Служебные поля: не сравниваются при подсчёте изменений.
const IGNORED_IN_DIFF = new Set(["completeness", "score", "scoreFactors", "fieldSources"]);

export interface CatalogMerge {
  next: CatalogSolution;
  /** Поля, которые поменяет новая версия. */
  changed: string[];
  /** Поля, оставленные как есть, потому что их правил администратор. */
  keptAdmin: string[];
}

/**
 * Решение новой версии каталога поверх существующего: всё из каталога, кроме
 * полей, которые правил администратор, — их значения и происхождение остаются.
 */
export function mergeCatalogVersion(existing: CatalogSolution | undefined, incoming: CatalogSolution): CatalogMerge {
  if (!existing) return { next: incoming, changed: ["новое решение"], keptAdmin: [] };
  const edited = adminEditedFields(existing);
  const next = structuredClone(incoming) as unknown as Record<string, unknown>;
  const kept: string[] = [];
  for (const key of edited) {
    // Применимость — одно знание в двух полях: правка любого сохраняет оба.
    const keys = key === "objectTypes" || key === "objectFit" ? ["objectTypes", "objectFit"] : [key];
    for (const path of keys) setPath(next, path, fieldValue(existing, path));
    kept.push(key);
    next.fieldSources = {
      ...((next.fieldSources as Record<string, FieldProvenance> | undefined) ?? {}),
      [key]: existing.fieldSources![key]!,
    };
  }
  const before = existing as unknown as Record<string, unknown>;
  // В базе пустой список хранится как [], в карточке каталога такого поля нет — это одно и то же.
  const norm = (value: unknown) => JSON.stringify(value === undefined || (Array.isArray(value) && !value.length) ? null : value);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(next)])].filter(
    (key) => !IGNORED_IN_DIFF.has(key) && norm(before[key]) !== norm(next[key]),
  );
  return { next: next as unknown as CatalogSolution, changed, keptAdmin: kept };
}
