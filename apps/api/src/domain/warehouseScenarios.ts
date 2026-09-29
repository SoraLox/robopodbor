/**
 * Генератор сценариев склада: из подходящих объекту решений каталога перебирает
 * осмысленные составы «зоны и связи» (warehouseEconomics.ts) — транспорт на
 * приёмке и отгрузке (погрузчики, AMR, конвейер + погрузчики/AMR) и, по желанию,
 * роборуки на отборе, сортер и уборку — и считает каждый той же экономикой, что
 * и отчёт. Наружу — несколько вариантов, у каждого понятная причина выбора:
 * больше всего экономии, быстрее окупается, меньше вложений, полная автоматизация.
 */
import type { CatalogSolution } from "./catalog.js";
import { calculateEconomics, yearsUnit } from "./economics.js";
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
  /** Экономия за горизонт: TCO «как есть» минус TCO варианта, млн ₽. */
  savingMln: number;
  horizonYears: number;
  robots: number;
  /** Чем вариант лучше остальных. */
  highlights: string[];
  /** Больше всего экономии за горизонт. */
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

/** Сколько лучших по баллу подбора моделей роли пробуем в составах. */
const PER_ROLE = 2;

interface Transport {
  id: string;
  label: string;
  flow: string;
  assignments: Assignment[];
}

const both = (solutionId: string): Assignment[] => [
  { slot: "inbound", solutionId },
  { slot: "outbound", solutionId },
];

