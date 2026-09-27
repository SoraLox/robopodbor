/**
 * Паспорт объекта: проверка значений и формат шаблона для загрузки (ТЗ 3.2.3, 3.2.4).
 * Модуль без зависимостей: тот же разбор работает в API и в MSW-моках.
 */

export interface ParameterFieldDef {
  id: string;
  label: string;
  hint?: string;
  unit?: string;
  section?: string;
  kind: "number" | "text" | "select" | string;
  min?: number;
  max?: number;
  defaultValue?: string;
  required?: boolean;
  source?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface ImportIssue {
  row?: number;
  fieldId?: string;
  label?: string;
  message: string;
}

export interface ImportResult {
  values: Record<string, string>;
  recognized: number;
  skipped: string[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export const TEMPLATE_HEADER = [
  "ID поля",
  "Раздел",
  "Параметр",
  "Значение",
  "Ед. изм.",
  "Обязательное",
  "Допустимые значения",
  "По умолчанию",
  "Источник норматива",
  "Подсказка",
] as const;

function fmt(value: number) {
  return String(value).replace(".", ",");
}

export function allowedValues(field: ParameterFieldDef): string {
  if (field.kind === "select" && field.options) return field.options.map((o) => o.label).join(" / ");
  if (field.kind === "number") {
    if (field.min !== undefined && field.max !== undefined) {
      return field.min === field.max ? fmt(field.min) : `${fmt(field.min)} … ${fmt(field.max)}`;
    }
    if (field.min !== undefined) return `от ${fmt(field.min)}`;
    if (field.max !== undefined) return `до ${fmt(field.max)}`;
    return "число";
  }
  return "текст";
}

/** Строки шаблона: шапка + по строке на поле, колонка «Значение» заполнена значением по умолчанию. */
export function templateRows(fields: ParameterFieldDef[]): string[][] {
  return [
    [...TEMPLATE_HEADER],
    ...fields.map((field) => [
      field.id,
      field.section ?? "",
      field.label,
      displayValue(field, field.defaultValue ?? ""),
      field.unit ?? "",
      field.required === false ? "нет" : "да",
      allowedValues(field),
      displayValue(field, field.defaultValue ?? ""),
      field.source ?? "",
      field.hint ?? "",
    ]),
  ];
}

function displayValue(field: ParameterFieldDef, value: string) {
  if (field.kind === "select") return field.options?.find((o) => o.value === value)?.label ?? value;
  return value;
}

function normalizeUnit(unit: string) {
  return unit.toLowerCase().replace(/\s+/g, "").replace(/ё/g, "е").replace(/\.$/, "");
}

/**
 * Проверка одного значения: тип, единица измерения, диапазон, варианты выбора.
 * Возвращает нормализованное значение или текст ошибки со способом исправления (ТЗ 4.5.4).
 */
export function checkValue(
  field: ParameterFieldDef,
  raw: string,
  unit?: string,
): { value: string } | { error: string } {
  const value = raw.trim();
  if (!value) {
    return field.required === false ? { value: "" } : { error: "Обязательное поле не заполнено — укажите значение" };
  }

  if (unit && field.unit && normalizeUnit(unit) !== normalizeUnit(field.unit)) {
    return { error: `Единица «${unit}» не совпадает с ожидаемой «${field.unit}» — пересчитайте значение в ${field.unit}` };
  }

  if (field.kind === "number") {
    const num = Number(value.replace(/[\s\u00a0]/g, "").replace(",", "."));
    if (!Number.isFinite(num)) return { error: `«${value}» не число — введите число${field.unit ? ` в ${field.unit}` : ""}` };
    if (field.min !== undefined && num < field.min) {
      return { error: `${fmt(num)} меньше допустимого минимума ${fmt(field.min)}${field.unit ? ` ${field.unit}` : ""}` };
    }
    if (field.max !== undefined && num > field.max) {
      return { error: `${fmt(num)} больше допустимого максимума ${fmt(field.max)}${field.unit ? ` ${field.unit}` : ""}` };
    }
    return { value: String(num) };
  }

  if (field.kind === "select" && field.options) {
    const lower = value.toLowerCase();
    const option = field.options.find((o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower);
    if (!option) return { error: `«${value}» нет среди вариантов: ${field.options.map((o) => o.label).join(", ")}` };
    return { value: option.value };
  }

  return { value };
}

const HEADER_ALIASES = {
  id: ["id поля", "id", "ключ", "код"],
  label: ["параметр", "название", "наименование"],
  value: ["значение", "value"],
  unit: ["ед. изм.", "ед.изм.", "единица", "ед. изм", "unit"],
};

function findColumn(header: string[], aliases: string[]) {
  return header.findIndex((cell) => aliases.includes(cell.trim().toLowerCase()));
}

/**
 * Разбор строк файла (CSV или лист xlsx, уже превращённый в строки).
 * Поддерживаются два формата: шаблон с шапкой (ID поля, Значение, Ед. изм. …)
 * и простой «ключ;значение», где ключ — ID поля или его название.
 */
export function parseParameterRows(rows: string[][], fields: ParameterFieldDef[]): ImportResult {
  const byKey = new Map<string, ParameterFieldDef>();
  for (const field of fields) {
    byKey.set(field.id.toLowerCase(), field);
    byKey.set(field.label.toLowerCase(), field);
  }

  const headerIndex = rows.findIndex(
    (row) => findColumn(row, HEADER_ALIASES.value) >= 0 && (findColumn(row, HEADER_ALIASES.id) >= 0 || findColumn(row, HEADER_ALIASES.label) >= 0),
  );
  const header = headerIndex >= 0 ? rows[headerIndex]! : null;
  const col = header
    ? {
        id: findColumn(header, HEADER_ALIASES.id),
        label: findColumn(header, HEADER_ALIASES.label),
        value: findColumn(header, HEADER_ALIASES.value),
        unit: findColumn(header, HEADER_ALIASES.unit),
      }
    : { id: 0, label: -1, value: 1, unit: -1 };

  const values: Record<string, string> = {};
  const skipped: string[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    if (index <= headerIndex) return;
    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").toString().trim() : "");
    const key = cell(col.id) || cell(col.label);
    if (!key) return;
    const field = byKey.get(key.toLowerCase()) ?? (col.label >= 0 ? byKey.get(cell(col.label).toLowerCase()) : undefined);
    if (!field) {
      skipped.push(key);
      return;
    }
    seen.add(field.id);
    const checked = checkValue(field, cell(col.value), cell(col.unit) || undefined);
    if ("error" in checked) {
      errors.push({ row: index + 1, fieldId: field.id, label: field.label, message: checked.error });
    } else if (checked.value !== "") {
      values[field.id] = checked.value;
    }
  });

  const warnings: ImportIssue[] = [];
  for (const field of fields) {
    if (field.required === false || seen.has(field.id)) continue;
    warnings.push({
      fieldId: field.id,
      label: field.label,
      message: field.defaultValue
        ? `Нет в файле — подставлено значение по умолчанию ${displayValue(field, field.defaultValue)}${field.unit ? ` ${field.unit}` : ""}`
        : "Нет в файле — заполните вручную",
    });
  }

  return { values, recognized: Object.keys(values).length, skipped, errors, warnings };
}

/** Простейший разбор CSV: разделитель ; , или таб, кавычки по RFC 4180. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: string[][]): string {
  const escape = (value: string) => (/[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\r\n")}\r\n`;
}
