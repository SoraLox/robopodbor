/**
 * Доменная модель каталога (ТЗ 3.3). Модуль без зависимостей: его импортируют
 * и API, и MSW-моки фронтенда, поэтому правила одинаковы в обоих режимах.
 */

export type Maturity = "operation" | "piloting" | "rnd";
export type DataConfidence = "confirmed" | "needs-review";
export type Availability = "available" | "on-order" | "pilot";
export type Environment = "indoor" | "outdoor" | "both";
export type AcquisitionModel = "purchase" | "leasing" | "raas";

export interface CatalogSolution {
  id: string;
  name: string;
  vendor: string;
  useCase: string;
  price: string;
  payload: string;
  speed: string;
  maturity: Maturity;
  confidence: DataConfidence;
  source?: string;
  sourceDate?: string;
  sourceUrl?: string;
  objectTypes?: string[];
  score?: number;
  scoreFactors?: Array<{ label: string; weight: number; max?: number }>;

  solutionType?: string;
  country?: string;
  availability?: Availability;

  payloadKg?: number;
  weightKg?: number;
  dimensions?: string;
  throughput?: number;
  throughputUnit?: string;
  autonomyHours?: number;
  /** Время полной зарядки, ч. */
  chargeHours?: number;
  /** Запас энергии батареи, кВт·ч (или ёмкость × напряжение). */
  batteryKwh?: number;
  /** Потребляемая мощность при работе, кВт. */
  powerKw?: number;
  positioningAccuracyMm?: number;
  navigation?: string;
  operatingConditions?: string;
  environment?: Environment;
  minTempC?: number;
  maxTempC?: number;
  noiseDb?: number;

  minAisleWidthM?: number;
  maxFloorDeviationMm?: number;
  minCeilingHeightM?: number;
  elevatorIntegration?: boolean;
  airsideCertified?: boolean;

  infrastructure?: {
    floor?: string;
    charging?: string;
    connectivity?: string;
    integration?: string;
    service?: string;
  };
  costs?: {
    equipment?: number;
    software?: number;
    implementation?: number;
    maintenancePerYear?: number;
  };
  acquisitionModels?: AcquisitionModel[];
  lifespanYears?: number;

  processes?: string[];
  limitations?: string[];
  cases?: string[];
  unconfirmedFields?: string[];
  completeness?: number;

  // Происхождение из каталога роботов (seed-data/robots-catalog)
  catalogCategory?: string;
  trl?: number;
  photos?: string[];
  objectFit?: Record<string, ObjectFit>;
  /** Происхождение каждой характеристики: ключ — поле карточки (payloadKg, infrastructure.charging, …). */
  fieldSources?: Record<string, FieldProvenance>;
}

export type SourceKind = "organizer" | "vendor" | "reseller" | "media" | "registry" | "team" | "admin";

export interface FieldSource {
  kind: SourceKind;
  title: string;
  url?: string;
  /** Дата публикации или обращения к источнику, ДД.ММ.ГГГГ. */
  date?: string;
}

export interface FieldProvenance {
  /** true — значение в источнике точное; false — «около», значение серии, пересчёт или вывод. */
  confirmed: boolean;
  sources: FieldSource[];
  note?: string;
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  organizer: "материалы организатора",
  vendor: "производитель",
  reseller: "реселлер, дистрибьютор",
  media: "СМИ",
  registry: "госреестр",
  team: "допущение команды",
  admin: "правка администратора",
};

/**
 * Откуда известно, что решение подходит типу объекта:
 * declared — объект указан в каталоге, example — организатор приводит решение
 * как пример для этого объекта, inferred — выведено нами по сценариям применения.
 */
export type ObjectFit = "declared" | "example" | "inferred";

export const OBJECT_FIT_LABEL: Record<ObjectFit, string> = {
  declared: "заявлено в каталоге",
  example: "пример организатора",
  inferred: "выведено по сценариям",
};

/**
 * objectTypes и objectFit — одно знание: для каких объектов решение и почему.
 * Список объектов берётся из objectTypes (его правят чаще: форма, колонка таблицы),
 * основание — из objectFit, прежнего значения или «заявлено» для нового объекта.
 */
export function syncApplicability<T extends Partial<CatalogSolution>>(
  patch: T,
  before?: Partial<CatalogSolution>,
): T & Pick<Partial<CatalogSolution>, "objectTypes" | "objectFit"> {
  const fit = patch.objectFit ?? before?.objectFit ?? {};
  if (patch.objectTypes) {
    const types = patch.objectTypes;
    return {
      ...patch,
      objectFit: Object.fromEntries(types.map((type) => [type, patch.objectFit?.[type] ?? before?.objectFit?.[type] ?? "declared"])),
    };
  }
  if (patch.objectFit) return { ...patch, objectTypes: Object.keys(fit) };
  return patch;
}