const fmt = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export function generateWarehouseScenarios(input: {
  parameters: Record<string, string>;
  fields: ParameterFieldLike[];
  solutions: CatalogSolution[];
}): ScenarioVariant[] {
  const selection = selectSolutions({ objectType: "warehouse", ...input });
  const byId = new Map(input.solutions.map((s) => [s.id, s]));
  // Лучшие по баллу подбора среди подходящих (исключённые не берём), с ценой.
  const topOf = (role: Role, limit = PER_ROLE) =>
    selection.items
      .filter((item) => {
        const s = byId.get(item.solutionId);
        return item.status !== "excluded" && s && ROLE_TYPES[role].includes(s.solutionType ?? "") && (s.costs?.equipment ?? Number(s.price)) > 0;
      })
      .slice(0, limit)
      .map((item) => item.solutionId);

  // Транспорт приёмки и отгрузки.
  const transports: Transport[] = [];
  const conveyor = topOf("conveyor", 1)[0];
  const lifters = topOf("fmr");
  for (const id of lifters) {
    transports.push({
      id: `fmr-${id}`,
      label: "Погрузчики",
      flow: "Погрузчики возят паллеты от ворот до стеллажей и обратно.",
      assignments: both(id),
    });
    if (conveyor) {
      transports.push({
        id: `conveyor-fmr-${id}`,
        label: "Конвейер + погрузчики",
        flow: "Конвейер везёт паллеты от ворот до торца стеллажей, погрузчики — последние метры до ячейки.",
        assignments: [...both(conveyor), ...both(id)],
      });
    }
  }
  // Плоский транспортировщик (AMR-платформа) сам груз не берёт — только в паре с
  // погрузчиками: они ставят паллету на него и снимают в стеллаж (челночная схема).
  const lifter = lifters[0];
  if (lifter) {
    for (const id of topOf("amr")) {
      transports.push({
        id: `shuttle-${id}`,
        label: "Погрузчики + AMR",
        flow: "AMR возят паллеты по длинному плечу от ворот до зоны хранения; погрузчики ставят паллету на AMR и снимают её в стеллаж.",
        assignments: [...both(lifter), ...both(id)],
      });
    }
  }
  const arms = topOf("arm");
  const sorter = topOf("sorter", 1)[0];
  const cleaner = topOf("cleaner", 1)[0];

  interface Candidate {
    key: string;
    title: string;
    flow: string[];
    assignments: Assignment[];
    slots: number;
    capexMln: number;
    paybackYears: number | null;
    roiPct: number | null;
    effectMlnPerYear: number;
    tcoMln: number;
    savingMln: number;
    horizonYears: number;
    robots: number;
  }

  const num = (text: string) => Number(text.replace(/\s/g, "").replace(",", ".").replace("%", "").replace("−", "-"));
  const evaluate = (title: string, flow: string[], assignments: Assignment[]): Candidate => {
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
    const tco = (id: string) => result.scenarios.find((s) => s.id === id)?.tco ?? 0;
    const purchase = tco("purchase") || result.totalTco;
    return {
      key: assignments.map((a) => `${a.slot}:${a.solutionId}`).sort().join("|"),
      title,
      flow,
      assignments,
      slots: new Set(assignments.map((a) => a.slot)).size,
      capexMln: num(result.capex.value),
      paybackYears: result.payback.value === "—" ? null : num(result.payback.value),
      roiPct: result.roi.value === "—" ? null : num(result.roi.value),
      effectMlnPerYear: result.opexSaving.series[0] ?? 0,
      tcoMln: purchase,
      savingMln: Math.round((tco("as-is") - purchase) * 10) / 10,
      horizonYears: Number(/\d+/.exec(result.roi.label)?.[0] ?? 7),
      robots: result.robots.count,
    };
  };

  // Перебор составов: транспорт (или без него) × отбор × сортировка × уборка.
  const candidates: Candidate[] = [];
  for (const transport of [null, ...transports]) {
    for (const arm of [null, ...arms]) {
      for (const withSorter of sorter ? [false, true] : [false]) {
        for (const withCleaner of cleaner ? [false, true] : [false]) {
          const assignments: Assignment[] = [...(transport?.assignments ?? [])];
          const parts: string[] = transport ? [transport.label] : [];
          const flow: string[] = transport ? [transport.flow] : [];
          if (arm) {
            assignments.push({ slot: "picking" as SlotId, solutionId: arm });
            parts.push("роборуки");
            flow.push("Роборуки собирают заказы: товар приходит к ним по конвейеру из хранения, отобранное уходит к воротам отгрузки.");
          }
          if (withSorter && sorter) {
            assignments.push({ slot: "sorting", solutionId: sorter });
            parts.push("сортер");
            flow.push("Сортер раскладывает штуки по направлениям.");
          }
          if (withCleaner && cleaner) {
            assignments.push({ slot: "cleaning", solutionId: cleaner });
            parts.push("уборка");
            flow.push("Роботы-уборщики убирают пол.");
          }
          if (!assignments.length) continue;
          const title = parts.map((p, i) => (i === 0 ? p[0]!.toUpperCase() + p.slice(1) : p)).join(" + ");
          candidates.push(evaluate(title, flow, assignments));
        }
      }
    }
  }
  if (!candidates.length) return [];

  // Отбор вариантов с причиной. Окупаемые — с положительной экономикой за горизонт.
  const paying = candidates.filter((c) => c.savingMln > 0 && c.paybackYears !== null);
  const pool = paying.length ? paying : candidates;
  const pickBy = (list: Candidate[], better: (a: Candidate, b: Candidate) => boolean) =>
    list.reduce<Candidate | null>((best, c) => (!best || better(c, best) ? c : best), null);
  const chosen = new Map<string, { candidate: Candidate; highlights: string[] }>();
  const mark = (candidate: Candidate | null, highlight: string) => {
    if (!candidate) return;
    const entry = chosen.get(candidate.key) ?? { candidate, highlights: [] };
    entry.highlights.push(highlight);
    chosen.set(candidate.key, entry);
  };
  const topSaving = pickBy(pool, (a, b) => a.savingMln > b.savingMln);
  mark(topSaving, "Больше всего экономии");
  mark(
    pickBy(pool, (a, b) => (a.paybackYears ?? Infinity) < (b.paybackYears ?? Infinity) || (a.paybackYears === b.paybackYears && a.savingMln > b.savingMln)),
    "Быстрее окупается"
  );
  mark(pickBy(pool, (a, b) => a.capexMln < b.capexMln || (a.capexMln === b.capexMln && a.savingMln > b.savingMln)), "Меньше вложений");
  // Полная автоматизация — больше всего участков под роботами (при равенстве — выгоднее).
  const full = pickBy(candidates, (a, b) => a.slots > b.slots || (a.slots === b.slots && a.savingMln > b.savingMln));
  if (full && (!topSaving || full.slots > topSaving.slots)) mark(full, "Полная автоматизация");

  const order = ["Больше всего экономии", "Быстрее окупается", "Меньше вложений", "Полная автоматизация"];
  return [...chosen.values()]
    .sort((a, b) => order.indexOf(a.highlights[0]!) - order.indexOf(b.highlights[0]!))
    .map(({ candidate: c, highlights }, i) => {
      // Цифры — в карточке; в тексте только как работает и предупреждение, если не окупается.
      const verdict =
        c.savingMln > 0
          ? ""
          : `За ${c.horizonYears} ${yearsUnit(c.horizonYears)} не окупается: роботы дороже замещаемого труда на ${fmt(-c.savingMln)} млн ₽.`;
      return {
        id: `v${i + 1}`,
        title: c.title,
        description: [...c.flow, verdict].filter(Boolean).join(" "),
        assignments: c.assignments,
        solutionIds: [...new Set(c.assignments.map((a) => a.solutionId))],
        capexMln: c.capexMln,
        paybackYears: c.paybackYears,
        roiPct: c.roiPct,
        effectMlnPerYear: c.effectMlnPerYear,
        tcoMln: c.tcoMln,
        savingMln: c.savingMln,
        horizonYears: c.horizonYears,
        robots: c.robots,
        highlights,
        ...(c === topSaving ? { best: true } : {}),
      };
    });
}
