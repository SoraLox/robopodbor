/**
 * Подбор решений под объект (ТЗ 3.4, «Дополнения» п. 7.1).
 *
 * Для каждого решения каталога, применимого к типу объекта, проверяются
 * ограничения продукта против паспорта объекта. Итог по каждому решению:
 *  - excluded     — ключевое ограничение делает применение невозможным (3.4.3);
 *  - needs-review — проверить нельзя из-за недостатка данных или решение незрелое;
 *  - recommended  — ограничения проверены и выполняются.
 * Балл ранжирования раскладывается на критерии с весами (3.4.5).
 */
import { MOBILE_TYPES, completenessOf, missingFields, type CatalogSolution } from "./catalog.js";

export const SELECTION_RULES_VERSION = "selection-2026.09c";

export type SelectionStatus = "recommended" | "needs-review" | "excluded";

export interface SelectionFactor {
  label: string;
  weight: number;
  max: number;
}

export interface SelectionItem {
  solutionId: string;
  status: SelectionStatus;
  score: number;
  factors: SelectionFactor[];
  reasons: string[];
  limitations: string[];
  missing: string[];
  blockers: string[];
}

export interface SelectionResult {
  objectType: string;
  rulesVersion: string;
  summary: { recommended: number; needsReview: number; excluded: number };
  items: SelectionItem[];
}

export interface ParameterFieldLike {
  id: string;
  label: string;
  defaultValue?: string;
}

type Params = Record<string, string>;

