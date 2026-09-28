/**
 * Табличное представление каталога: выгрузка и загрузка таблицы решений
 * в Excel/CSV (ТЗ 3.3.2, 3.8.2). Колонка «ID» пустая — решение создаётся,
 * заполненная — обновляется. Названия колонок совпадают с карточкой решения.
 */
import { OBJECT_FIT_LABEL, OBJECT_LABEL, type CatalogSolution, type ObjectFit } from "./catalog.js";

type Kind = "text" | "number" | "bool" | "list" | "fit";

interface Column {
  key: string;
  header: string;
  kind: Kind;
  aliases?: string[];
}

export const CATALOG_COLUMNS: Column[] = [
  { key: "id", header: "ID", kind: "text" },
  { key: "name", header: "Наименование", kind: "text", aliases: ["название", "модель", "продукт"] },
  { key: "vendor", header: "Производитель", kind: "text", aliases: ["вендор", "поставщик"] },
  { key: "solutionType", header: "Тип решения", kind: "text", aliases: ["тип", "класс решения"] },
  { key: "useCase", header: "Назначение", kind: "text", aliases: ["применение", "описание"] },
  { key: "country", header: "Страна происхождения", kind: "text", aliases: ["страна"] },
  { key: "availability", header: "Статус доступности", kind: "text", aliases: ["доступность", "статус"] },
  { key: "maturity", header: "Зрелость", kind: "text" },
  { key: "objectTypes", header: "Типы объектов", kind: "list" },
  { key: "processes", header: "Процессы", kind: "list" },
  { key: "objectFit", header: "Основание применимости", kind: "fit" },
  { key: "catalogCategory", header: "Категория каталога", kind: "text" },
  { key: "trl", header: "УГТ", kind: "number", aliases: ["trl", "уровень готовности"] },
  { key: "photos", header: "Фото", kind: "list", aliases: ["фотографии"] },
  { key: "price", header: "Цена, млн ₽", kind: "text", aliases: ["цена", "стоимость", "цена с ндс"] },
  { key: "payload", header: "Грузоподъёмность (текст)", kind: "text" },
  { key: "payloadKg", header: "Грузоподъёмность, кг", kind: "number" },
  { key: "weightKg", header: "Масса, кг", kind: "number", aliases: ["масса"] },
  { key: "dimensions", header: "Габариты", kind: "text" },
  { key: "speed", header: "Скорость", kind: "text" },
  { key: "throughput", header: "Производительность", kind: "number" },
  { key: "throughputUnit", header: "Ед. производительности", kind: "text" },
  { key: "autonomyHours", header: "Автономность, ч", kind: "number", aliases: ["автономность"] },
  { key: "chargeHours", header: "Время зарядки, ч", kind: "number", aliases: ["время зарядки"] },
  { key: "batteryKwh", header: "Батарея, кВт·ч", kind: "number", aliases: ["емкость батареи", "ёмкость батареи"] },
  { key: "powerKw", header: "Мощность, кВт", kind: "number", aliases: ["потребляемая мощность"] },
  { key: "positioningAccuracyMm", header: "Точность позиционирования, мм", kind: "number", aliases: ["точность позиционирования"] },
  { key: "navigation", header: "Тип навигации", kind: "text", aliases: ["навигация"] },
  { key: "operatingConditions", header: "Условия эксплуатации", kind: "text" },
  { key: "environment", header: "Среда (indoor/outdoor/both)", kind: "text" },
  { key: "minTempC", header: "Мин. температура, °C", kind: "number" },
  { key: "maxTempC", header: "Макс. температура, °C", kind: "number" },
  { key: "noiseDb", header: "Шум, дБА", kind: "number" },
  { key: "minAisleWidthM", header: "Мин. ширина прохода, м", kind: "number" },
  { key: "maxFloorDeviationMm", header: "Допуск ровности пола, мм/2м", kind: "number" },
  { key: "minCeilingHeightM", header: "Мин. высота помещения, м", kind: "number" },
  { key: "elevatorIntegration", header: "Интеграция с лифтами", kind: "bool" },
  { key: "airsideCertified", header: "Допуск на перрон", kind: "bool" },
  { key: "infrastructure.floor", header: "Требования к покрытию и проходам", kind: "text" },
  { key: "infrastructure.charging", header: "Зарядная инфраструктура", kind: "text" },
  { key: "infrastructure.connectivity", header: "Связь", kind: "text" },
  { key: "infrastructure.integration", header: "Интеграция", kind: "text" },
  { key: "infrastructure.service", header: "Сервисное обслуживание", kind: "text" },
  { key: "costs.equipment", header: "Оборудование, млн ₽", kind: "number" },
  { key: "costs.software", header: "ПО, млн ₽", kind: "number" },
  { key: "costs.implementation", header: "Внедрение, млн ₽", kind: "number" },
  { key: "costs.maintenancePerYear", header: "Обслуживание в год, млн ₽", kind: "number" },
  { key: "acquisitionModels", header: "Модели приобретения", kind: "list" },
  { key: "lifespanYears", header: "Срок службы, лет", kind: "number" },
  { key: "limitations", header: "Ограничения", kind: "list" },
  { key: "cases", header: "Реализованные кейсы", kind: "list" },
  { key: "confidence", header: "Подтверждённость (confirmed/needs-review)", kind: "text" },
  { key: "unconfirmedFields", header: "Поля-допущения", kind: "list" },
  { key: "source", header: "Источник", kind: "text" },
  { key: "sourceUrl", header: "Ссылка на источник", kind: "text" },
  { key: "sourceDate", header: "Дата актуализации", kind: "text" },
];