/** Справочник типов решений — по разделу 8 «Дополнений для участников». */
export const SOLUTION_TYPES: Record<string, string> = {
  amr: "AMR / транспортировка",
  fmr: "Беспилотный погрузчик (FMR)",
  stacker: "Робот-штабелёр",
  tug: "Робот-тягач",
  asrs: "Умная система хранения (AS/RS)",
  sorter: "Сортировочная система",
  conveyor: "Конвейерная система",
  manipulator: "Манипулятор / пикинг",
  cleaner: "Робот-уборщик",
  uav: "БАС / беспилотник",
  disinfection: "Дезинфекционный робот",
  courier: "Курьерский робот",
  inventory: "Робот-инвентаризатор",
  security: "Охранный, патрульный робот",
  platform: "Платформа высокой проходимости",
  vehicle: "Беспилотный транспорт",
  cell: "Роботизированная ячейка",
  crane: "Автоматизация кранов",
  software: "ПО для роботов",
  service: "Сервисный робот",
  other: "Другое решение",
};

/** Типы решений, которые перемещаются по объекту и потому зависят от проходов, лифтов и покрытия. */
export const MOBILE_TYPES = new Set([
  "amr",
  "fmr",
  "stacker",
  "tug",
  "cleaner",
  "courier",
  "disinfection",
  "inventory",
  "security",
  "platform",
  "service",
]);

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "В наличии",
  "on-order": "Под заказ",
  pilot: "Только пилотные поставки",
};

export const ACQUISITION_LABEL: Record<AcquisitionModel, string> = {
  purchase: "Покупка",
  leasing: "Лизинг",
  raas: "Аренда / RaaS",
};

export const INDUSTRIES: Record<string, { id: string; label: string }> = {
  warehouse: { id: "logistics", label: "Логистика и склад" },
  airport: { id: "aviation", label: "Авиационная инфраструктура" },
  clinic: { id: "healthcare", label: "Здравоохранение" },
};

export const OBJECT_LABEL: Record<string, string> = {
  warehouse: "Склад",
  airport: "Аэропорт",
  clinic: "Медучреждение",
};

/** Процессы объекта: уровень «процесс» иерархии каталога (ТЗ 3.3.1). */
export const OBJECT_PROCESSES: Record<string, Array<{ id: string; label: string }>> = {
  warehouse: [
    { id: "receiving", label: "Приёмка и отгрузка" },
    { id: "transport", label: "Внутренняя транспортировка" },
    { id: "storage", label: "Хранение и подача" },
    { id: "picking", label: "Комплектация заказов" },
    { id: "sorting", label: "Сортировка" },
    { id: "inventory", label: "Инвентаризация" },
    { id: "cleaning", label: "Уборка" },
    { id: "security", label: "Охрана и патрулирование" },
  ],
  airport: [
    { id: "baggage", label: "Обработка багажа" },
    { id: "ramp", label: "Перронная логистика" },
    { id: "cargo", label: "Грузовой терминал" },
    { id: "inspection", label: "Осмотр и мониторинг" },
    { id: "cleaning", label: "Уборка терминала" },
    { id: "passengers", label: "Обслуживание пассажиров" },
    { id: "fire", label: "Пожарная безопасность" },
  ],
  clinic: [
    { id: "delivery", label: "Доставка медикаментов и анализов" },
    { id: "linen", label: "Транспортировка белья и питания" },
    { id: "pharmacy", label: "Аптечная комплектация" },
    { id: "disinfection", label: "Дезинфекция помещений" },
    { id: "cleaning", label: "Уборка" },
    { id: "laboratory", label: "Лабораторная диагностика" },
    { id: "care", label: "Медицинская помощь и реабилитация" },
  ],
};

/**
 * Обязательные характеристики по группам таблицы 3.3 ТЗ. По ним считается
 * полнота карточки (ТЗ 3.3.4, «Качество данных»).
 */