function num(params: Params, id: string): number | undefined {
  const raw = params[id];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function fmt(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

interface LoadRequirement {
  fieldId: string;
  label: string;
  /**
   * Более лёгкий груз того же объекта. Если основной груз решению не по силам,
   * а этот — по силам, решение не исключается: оно закрывает часть процесса.
   */
  lighter?: { fieldId: string; label: string };
}

/**
 * Масса, которую должно везти или поднимать решение, — зависит от объекта,
 * типа решения и процесса, который оно закрывает на этом объекте.
 */
function loadRequirement(objectType: string, type: string | undefined, processes: string[]): LoadRequirement | null {
  const t = type ?? "";
  if (objectType === "warehouse") {
    if (["amr", "fmr", "stacker", "tug", "asrs"].includes(t)) {
      return {
        fieldId: "wh_massa_gruzovoy_edinitsy",
        label: "масса паллеты",
        lighter: { fieldId: "wh_massa_shtuchnoy_edinitsy", label: "масса штучной единицы" },
      };
    }
    if (["sorter", "manipulator"].includes(t)) {
      return { fieldId: "wh_massa_shtuchnoy_edinitsy", label: "масса штучной единицы" };
    }
  }
  if (objectType === "airport" && ["sorter", "amr", "tug"].includes(t)) {
    return { fieldId: "ap_massa_edinitsy_bagazha", label: "масса единицы багажа" };
  }
  // Тележку с питанием возят только роботы процесса «белье и питание»; для
  // доставки медикаментов и анализов массы посылки в паспорте нет — не проверяем.
  if (objectType === "clinic" && ["amr", "courier", "tug"].includes(t) && processes.includes("linen")) {
    return { fieldId: "cl_massa_telezhki_pitaniem", label: "масса тележки с питанием" };
  }
  return null;
}

const AISLE_FIELD: Record<string, { id: string; label: string }> = {
  warehouse: { id: "wh_shirina_rabochih_prohodov_mezhdu_stellazhami", label: "ширина рабочих проходов" },
  clinic: { id: "cl_shirina_koridorov", label: "ширина коридоров" },
};

const BUDGET_FIELD: Record<string, string> = {
  warehouse: "wh_planiruemyy_byudzhet_robotizatsiyu",
  airport: "ap_planiruemyy_byudzhet_robotizatsiyu",
  clinic: "cl_planiruemyy_byudzhet_robotizatsiyu",
};

const NOISE_FIELD: Record<string, { id: string; label: string }> = {
  airport: { id: "ap_ogranicheniya_urovnyu_shuma", label: "ограничение по шуму в зоне" },
  clinic: { id: "cl_trebovaniya_urovnyu_shuma_palatah", label: "норма шума в палатах ночью" },
};

const MATURITY_POINTS = { operation: 30, piloting: 18, rnd: 6 } as const;

interface Check {
  blockers: string[];
  limitations: string[];
  missing: string[];
  reasons: string[];
  /** Сколько проверок «подходит / не подходит» не удалось выполнить — только они понижают статус. */
  unresolved: number;
}

/** Проверка «требование решения ≤ / ≥ параметр объекта» с разбором нехватки данных. */
function compare(
  check: Check,
  opts: {
    need: number | undefined;
    needLabel: string;
    have: number | undefined;
    haveLabel: string;
    haveKnown: boolean;
    unit: string;
    ok: (need: number, have: number) => boolean;
    blocker: (need: string, have: string) => string;
    reason: (need: string, have: string) => string;
  },
) {
  if (opts.need === undefined) {
    check.missing.push(`${opts.needLabel}: нет данных в карточке решения`);
    check.unresolved += 1;
    return;
  }
  if (!opts.haveKnown) {
    check.missing.push(`${opts.haveLabel}: нет в паспорте объекта — проверить при обследовании`);
    check.unresolved += 1;
    return;
  }
  if (opts.have === undefined) {
    check.missing.push(`${opts.haveLabel}: не заполнено`);
    check.unresolved += 1;
    return;
  }
  const need = `${fmt(opts.need)} ${opts.unit}`.trim();
  const have = `${fmt(opts.have)} ${opts.unit}`.trim();
  if (opts.ok(opts.need, opts.have)) check.reasons.push(opts.reason(need, have));
  else check.blockers.push(opts.blocker(need, have));
}

export function evaluateSolution(
  solution: CatalogSolution,
  objectType: string,
  params: Params,
  knownFields: Set<string>,
): SelectionItem {
  const check: Check = { blockers: [], limitations: [], missing: [], reasons: [], unresolved: 0 };
  const type = solution.solutionType;
  const mobile = type ? MOBILE_TYPES.has(type) : false;
  const known = (id: string) => knownFields.has(id);

  if (solution.objectTypes?.includes(objectType)) {
    if (solution.objectFit?.[objectType] === "inferred") {
      check.missing.push(
        "Производитель не указывал этот тип объекта — применимость выведена по сценариям использования, подтвердить у поставщика",
      );
      check.unresolved += 1;
    } else if (solution.objectFit?.[objectType] === "example") {
      check.reasons.push("Организатор приводит это решение как пример для такого типа объекта");
    } else {
      check.reasons.push("Решение предназначено для этого типа объекта");
    }
  } else {
    check.blockers.push("Решение не предназначено для этого типа объекта");
  }

  const load = loadRequirement(objectType, type, solution.processes ?? []);
  const lighterLoad = load?.lighter ? num(params, load.lighter.fieldId) : undefined;
  const mainLoad = load ? num(params, load.fieldId) : undefined;
  if (
    load?.lighter &&
    solution.payloadKg !== undefined &&
    mainLoad !== undefined &&
    lighterLoad !== undefined &&
    solution.payloadKg < mainLoad &&
    solution.payloadKg >= lighterLoad
  ) {
    check.limitations.push(
      `Не поднимает груз, для которого указана ${load.label} ${fmt(mainLoad)} кг, — только лёгкий груз до ${fmt(solution.payloadKg)} кг (${load.lighter.label} ${fmt(lighterLoad)} кг)`,
    );
  } else if (load) {
    compare(check, {
      need: solution.payloadKg,
      needLabel: "Грузоподъёмность",
      have: num(params, load.fieldId),
      haveLabel: load.label[0]!.toUpperCase() + load.label.slice(1),
      haveKnown: known(load.fieldId),
      unit: "кг",
      ok: (need, have) => need >= have,
      blocker: (need, have) => `Грузоподъёмность ${need} меньше, чем ${load.label} ${have}`,
      reason: (need, have) => `Грузоподъёмность ${need} покрывает ${load.label} ${have}`,
    });
  }

  const aisle = AISLE_FIELD[objectType];
  if (mobile && aisle) {
    compare(check, {
      need: solution.minAisleWidthM,
      needLabel: "Минимальная ширина прохода",
      have: num(params, aisle.id),
      haveLabel: aisle.label[0]!.toUpperCase() + aisle.label.slice(1),
      haveKnown: known(aisle.id),
      unit: "м",
      ok: (need, have) => have >= need,
      blocker: (need, have) => `Нужен проход не уже ${need}, а ${aisle.label} — ${have}`,
      reason: (need, have) => `Проходит по ширине: нужно ${need}, есть ${have}`,
    });
  }

  if (solution.maxFloorDeviationMm !== undefined) {
    compare(check, {
      need: solution.maxFloorDeviationMm,
      needLabel: "Допуск ровности пола",
      have: num(params, "wh_rovnost_pola"),
      haveLabel: "Ровность пола",
      haveKnown: known("wh_rovnost_pola"),
      unit: "мм/2м",
      ok: (need, have) => have <= need,
      blocker: (need, have) => `Ровность пола ${have} хуже допуска решения ${need}`,
      reason: (need, have) => `Ровность пола ${have} в пределах допуска ${need}`,
    });
  }

  if (solution.minCeilingHeightM !== undefined) {
    compare(check, {
      need: solution.minCeilingHeightM,
      needLabel: "Минимальная высота помещения",
      have: num(params, "wh_vysota_potolkov_zone_hraneniya"),
      haveLabel: "Высота потолков",
      haveKnown: known("wh_vysota_potolkov_zone_hraneniya"),
      unit: "м",
      ok: (need, have) => have >= need,
      blocker: (need, have) => `Нужна высота от ${need}, а потолки — ${have}`,
      reason: (need, have) => `Высота потолков ${have} достаточна (нужно от ${need})`,
    });
  }

  if (objectType === "airport" && solution.environment && solution.environment !== "indoor") {
    compare(check, {
      need: solution.minTempC,
      needLabel: "Нижняя рабочая температура",
      have: num(params, "ap_temperatura_neotaplivaemyh_zonah"),
      haveLabel: "Температура в неотапливаемых зонах",
      haveKnown: known("ap_temperatura_neotaplivaemyh_zonah"),
      unit: "°C",
      ok: (need, have) => need <= have,
      blocker: (need, have) => `Работает от ${need}, а зимой на перроне до ${have}`,
      reason: (need, have) => `Работает при ${have} (допустимо от ${need})`,
    });
    const certification = params.ap_airside_certification?.trim();
    if (certification) {
      if (solution.airsideCertified === true) {
        check.reasons.push(`Есть допуск к работе на перроне (${certification})`);
      } else if (solution.airsideCertified === false) {
        check.blockers.push(`Нет допуска к работе на перроне (${certification})`);
      } else {
        check.missing.push("Допуск к работе на перроне: нет данных в карточке решения");
        check.unresolved += 1;
      }
    }
  }

  if (objectType === "clinic" && mobile && ["amr", "courier", "tug"].includes(type ?? "")) {
    const floors = num(params, "cl_kolichestvo_etazhey") ?? 1;
    if (floors > 1) {
      const liftsApi = params.cl_elevator_bms_present === "yes";
      const ramps = params.cl_ramps_present === "yes";
      if (solution.elevatorIntegration === false && !ramps) {
        check.blockers.push(`Нет интеграции с лифтами, а маршрут проходит по ${fmt(floors)} этажам`);
      } else if (solution.elevatorIntegration === undefined) {
        check.missing.push("Интеграция с лифтами: нет данных в карточке решения");
        check.unresolved += 1;
      } else if (solution.elevatorIntegration && !liftsApi && !ramps) {
        check.limitations.push("Нужна система управления лифтами с API — у объекта её нет");
      } else if (solution.elevatorIntegration) {
        check.reasons.push("Умеет вызывать лифт — работает между этажами");
      }
    }
    if (params.cl_access_control_zones === "yes") {
      check.limitations.push("Потребуется интеграция со СКУД для прохода через двери");
    }
  }

  const noise = NOISE_FIELD[objectType];
  if (noise && mobile && solution.noiseDb !== undefined && known(noise.id)) {
    const limit = num(params, noise.id);
    if (limit !== undefined && solution.noiseDb > limit) {
      check.limitations.push(
        `Шум ${fmt(solution.noiseDb)} дБА выше, чем ${noise.label} ${fmt(limit)} дБА — работать в часы, когда это допустимо`,
      );
    }
  }

  if (objectType === "warehouse" && params.wh_wms_present === "no") {
    check.limitations.push("Нужна WMS для постановки задач роботам — у объекта её нет");
  }

  const budgetId = BUDGET_FIELD[objectType];
  const budget = budgetId ? num(params, budgetId) : undefined;
  const unitPrice = Number(solution.price.replace(",", "."));
  if (budget !== undefined && Number.isFinite(unitPrice)) {
    if (unitPrice > budget) {
      check.blockers.push(`Цена одной единицы ${fmt(unitPrice)} млн ₽ больше бюджета ${fmt(budget)} млн ₽`);
    } else {
      check.reasons.push(`Единица стоит ${fmt(unitPrice)} млн ₽ при бюджете ${fmt(budget)} млн ₽`);
    }
  }

  for (const limitation of solution.limitations ?? []) check.limitations.push(limitation);

  if (solution.maturity === "rnd") check.missing.push("Решение на стадии НИОКР — нет серийных внедрений");
  if (solution.confidence === "needs-review") {
    check.missing.push("Характеристики не подтверждены поставщиком");
    check.unresolved += 1;
  }
  // Пробелы карточки показываем, но статус они не понижают: в реальном каталоге
  // заполнена малая часть полей, и иначе «Требует проверки» получили бы все.
  const gaps = missingFields(solution);
  if (gaps.length) check.missing.push(`Не заполнены характеристики: ${gaps.join(", ")}`);
  if (solution.unconfirmedFields?.length) {
    check.missing.push(`Приняты допущения по полям: ${solution.unconfirmedFields.join(", ")}`);
  }

  const completeness = completenessOf(solution);
  const factors: SelectionFactor[] = [
    { label: "Зрелость решения", weight: MATURITY_POINTS[solution.maturity], max: 30 },
    { label: "Соответствие объекту", weight: Math.max(10, 25 - 5 * check.limitations.length), max: 25 },
    {
      label: "Цена относительно бюджета",
      weight:
        budget !== undefined && Number.isFinite(unitPrice) && budget > 0
          ? Math.round(Math.max(0, Math.min(1, 1 - unitPrice / budget)) * 20)
          : 10,
      max: 20,
    },
    {
      label: "Полнота и подтверждённость данных",
      weight: Math.round((completeness / 100) * (solution.confidence === "confirmed" ? 1 : 0.7) * 15),
      max: 15,
    },
    { label: "Российский производитель", weight: solution.country === "Россия" ? 10 : 4, max: 10 },
  ];
  const score = factors.reduce((sum, factor) => sum + factor.weight, 0);

  const status: SelectionStatus = check.blockers.length
    ? "excluded"
    : check.unresolved > 0 || solution.maturity !== "operation"
      ? "needs-review"
      : "recommended";

  return {
    solutionId: solution.id,
    status,
    score: status === "excluded" ? 0 : score,
    factors,
    reasons: check.reasons,
    limitations: check.limitations,
    missing: check.missing,
    blockers: check.blockers,
  };
}

const STATUS_ORDER: Record<SelectionStatus, number> = { recommended: 0, "needs-review": 1, excluded: 2 };

/**
 * Пропущенные в запросе параметры берутся из значений по умолчанию паспорта:
 * подбор в гостевом демо работает без ввода данных (ТЗ 2.1.1).
 */
export function selectSolutions(input: {
  objectType: string;
  parameters: Params;
  solutions: CatalogSolution[];
  fields: ParameterFieldLike[];
}): SelectionResult {
  const params: Params = {};
  for (const field of input.fields) {
    if (field.defaultValue !== undefined) params[field.id] = field.defaultValue;
  }
  Object.assign(params, input.parameters);
  const knownFields = new Set(input.fields.map((field) => field.id));

  const items = input.solutions
    .filter((solution) => solution.objectTypes?.includes(input.objectType))
    .map((solution) => evaluateSolution(solution, input.objectType, params, knownFields))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.score - a.score);

  return {
    objectType: input.objectType,
    rulesVersion: SELECTION_RULES_VERSION,
    summary: {
      recommended: items.filter((item) => item.status === "recommended").length,
      needsReview: items.filter((item) => item.status === "needs-review").length,
      excluded: items.filter((item) => item.status === "excluded").length,
    },
    items,
  };
}