function getPath(target: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], target);
}

function setPath(target: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    node[part] = (node[part] as Record<string, unknown> | undefined) ?? {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

// «Склад: заявлено в каталоге; Аэропорт: пример организатора» ⇄ {warehouse: "declared", airport: "example"}.
function fitToText(fit: Record<string, ObjectFit>): string {
  return Object.entries(fit)
    .map(([type, basis]) => `${OBJECT_LABEL[type] ?? type}: ${OBJECT_FIT_LABEL[basis]}`)
    .join("; ");
}

const lookup = (table: Record<string, string>, raw: string) => {
  const needle = raw.trim().toLowerCase();
  return Object.entries(table).find(([key, label]) => key.toLowerCase() === needle || label.toLowerCase() === needle)?.[0];
};

function textToFit(raw: string): { fit?: Record<string, ObjectFit>; error?: string } {
  const fit: Record<string, ObjectFit> = {};
  for (const part of raw.split(/[;\n]/).map((item) => item.trim()).filter(Boolean)) {
    const [typeRaw = "", basisRaw = ""] = part.split(":");
    const type = lookup(OBJECT_LABEL, typeRaw);
    const basis = lookup(OBJECT_FIT_LABEL, basisRaw) as ObjectFit | undefined;
    if (!type || !basis) {
      return { error: `«${part}»: нужно «Объект: основание», основания — ${Object.values(OBJECT_FIT_LABEL).join(", ")}` };
    }
    fit[type] = basis;
  }
  return { fit };
}

export function catalogToRows(solutions: CatalogSolution[]): string[][] {
  return [
    CATALOG_COLUMNS.map((column) => column.header),
    ...solutions.map((solution) =>
      CATALOG_COLUMNS.map((column) => {
        const value = getPath(solution as unknown as Record<string, unknown>, column.key);
        if (value === undefined || value === null) return "";
        if (column.kind === "fit") return fitToText(value as Record<string, ObjectFit>);
        if (Array.isArray(value)) return value.join("; ");
        if (typeof value === "boolean") return value ? "да" : "нет";
        return String(value);
      }),
    ),
  ];
}

const MATURITY_ALIASES: Record<string, string> = {
  operation: "operation",
  "в эксплуатации": "operation",
  серийное: "operation",
  piloting: "piloting",
  пилот: "piloting",
  rnd: "rnd",
  ниокр: "rnd",
};

export interface CatalogRowIssue {
  row: number;
  message: string;
}

/**
 * Разбор таблицы решений. Колонки ищутся по названию (или его синониму), порядок
 * не важен — так загружается и собственная выгрузка, и таблица организатора.
 */
export function rowsToCatalog(rows: string[][]): {
  items: Array<{ row: number; data: Partial<CatalogSolution> }>;
  errors: CatalogRowIssue[];
} {
  const headerIndex = rows.findIndex((row) => row.some((cell) => /наименование|название/i.test(cell)));
  if (headerIndex < 0) return { items: [], errors: [{ row: 1, message: "Не найдена шапка таблицы: нужна колонка «Наименование»" }] };
  const header = rows[headerIndex]!.map((cell) => cell.trim().toLowerCase());
  const columnIndex = CATALOG_COLUMNS.map((column) => {
    const names = [column.header.toLowerCase(), ...(column.aliases ?? [])];
    return header.findIndex((cell) => names.includes(cell));
  });

  const items: Array<{ row: number; data: Partial<CatalogSolution> }> = [];
  const errors: CatalogRowIssue[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    if (row.every((cell) => !String(cell ?? "").trim())) return;
    const item: Record<string, unknown> = {};
    CATALOG_COLUMNS.forEach((column, i) => {
      const index = columnIndex[i]!;
      if (index < 0) return;
      const raw = String(row[index] ?? "").trim();
      if (!raw) return;
      if (column.kind === "number") {
        const num = Number(raw.replace(/[\s\u00a0]/g, "").replace(",", "."));
        if (Number.isFinite(num)) setPath(item, column.key, num);
        else errors.push({ row: rowNumber, message: `«${column.header}»: «${raw}» не число` });
      } else if (column.kind === "bool") {
        setPath(item, column.key, /^(да|yes|true|1)$/i.test(raw));
      } else if (column.kind === "fit") {
        const { fit, error } = textToFit(raw);
        if (fit) setPath(item, column.key, fit);
        else errors.push({ row: rowNumber, message: `«${column.header}»: ${error}` });
      } else if (column.kind === "list") {
        setPath(item, column.key, raw.split(/[;\n]/).map((part) => part.trim()).filter(Boolean));
      } else {
        setPath(item, column.key, raw);
      }
    });
    if (typeof item.maturity === "string") item.maturity = MATURITY_ALIASES[item.maturity.toLowerCase()] ?? item.maturity;
    if (!item.name) {
      errors.push({ row: rowNumber, message: "Не заполнено «Наименование» — строка пропущена" });
      return;
    }
    if (!item.vendor) {
      errors.push({ row: rowNumber, message: `«${String(item.name)}»: не заполнен «Производитель» — строка пропущена` });
      return;
    }
    items.push({ row: rowNumber, data: item as Partial<CatalogSolution> });
  });
  return { items, errors };
}
