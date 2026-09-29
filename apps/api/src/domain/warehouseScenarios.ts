/**
 * Генератор сценариев склада: из подходящих объекту решений каталога собирает
 * несколько цепочек «зоны и связи» (warehouseEconomics.ts) и считает каждую той
 * же экономикой, что и отчёт. Пользователь сравнивает варианты и берёт один.
 */
import type { CatalogSolution } from "./catalog.js";
import { calculateEconomics } from "./economics.js";
import { selectSolutions, type ParameterFieldLike } from "./selection.js";
import type { Assignment, SlotId } from "./warehouseEconomics.js";

export interface ScenarioVariant {
  id: string;
  title: string;
  description: string;
  assignments: Assignment[];
  solutionIds: string[];
  capexMln: number;
  paybackYears: number | null;
  roiPct: number | null;
  effectMlnPerYear: number;
  tcoMln: number;
  robots: number;
  /** Самый выгодный по TCO из вариантов. */
  best?: boolean;
}

type Role = "fmr" | "amr" | "conveyor" | "arm" | "sorter" | "cleaner";

const ROLE_TYPES: Record<Role, string[]> = {
  fmr: ["fmr", "stacker"],
  amr: ["amr", "tug", "platform"],
  conveyor: ["conveyor"],
  arm: ["manipulator", "cell"],
  sorter: ["sorter"],
  cleaner: ["cleaner"],
};

interface Template {
  id: string;
  title: string;
  description: string;
  /** Без этих ролей вариант не собирается. */
  roles: Role[];
  /** Эти добавляются, если в подборе есть подходящие (сортер дорог и часто не проходит по бюджету). */
  optional?: Role[];
  slots: (pick: Record<Role, string>) => Assignment[];
}

const optionalSlots = (pick: Partial<Record<Role, string>>): Assignment[] => [
  ...(pick.sorter ? [{ slot: "sorting" as SlotId, solutionId: pick.sorter }] : []),
  ...(pick.cleaner ? [{ slot: "cleaning" as SlotId, solutionId: pick.cleaner }] : []),
];

const both = (solutionId: string): Assignment[] => [
  { slot: "inbound", solutionId },
  { slot: "outbound", solutionId },
];

const TEMPLATES: Template[] = [
  {
    id: "pallet",
    title: "Паллетный склад",
    description: "Беспилотные погрузчики везут паллеты от ворот до стеллажей и обратно.",
    roles: ["fmr"],
    slots: (r) => both(r.fmr),
  },
  {
    id: "conveyor",
    title: "Конвейер + погрузчики",
    description: "Конвейерные линии от ворот до зоны хранения, погрузчики — последние метры до стеллажа.",
    roles: ["conveyor", "fmr"],
    slots: (r) => [...both(r.conveyor), ...both(r.fmr)],
  },
  {
    id: "goods-to-person",
    title: "Товар к человеку",
    description: "AMR подвозят груз, роборуки собирают заказы, сортер раскладывает по направлениям.",
    roles: ["amr", "arm"],
    optional: ["sorter"],
    slots: (r) => [...both(r.amr), { slot: "picking", solutionId: r.arm }, ...optionalSlots({ sorter: r.sorter })],
  },
  {
    id: "full",
    title: "Полная автоматизация",
    description: "Конвейеры и погрузчики на приёмке и отгрузке, роборуки на отборе, сортер и уборка.",
    roles: ["conveyor", "fmr", "arm"],
    optional: ["sorter", "cleaner"],
    slots: (r) => [...both(r.conveyor), ...both(r.fmr), { slot: "picking", solutionId: r.arm }, ...optionalSlots(r)],
  },
];

export function generateWarehouseScenarios(input: {
  parameters: Record<string, string>;
  fields: ParameterFieldLike[];
  solutions: CatalogSolution[];
}): ScenarioVariant[] {
  const selection = selectSolutions({ objectType: "warehouse", ...input });
  const byId = new Map(input.solutions.map((s) => [s.id, s]));
  // Лучший по баллу подбора среди подходящих (исключённые не берём), с ценой.
  const bestOf = (role: Role) =>
    selection.items.find((item) => {
      const s = byId.get(item.solutionId);
      return item.status !== "excluded" && s && ROLE_TYPES[role].includes(s.solutionType ?? "") && (s.costs?.equipment ?? Number(s.price)) > 0;
    })?.solutionId;
  const picks = Object.fromEntries((Object.keys(ROLE_TYPES) as Role[]).map((role) => [role, bestOf(role)])) as Record<Role, string | undefined>;

  const variants: ScenarioVariant[] = [];
  for (const template of TEMPLATES) {
    if (template.roles.some((role) => !picks[role])) continue;
    const assignments = template.slots(picks as Record<Role, string>);
    const solutionIds = [...new Set(assignments.map((a) => a.solutionId))];
    const solutions = solutionIds.map((id) => byId.get(id)!);
    const result = calculateEconomics({
      objectType: "warehouse",
      parameters: input.parameters,
      fields: input.fields,
      solution: solutions[0]!,
      solutions,
      assignments,
    });
    const num = (text: string) => Number(text.replace(/\s/g, "").replace(",", "."));
    const purchase = result.scenarios.find((s) => s.id === "purchase");
    variants.push({
      id: template.id,
      title: template.title,
      description: template.description,
      assignments,
      solutionIds,
      capexMln: num(result.capex.value),
      paybackYears: result.payback.value === "—" ? null : num(result.payback.value),
      roiPct: result.roi.value === "—" ? null : num(result.roi.value.replace("%", "")),
      effectMlnPerYear: result.opexSaving.series[0] ?? 0,
      tcoMln: purchase?.tco ?? result.totalTco,
      robots: result.robots.count,
    });
  }
  const best = variants.reduce<ScenarioVariant | null>((a, v) => (!a || v.tcoMln < a.tcoMln ? v : a), null);
  if (best) best.best = true;
  return variants;
}