export const REQUIRED_FIELDS: Array<{ group: string; key: string; label: string; get: (s: CatalogSolution) => unknown }> = [
  { group: "Идентификация", key: "vendor", label: "Производитель", get: (s) => s.vendor },
  { group: "Идентификация", key: "name", label: "Наименование", get: (s) => s.name },
  { group: "Идентификация", key: "solutionType", label: "Тип решения", get: (s) => s.solutionType },
  { group: "Идентификация", key: "useCase", label: "Назначение", get: (s) => s.useCase },
  { group: "Идентификация", key: "country", label: "Страна происхождения", get: (s) => s.country },
  { group: "Идентификация", key: "availability", label: "Статус доступности", get: (s) => s.availability },
  { group: "Технические", key: "payloadKg", label: "Грузоподъёмность", get: (s) => s.payloadKg },
  { group: "Технические", key: "dimensions", label: "Габариты", get: (s) => s.dimensions },
  { group: "Технические", key: "speed", label: "Скорость", get: (s) => s.speed },
  { group: "Технические", key: "throughput", label: "Производительность", get: (s) => s.throughput },
  { group: "Технические", key: "autonomyHours", label: "Автономность", get: (s) => s.autonomyHours },
  { group: "Технические", key: "positioningAccuracyMm", label: "Точность позиционирования", get: (s) => s.positioningAccuracyMm },
  { group: "Технические", key: "navigation", label: "Тип навигации", get: (s) => s.navigation },
  { group: "Технические", key: "operatingConditions", label: "Условия эксплуатации", get: (s) => s.operatingConditions },
  { group: "Инфраструктура", key: "infrastructure.floor", label: "Покрытие и проходы", get: (s) => s.infrastructure?.floor },
  { group: "Инфраструктура", key: "infrastructure.charging", label: "Зарядные станции", get: (s) => s.infrastructure?.charging },
  { group: "Инфраструктура", key: "infrastructure.connectivity", label: "Связь", get: (s) => s.infrastructure?.connectivity },
  { group: "Инфраструктура", key: "infrastructure.integration", label: "Интеграция", get: (s) => s.infrastructure?.integration },
  { group: "Инфраструктура", key: "infrastructure.service", label: "Сервисное обслуживание", get: (s) => s.infrastructure?.service },
  { group: "Экономика", key: "costs.equipment", label: "Стоимость оборудования", get: (s) => s.costs?.equipment },
  { group: "Экономика", key: "costs.software", label: "Стоимость ПО", get: (s) => s.costs?.software },
  { group: "Экономика", key: "costs.implementation", label: "Стоимость внедрения", get: (s) => s.costs?.implementation },
  { group: "Экономика", key: "costs.maintenancePerYear", label: "Обслуживание в год", get: (s) => s.costs?.maintenancePerYear },
  { group: "Экономика", key: "acquisitionModels", label: "Модель приобретения", get: (s) => s.acquisitionModels },
  { group: "Экономика", key: "lifespanYears", label: "Срок службы", get: (s) => s.lifespanYears },
  { group: "Применимость", key: "processes", label: "Поддерживаемые процессы", get: (s) => s.processes },
  { group: "Применимость", key: "objectTypes", label: "Типы объектов", get: (s) => s.objectTypes },
  { group: "Применимость", key: "limitations", label: "Ограничения", get: (s) => s.limitations },
  { group: "Применимость", key: "cases", label: "Реализованные кейсы", get: (s) => s.cases },
  { group: "Качество данных", key: "source", label: "Источник", get: (s) => s.source },
  { group: "Качество данных", key: "sourceDate", label: "Дата актуализации", get: (s) => s.sourceDate },
];

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0 && value.trim() !== "—";
  if (typeof value === "number") return Number.isFinite(value);
  // Пустой список ограничений или кейсов — осознанное «нет», а не пропуск.
  if (Array.isArray(value)) return true;
  return true;
}

export function missingFields(solution: CatalogSolution): string[] {
  return REQUIRED_FIELDS.filter((field) => !isFilled(field.get(solution))).map((field) => field.label);
}

export function completenessOf(solution: CatalogSolution): number {
  const filled = REQUIRED_FIELDS.length - missingFields(solution).length;
  return Math.round((filled / REQUIRED_FIELDS.length) * 100);
}

export function withCompleteness<T extends CatalogSolution>(solution: T): T {
  return { ...solution, completeness: completenessOf(solution) };
}

export interface TaxonomyNode {
  id: string;
  label: string;
  level: "industry" | "object" | "process" | "solutionType" | "product";
  children?: TaxonomyNode[];
}

/**
 * Иерархия «отрасль → объект → процесс → тип решения → продукт» строится
 * из самого каталога: новое решение сразу появляется в дереве, отдельно
 * поддерживать таблицу иерархии не нужно (ТЗ 3.3.1, 4.2.6).
 */
export function buildTaxonomy(solutions: CatalogSolution[]): TaxonomyNode[] {
  const industries = new Map<string, TaxonomyNode>();
  for (const [objectType, processes] of Object.entries(OBJECT_PROCESSES)) {
    const industry = INDUSTRIES[objectType];
    if (!industry) continue;
    const processNodes: TaxonomyNode[] = [];
    for (const process of processes) {
      const byType = new Map<string, TaxonomyNode[]>();
      for (const solution of solutions) {
        if (!solution.objectTypes?.includes(objectType)) continue;
        if (!solution.processes?.includes(process.id)) continue;
        const type = solution.solutionType ?? "other";
        const bucket = byType.get(type) ?? [];
        bucket.push({ id: `${objectType}/${process.id}/${type}/${solution.id}`, label: solution.name, level: "product" });
        byType.set(type, bucket);
      }
      if (byType.size === 0) continue;
      processNodes.push({
        id: `${objectType}/${process.id}`,
        label: process.label,
        level: "process",
        children: [...byType.entries()].map(([type, products]) => ({
          id: `${objectType}/${process.id}/${type}`,
          label: SOLUTION_TYPES[type] ?? "Другое решение",
          level: "solutionType" as const,
          children: products,
        })),
      });
    }
    const node = industries.get(industry.id) ?? { id: industry.id, label: industry.label, level: "industry" as const, children: [] };
    node.children!.push({ id: objectType, label: OBJECT_LABEL[objectType] ?? objectType, level: "object", children: processNodes });
    industries.set(industry.id, node);
  }
  return [...industries.values()];
}

/**
 * Категории каталога роботов (robots-catalog/categories.json) — короткие названия
 * во множественном числе для подкатегорий внутри процесса.
 */
export const CATALOG_CATEGORY_LABEL: Record<string, string> = {
  FC: "Уборщики помещений",
  SS: "Уличные уборщики",
  AM: "AMR, тележки и тягачи",
  FL: "Погрузчики и штабелёры",
  IN: "Инвентаризаторы",
  DL: "Роботы-курьеры",
  SC: "Охранные роботы",
  ER: "Пожарные и спасательные роботы",
  IR: "Инспекционные роботы",
  UG: "Платформы высокой проходимости",
  RW: "Роботы для обслуживания вагонов",
  AG: "Полевые роботы и тракторы",
  HV: "Роботы для сбора урожая",
  LV: "Роботы для животноводства",
  AV: "Беспилотный транспорт",
  CE: "Строительная техника",
  IM: "Промышленные манипуляторы",
  CB: "Коллаборативные роботы",
  MM: "Мобильные манипуляторы",
  RC: "Роботизированные ячейки",
  AS: "Системы хранения",
  CA: "Автоматизация кранов",
  FB: "Робо-кафе и бариста",
  HU: "Сервисные роботы",
  UA: "Беспилотники",
  MS: "Надводные суда",
  MU: "Подводные аппараты",
  SW: "Программные решения",
  OT: "Прочие роботы",
};

// Служебные поля карточки — не характеристики, происхождение у них не ведём.
const NOT_CHARACTERISTICS = new Set([
  "id", "score", "scoreFactors", "completeness", "confidence", "source", "sourceDate", "sourceUrl",
  "unconfirmedFields", "fieldSources",
]);
const NESTED_FIELDS = new Set(["infrastructure", "costs"]);

/** Какие характеристики меняет правка: вложенные — по ключу «infrastructure.charging». */
export function changedFields(before: CatalogSolution, patch: Partial<CatalogSolution>): string[] {
  const changed: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || NOT_CHARACTERISTICS.has(key)) continue;
    const previous = (before as unknown as Record<string, unknown>)[key];
    if (NESTED_FIELDS.has(key)) {
      const next = (value ?? {}) as Record<string, unknown>;
      const prev = (previous ?? {}) as Record<string, unknown>;
      for (const sub of new Set([...Object.keys(next), ...Object.keys(prev)])) {
        if (!same(prev[sub], next[sub])) changed.push(`${key}.${sub}`);
      }
    } else if (!same(previous, value)) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Правка администратора заменяет происхождение изменённых полей: прежний
 * источник подтверждал прежнее значение, а не новое (ТЗ 3.3.4).
 */
export function withAdminEdits(
  fieldSources: Record<string, FieldProvenance> | undefined,
  changed: string[],
  date: string,
): Record<string, FieldProvenance> | undefined {
  if (!changed.length) return fieldSources;
  const next = { ...(fieldSources ?? {}) };
  for (const key of changed) {
    next[key] = {
      confirmed: false,
      sources: [{ kind: "admin", title: "Правка администратора", date }],
      note: "Значение изменено вручную, источник значения не указан",
    };
  }
  return next;
}
