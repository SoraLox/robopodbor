/**
 * Помощник по экономике расчёта: отвечает на вопросы простым языком по цифрам
 * конкретного расчёта. С ключом GROQ_API_KEY — модель на Groq (цифры расчёта
 * передаются ей в инструкции); без ключа, при лимите или сбое — встроенные
 * ответы по тем же цифрам.
 */

export interface EconomicsContext {
  objectTitle?: string;
  meta?: string;
  horizonYears: number;
  capexMln: number;
  totalInvestmentMln: number;
  effectYearMln: number;
  paybackYears: number | null;
  discountedPaybackYears: number | null;
  npvMln: number;
  irrPct: number | null;
  roiPct: number | null;
  discountRatePct: number;
  salvageMln: number;
  netBenefitMln: number;
  /** OPEX роботов в год (обслуживание, ПО, электроэнергия), млн ₽. */
  opexYearMln?: number;
  robots: Array<{ name: string; count: number; slot: string }>;
  costGroups: Array<{ title: string; amountMln: number }>;
  levers: Array<{ title: string; savingMln: number }>;
  sensitivity: Array<{ title: string; low: string; high: string }>;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

const fmt = (x: number) => x.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const years = (n: number) => {
  // Дробное число лет — «года»: 0,4 года, 2,5 года.
  if (!Number.isInteger(Math.round(n * 10) / 10)) return 'года';
  const r = Math.round(n);
  return r % 10 === 1 && r % 100 !== 11 ? "год" : r % 10 >= 2 && r % 10 <= 4 && (r % 100 < 12 || r % 100 > 14) ? "года" : "лет";
};

const SLOT_TITLE: Record<string, string> = {
  inbound: "приёмка",
  outbound: "отгрузка",
  picking: "отбор",
  sorting: "сортировка",
  cleaning: "уборка",
};

function paybackText(c: EconomicsContext): string {
  if (c.paybackYears === null) return `За ${c.horizonYears} ${years(c.horizonYears)} вложения не возвращаются: экономия в год меньше, чем нужно.`;
  return `Вложения ${fmt(c.totalInvestmentMln)} млн ₽ вернутся примерно через ${fmt(c.paybackYears)} ${years(c.paybackYears)}: каждый год роботы экономят около ${fmt(c.effectYearMln)} млн ₽.`;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
/** Доли как в WAREHOUSE_NORMS — для грубой оценки CAPEX на +1 единицу. */
const EXTRA_IMPL_SHARE = 0.15;
const EXTRA_RESERVE_RATIO = 0.05;

type CapexUnitLine = { count: number; name: string; totalMln: number; unitMln: number; slotHint: string };

/** Строки вида «3 × AK-2000-2 — приёмка: 8,8 млн» из разбивки CAPEX в досье. */
export function parseCapexUnitLines(details: string): CapexUnitLine[] {
  if (!details) return [];
  // Имя может содержать дефисы (AK-2000-2) — разделитель слота: пробел + тире/длинное тире.
  const re = /(\d+)\s*[×x]\s*(.+?)\s+[—\-]\s*([^:\n]+):\s*([\d\s]+(?:[.,]\d+)?)\s*млн/gi;
  const out: CapexUnitLine[] = [];
  for (const m of details.matchAll(re)) {
    const count = Number(m[1]);
    const name = (m[2] ?? "").trim();
    const slotHint = (m[3] ?? "").trim().toLowerCase();
    const totalMln = Number(String(m[4] ?? "").replace(/\s/g, "").replace(",", "."));
    if (!(count > 0) || !name || !Number.isFinite(totalMln) || totalMln <= 0) continue;
    out.push({
      count,
      name,
      totalMln,
      unitMln: round1(totalMln / count),
      slotHint,
    });
  }
  return out;
}

function asksExtraUnitQuestion(q: string): boolean {
  const unit =
    q.includes("погрузчик") ||
    q.includes("штабел") ||
    q.includes("амр") ||
    q.includes("amr") ||
    (q.includes("робот") && /ещё|еще|добав|куп|лишн|плюс|\+1|один/.test(q));
  return unit && /ещё|еще|добав|куп|лишн|плюс|\+1|если|будет/.test(q);
}

function pickCapexUnitLine(q: string, robots: EconomicsContext["robots"], lines: CapexUnitLine[]): CapexUnitLine | null {
  if (!lines.length) return null;
  const loaderSlots = new Set(["inbound", "outbound"]);
  const loaderNames = new Set(robots.filter((r) => loaderSlots.has(r.slot)).map((r) => r.name.toLowerCase()));
  const wantsLoader = q.includes("погрузчик") || q.includes("штабел");
  const byName = (line: CapexUnitLine) => {
    const n = line.name.toLowerCase();
    return robots.find((r) => n.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(n));
  };

  if (wantsLoader) {
    const loaders = lines.filter((line) => {
      const robot = byName(line);
      if (robot && loaderSlots.has(robot.slot)) return true;
      return /при[её]мк|отгруз|погруз|loader|транспортер|транспортёр/i.test(`${line.slotHint} ${line.name}`);
    });
    if (loaders.length) return loaders[0]!;
    // Имя из парка приёмки/отгрузки, даже если в CAPEX слот написан иначе.
    const named = lines.find((line) => loaderNames.has(line.name.toLowerCase()) || [...loaderNames].some((n) => line.name.toLowerCase().includes(n)));
    if (named) return named;
  }

  for (const r of robots) {
    if (q.includes(r.name.toLowerCase())) {
      const hit = lines.find((line) => line.name.toLowerCase().includes(r.name.toLowerCase()));
      if (hit) return hit;
    }
  }
  return lines[0] ?? null;
}

/**
 * Грубая оценка «+1 единица» при том же потоке: цена из разбивки CAPEX,
 * экономия ФОТ почти не растёт, OPEX чуть растёт, окупаемость удлиняется.
 */
export function estimateExtraUnitAnswer(question: string, c: EconomicsContext, details = ""): string | null {
  const q = question.toLowerCase();
  if (!asksExtraUnitQuestion(q)) return null;

  const lines = parseCapexUnitLines(details);
  const picked = pickCapexUnitLine(q, c.robots, lines);
  const totalRobots = c.robots.reduce((sum, r) => sum + r.count, 0);
  const list = c.robots.map((r) => `${r.count} × ${r.name} (${SLOT_TITLE[r.slot] ?? r.slot})`).join(", ") || "парк не указан";

  let unitEquip: number;
  let modelName: string;
  let currentOfModel: number;

  if (picked) {
    unitEquip = picked.unitMln;
    modelName = picked.name;
    currentOfModel = c.robots
      .filter((r) => {
        const n = r.name.toLowerCase();
        const p = picked.name.toLowerCase();
        return n.includes(p) || p.includes(n);
      })
      .reduce((sum, r) => sum + r.count, 0);
    if (currentOfModel <= 0) currentOfModel = picked.count;
  } else if (totalRobots > 0 && c.capexMln > 0) {
    // Нет строк CAPEX — грубо делим CAPEX на весь парк.
    unitEquip = round1(c.capexMln / totalRobots);
    modelName = q.includes("погрузчик")
      ? c.robots.find((r) => r.slot === "inbound" || r.slot === "outbound")?.name ?? "робот"
      : c.robots[0]?.name ?? "робот";
    currentOfModel = c.robots.filter((r) => r.name === modelName).reduce((sum, r) => sum + r.count, 0) || totalRobots;
  } else {
    return null;
  }

  const deltaCapex = round1(unitEquip * (1 + EXTRA_IMPL_SHARE) * (1 + EXTRA_RESERVE_RATIO));
  const deltaOpex =
    c.opexYearMln !== undefined && totalRobots > 0 ? round1(c.opexYearMln / totalRobots) : 0;
  const newInvest = round1(c.totalInvestmentMln + deltaCapex);
  const newEffect = round1(c.effectYearMln - deltaOpex);
  const newPayback = newEffect > 0 ? round1(newInvest / newEffect) : null;
  const nextCount = currentOfModel + 1;
  const paybackNow =
    c.paybackYears === null ? "не окупается за горизонт" : `${fmt(c.paybackYears)} ${years(c.paybackYears)}`;
  const paybackNext =
    newPayback === null ? "может не окупиться за горизонт" : `~${fmt(newPayback)} ${years(newPayback)}`;

  return [
    `Один ${modelName} в разбивке CAPEX — около ${fmt(unitEquip)} млн ₽ (оборудование).`,
    `Если добавить ${nextCount}-й при том же потоке, вложения вырастут примерно на ${fmt(deltaCapex)} млн ₽ (оборудование + доля внедрения и резерва): с ${fmt(c.totalInvestmentMln)} до ~${fmt(newInvest)} млн ₽.`,
    deltaOpex > 0
      ? `Годовая экономия почти не вырастет — парк уже под поток, а OPEX парка чуть вырастет (~${fmt(deltaOpex)} млн ₽/год), поэтому окупаемость удлинится с ${paybackNow} до ${paybackNext}.`
      : `Годовая экономия почти не вырастет (парк уже под поток), поэтому окупаемость удлинится с ${paybackNow} до ${paybackNext}.`,
    `Сейчас в расчёте: ${list}. Если без лишней единицы не хватает мощности — уточните в 3D-симуляции (Задания → «Добавить робота в расчёт»).`,
  ].join(" ");
}

/** Тип вопроса — чтобы не отвечать чувствительностью на «погрузчик» и паспортом на «склад». */
export type EconomicsIntent =
  | "extra_unit"
  | "npv"
  | "irr"
  | "roi"
  | "payback"
  | "salvage"
  | "opex"
  | "capex"
  | "sensitivity"
  | "fleet"
  | "passport"
  | "cashflow"
  | "summary"
  | "open";

/**
 * Убирает «обёртку» вроде «я тебя спрашиваю», чтобы классификация и модель
 * видели суть вопроса, а не мета-фразу.
 */
export function stripQuestionNoise(question: string): string {
  let q = question.trim().replace(/\s+/g, " ");
  q = q.replace(
    /^(?:ну\s+|слушай\s+|пожалуйста\s+|скажи(?:\s+мне)?\s+|ответь(?:\s+мне)?\s+|подскажи\s+|объясни\s+мне\s+|я\s+(?:тебя\s+)?спрашиваю\s+|я\s+спрашиваю\s+|вопрос[:\s]+)+/i,
    "",
  );
  q = q.replace(/^(?:а\s+)?(?:что|как)\s+насчёт\s+/i, "что будет с ");
  return q.trim() || question.trim();
}

/** Краткая задача для модели — что именно нужно ответить. */
export function taskForIntent(intent: EconomicsIntent, question: string): string {
  switch (intent) {
    case "extra_unit":
      return "Оцени экономический эффект от добавления ещё одной единицы техники (погрузчик/робот): насколько вырастут вложения и OPEX, изменится ли годовая экономия и окупаемость при том же потоке. Не паспорт склада и не общий ±20%.";
    case "npv":
      return "Объясни NPV этого расчёта и назови цифру из блока ЦИФРЫ.";
    case "irr":
      return "Объясни IRR этого расчёта и назови цифру из блока ЦИФРЫ.";
    case "roi":
      return "Объясни ROI этого расчёта и назови цифру из блока ЦИФРЫ.";
    case "payback":
      return "Объясни, почему окупаемость именно такая: срок + связь с вложениями и годовой экономией.";
    case "salvage":
      return "Объясни остаточную стоимость роботов в этом расчёте.";
    case "opex":
      return "Что снизит операционные расходы (OPEX) парка — по рычагам из расчёта.";
    case "capex":
      return "Из чего складываются затраты/CAPEX — по разбивке из расчёта, списком.";
    case "sensitivity":
      return "Что будет с окупаемостью при изменении указанного фактора (зарплаты/цены и т.п.) — по чувствительности ±20%.";
    case "fleet":
      return "Какой парк роботов в расчёте: модели, число, участки.";
    case "passport":
      return "Кратко по паспорту склада — только то, о чём спросили, без лишнего.";
    case "cashflow":
      return "Покажи денежный поток по годам из расчёта.";
    case "summary":
      return "Объясни экономику расчёта простыми словами: вложения, экономия в год, окупаемость, итог.";
    case "open":
      return `Ответь точно на вопрос пользователя: «${question}». Если вопрос не про экономику этого расчёта — так и скажи.`;
  }
}

export function classifyEconomicsQuestion(question: string): EconomicsIntent {
  const q = stripQuestionNoise(question).toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (asksExtraUnitQuestion(q)) return "extra_unit";
  if (has("npv", "приведен", "приведён") || (has("чистая") && has("стоимост", "прибыл", "ценност"))) return "npv";
  if (has("irr") || (has("доходност") && !has("roi"))) return "irr";
  if (has("roi") || (has("рентабельн") && has("инвест", "вложен"))) return "roi";
  if (has("окуп", "payback") || has("вернут", "вернёт") || (has("почему") && has("быстр", "долг", "так"))) return "payback";
  if (has("остаточ", "salvage") || (has("продать") && has("конец", "горизонт", "срок"))) return "salvage";
  if (has("opex") || has("рычаг") || (has("снизит", "сократить", "сэконом") && has("операц", "расход", "затрат", "содержан"))) return "opex";
  if (
    (has("разбив", "из чего", "статьи", "структур") && has("capex", "капекс", "вложен", "затрат", "стоимост")) ||
    has("capex", "капекс") ||
    (has("из чего") && has("склад", "затрат", "вложен", "стоимост"))
  ) {
    return "capex";
  }
  if (
    has("чувствит", "риск") ||
    has("зарплат") ||
    (has("вырастет", "упадёт", "упадет", "подорож", "подешев") &&
      has("цена", "оборуд", "робот", "сервис", "электрич", "труд", "персонал", "оператор"))
  ) {
    return "sensitivity";
  }
  if (has("паспорт", "параметр склада", "данные склада", "исходные данные")) return "passport";
  if (has("денежн") || (has("по годам") && has("поток", "кэш", "cash"))) return "cashflow";
  if (has("парк", "состав") || (has("сколько") && has("робот", "погрузчик")) || (has("какие") && has("робот"))) return "fleet";
  if (has("объясни", "простыми", "простыми словами", "расскажи экономик", "коротко про") || (has("экономик") && has("прост", "объясн", "расскаж"))) {
    return "summary";
  }
  if (has("робот", "погрузчик") && !has("если", "добав", "куп", "ещё", "еще")) return "fleet";
  return "open";
}

function sectionOf(details: string, title: string): string {
  const start = details.indexOf(title);
  if (start < 0) return "";
  const end = details.indexOf("\n\n", start);
  return details.slice(start, end < 0 ? undefined : end).trim();
}

function summaryAnswer(c: EconomicsContext): string {
  return [
    `Коротко: вкладываете ${fmt(c.totalInvestmentMln)} млн ₽, роботы экономят около ${fmt(c.effectYearMln)} млн ₽ в год.`,
    paybackText(c),
    `За ${c.horizonYears} ${years(c.horizonYears)} проект даёт ${fmt(c.netBenefitMln)} млн ₽ сверх вложений.`,
    "Можно спросить: что такое NPV, почему такая окупаемость, из чего складываются затраты, что снизит OPEX, что будет, если вырастут зарплаты.",
  ].join(" ");
}

/** Структурированный ответ по теме вопроса. Для `open` — краткое резюме (не дамп досье). */
export function structuredEconomicsAnswer(question: string, c: EconomicsContext, details = ""): string {
  const intent = classifyEconomicsQuestion(question);

  if (intent === "extra_unit") {
    return estimateExtraUnitAnswer(question, c, details) ?? summaryAnswer(c);
  }
  if (intent === "passport" && details) {
    const part = sectionOf(details, "ПАСПОРТ СКЛАДА");
    if (part) return part.replace(/^- /gm, "— ").split("\n").slice(0, 16).join("\n");
  }
  if (intent === "cashflow" && details) {
    const part = sectionOf(details, "ДЕНЕЖНЫЙ ПОТОК");
    if (part) return part.replace(/^- /gm, "— ");
  }
  if (intent === "capex") {
    if (details) {
      const breakdown = sectionOf(details, "РАЗБИВКА CAPEX");
      if (breakdown) {
        const lines = breakdown
          .split("\n")
          .filter((l) => /^[-—·]/.test(l.trim()) || /^\d+\s*[×x]/i.test(l.trim()))
          .slice(0, 12)
          .map((l) => l.replace(/^[-·]\s*/, "— ").trim());
        if (lines.length) {
          return [`CAPEX ${fmt(c.capexMln)} млн ₽ складывается из:`, ...lines].join("\n");
        }
      }
      const tco = sectionOf(details, "СТАТЬИ СТОИМОСТИ ВЛАДЕНИЯ");
      if (tco && /разбив|статьи|структур|из чего/.test(question.toLowerCase())) {
        return tco.replace(/^- /gm, "— ");
      }
    }
    const top = [...c.costGroups].sort((a, b) => b.amountMln - a.amountMln).slice(0, 3).map((g) => `${g.title} — ${fmt(g.amountMln)} млн ₽`).join("; ");
    return `CAPEX ${fmt(c.capexMln)} млн ₽ — разовые вложения: покупка роботов и внедрение. Всего с заменами по сроку службы — ${fmt(c.totalInvestmentMln)} млн ₽. Крупнее всего в стоимости владения: ${top}.`;
  }
  if (intent === "npv") {
    return [
      `NPV — сколько проект заработает за ${c.horizonYears} ${years(c.horizonYears)} в сегодняшних деньгах. Будущие рубли «дешевле» сегодняшних, поэтому каждый год пересчитывается по ставке ${fmt(c.discountRatePct)}%.`,
      c.npvMln >= 0
        ? `Здесь NPV ${fmt(c.npvMln)} млн ₽ — больше нуля: проект выгоднее, чем держать деньги под ${fmt(c.discountRatePct)}% годовых.`
        : `Здесь NPV ${fmt(c.npvMln)} млн ₽ — меньше нуля: при ставке ${fmt(c.discountRatePct)}% проект не окупает стоимость денег.`,
    ].join(" ");
  }
  if (intent === "irr") {
    return c.irrPct === null
      ? "IRR не считается: денежный поток проекта не меняет знак (вложения не возвращаются за горизонт)."
      : `IRR ${Math.round(c.irrPct)}% — доходность проекта в процентах годовых. Сравните со ставкой кредита или вклада: если IRR выше, вкладываться в роботов выгоднее. Ставка в расчёте — ${fmt(c.discountRatePct)}%.`;
  }
  if (intent === "roi") {
    return c.roiPct === null
      ? "ROI не считается для этого расчёта."
      : `ROI ${fmt(c.roiPct)}% в год — чистая прибыль на вложенный рубль за вычетом CAPEX, усреднённая на год горизонта (${c.horizonYears} ${years(c.horizonYears)}): на 1 ₽ вложений — около ${fmt(c.roiPct / 100)} ₽ чистой прибыли ежегодно.`;
  }
  if (intent === "payback") {
    const disc =
      c.discountedPaybackYears === null
        ? ""
        : ` С учётом стоимости денег (ставка ${fmt(c.discountRatePct)}%) — через ${fmt(c.discountedPaybackYears)} ${years(c.discountedPaybackYears)}.`;
    return paybackText(c) + disc;
  }
  if (intent === "salvage") {
    return `Остаточная стоимость ${fmt(c.salvageMln)} млн ₽ — сколько будут стоить роботы на конец ${c.horizonYears}-го года. Их можно продать или работать на них дальше, поэтому она учтена как возврат в последнем году.`;
  }
  if (intent === "opex") {
    if (!c.levers.length) return "Отдельных рычагов снижения операционных затрат для этого расчёта нет.";
    const top = c.levers.slice(0, 3).map((l) => `«${l.title}» — до ${fmt(l.savingMln)} млн ₽ в год`).join("; ");
    return `OPEX — расходы на содержание роботов каждый год: обслуживание, электричество, ПО. Сильнее всего их снизят: ${top}.`;
  }
  if (intent === "sensitivity") {
    if (!c.sensitivity.length) return "Анализа чувствительности для этого расчёта нет.";
    const top = c.sensitivity.slice(0, 3).map((s) => `${s.title} — ${s.low}, ${s.high}`).join("; ");
    return `Окупаемость при изменении факторов на 20%: ${top}. Рост зарплат замещаемых сотрудников ускоряет окупаемость, удорожание роботов — замедляет.`;
  }
  if (intent === "fleet") {
    const list = c.robots.map((r) => `${r.count} × ${r.name} (${SLOT_TITLE[r.slot] ?? r.slot})`).join(", ");
    return `В расчёте: ${list}. Число роботов посчитано под ваш поток грузов; поправить его можно в симуляции через панель «Задания».`;
  }
  return summaryAnswer(c);
}

/** Чипы в начале чата — единственные «готовые» вопросы; ответы на них тоже даёт ИИ. */
export const SUGGESTED_QUESTIONS = [
  "Объясни экономику простыми словами",
  "Почему окупаемость именно такая?",
  "Что такое NPV и IRR?",
  "Из чего складываются затраты?",
  "Что снизит операционные расходы?",
  "Что будет, если вырастут зарплаты?",
] as const;

const normalizeQuestion = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

export function isSuggestedQuestion(question: string): boolean {
  const n = normalizeQuestion(question);
  return SUGGESTED_QUESTIONS.some((q) => normalizeQuestion(q) === n);
}

/** Запасные формулировки для чипов, если ИИ недоступен — 3 варианта на вопрос, один смысл. */
function suggestedFallbackVariants(c: EconomicsContext): Record<string, string[]> {
  const pay =
    c.paybackYears === null ? "за горизонт не окупается" : `примерно за ${fmt(c.paybackYears)} ${years(c.paybackYears)}`;
  const irr = c.irrPct === null ? "не считается" : `${Math.round(c.irrPct)}%`;
  const salary = c.sensitivity.find((s) => /зарплат/i.test(s.title));
  const salaryLine = salary ? `${salary.title}: ${salary.low}; ${salary.high}` : "см. блок чувствительности в отчёте";
  const levers =
    c.levers.length > 0
      ? c.levers
          .slice(0, 3)
          .map((l) => `— ${l.title}: до ${fmt(l.savingMln)} млн ₽/год`)
          .join("\n")
      : "— отдельных рычагов в этом расчёте нет";
  const costs =
    c.costGroups.length > 0
      ? c.costGroups
          .slice(0, 4)
          .map((g) => `— ${g.title}: ${fmt(g.amountMln)} млн ₽`)
          .join("\n")
      : `— CAPEX: ${fmt(c.capexMln)} млн ₽`;

  return {
    [normalizeQuestion(SUGGESTED_QUESTIONS[0])]: [
      `Коротко по вашему расчёту.\n\nВкладываете ${fmt(c.totalInvestmentMln)} млн ₽, роботы экономят около ${fmt(c.effectYearMln)} млн ₽ в год.\nОкупаемость — ${pay}.\nЗа ${c.horizonYears} ${years(c.horizonYears)} сверх вложений выходит около ${fmt(c.netBenefitMln)} млн ₽.`,
      `Смысл такой:\n\n— вложения: ${fmt(c.totalInvestmentMln)} млн ₽;\n— экономия в год: ~${fmt(c.effectYearMln)} млн ₽;\n— срок возврата: ${pay}.\n\nИтого за горизонт — около ${fmt(c.netBenefitMln)} млн ₽ сверх того, что вложили.`,
      `Если без терминов: купили роботов за ${fmt(c.totalInvestmentMln)} млн ₽, они каждый год «возвращают» около ${fmt(c.effectYearMln)} млн ₽ за счёт зарплат, которые больше не платите.\nПоэтому деньги возвращаются ${pay}.`,
    ],
    [normalizeQuestion(SUGGESTED_QUESTIONS[1])]: [
      `Окупаемость ${pay}, потому что годовая экономия (~${fmt(c.effectYearMln)} млн ₽) быстро закрывает вложения ${fmt(c.totalInvestmentMln)} млн ₽.\n\nЭто зарплаты замещаемых сотрудников минус обслуживание и электричество роботов.`,
      `Срок такой не случайно.\n\nВложения: ${fmt(c.totalInvestmentMln)} млн ₽\nЭкономия в год: ~${fmt(c.effectYearMln)} млн ₽\n\nЧем больше экономия относительно вложений, тем короче окупаемость — здесь как раз ${pay}.`,
      `Почему ${pay}: роботы экономят около ${fmt(c.effectYearMln)} млн ₽ в год при вложениях ${fmt(c.totalInvestmentMln)} млн ₽.\nНакопленная экономия довольно быстро догоняет CAPEX.`,
    ],
    [normalizeQuestion(SUGGESTED_QUESTIONS[2])]: [
      `NPV и IRR — два взгляда на ту же экономику.\n\n— NPV ${fmt(c.npvMln)} млн ₽: сколько проект даст в сегодняшних деньгах (ставка ${fmt(c.discountRatePct)}%).\n— IRR ${irr}: доходность в % годовых.\n\nЕсли NPV > 0 и IRR выше стоимости денег — проект выглядит выгоднее «просто держать деньги».`,
      `Простыми словами:\n\nNPV (${fmt(c.npvMln)} млн ₽) — итог в сегодняшних рублях.\nIRR (${irr}) — «ставка», которую проект зарабатывает сам.\n\nСтавка в расчёте — ${fmt(c.discountRatePct)}%.`,
      `NPV = ${fmt(c.npvMln)} млн ₽ — это уже с учётом того, что будущие деньги дешевле сегодняшних.\nIRR = ${irr} — удобно сравнивать с кредитом или вкладом.`,
    ],
    [normalizeQuestion(SUGGESTED_QUESTIONS[3])]: [
      `Затраты в расчёте (крупнее всего):\n\n${costs}\n\nCAPEX целиком — ${fmt(c.capexMln)} млн ₽, все вложения с заменами — ${fmt(c.totalInvestmentMln)} млн ₽.`,
      `Из чего складывается:\n\n${costs}\n\nРазовые вложения (CAPEX) — ${fmt(c.capexMln)} млн ₽.`,
      `По стоимости владения основные статьи такие:\n\n${costs}`,
    ],
    [normalizeQuestion(SUGGESTED_QUESTIONS[4])]: [
      `Сильнее всего OPEX снизят:\n\n${levers}\n\nOPEX — это ежегодное содержание роботов: сервис, ПО, электричество.`,
      `Чтобы уменьшить операционные расходы парка:\n\n${levers}`,
      `Рычаги по этому расчёту:\n\n${levers}`,
    ],
    [normalizeQuestion(SUGGESTED_QUESTIONS[5])]: [
      `Если зарплаты замещаемых сотрудников вырастут, окупаемость обычно ускоряется: роботы замещают как раз этот ФОТ.\n\nВ чувствительности (±20%):\n${salaryLine}`,
      `Рост зарплат → больше экономия от роботов → короче срок возврата.\n\nПо отчёту:\n${salaryLine}`,
      `При более дорогом ручном труде проект становится выгоднее.\n\nОриентир из чувствительности:\n${salaryLine}`,
    ],
  };
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Запасной ответ без ИИ: для чипов — случайный вариант формулировки;
 * иначе — краткая структура по теме (только если модель недоступна).
 */
export function localAnswer(question: string, c: EconomicsContext, details = ""): string {
  const variants = suggestedFallbackVariants(c)[normalizeQuestion(question)];
  if (variants?.length) return pickRandom(variants);
  return structuredEconomicsAnswer(question, c, details);
}

/** Ответ модели — дамп паспорта / чужая ветка, не по вопросу. */
export function looksOffTopicAnswer(answer: string, question: string): boolean {
  const a = answer.toLowerCase();
  const q = question.toLowerCase();
  if (/паспорт склада|общие параметры объекта|площадь активной/.test(a) && !/паспорт|параметр|исходн/.test(q)) return true;
  // Старый шаблон чувствительности целиком — не то, что просил пользователь.
  if (/окупаемость при изменении факторов на 20%/.test(a) && !/зарплат|чувствит|риск|вырастет|упад/.test(q)) return true;
  return false;
}

/** Для модели — только нужные куски досье, без паспорта (он провоцирует дамп). */
export function detailsForModel(details: string, intent: EconomicsIntent): string {
  if (!details) return "";
  if (intent === "passport") return sectionOf(details, "ПАСПОРТ СКЛАДА") || details.slice(0, 4000);
  // Порядок = приоритет внимания модели.
  let keep = ["ПАРК РОБОТОВ", "РАЗБИВКА CAPEX", "ДЕНЕЖНЫЙ ПОТОК", "РЫЧАГИ СНИЖЕНИЯ OPEX", "ДОПУЩЕНИЯ РАСЧЁТА"];
  if (intent === "extra_unit" || intent === "capex" || intent === "fleet") {
    keep = ["РАЗБИВКА CAPEX", "ПАРК РОБОТОВ", "ДОПУЩЕНИЯ РАСЧЁТА"];
  } else if (intent === "cashflow") {
    keep = ["ДЕНЕЖНЫЙ ПОТОК", "ПАРК РОБОТОВ", "РАЗБИВКА CAPEX"];
  } else if (intent === "opex") {
    keep = ["OPEX РОБОТОВ", "РЫЧАГИ СНИЖЕНИЯ OPEX", "ПАРК РОБОТОВ"];
  } else if (intent === "sensitivity" || intent === "payback" || intent === "summary") {
    keep = ["ПАРК РОБОТОВ", "РАЗБИВКА CAPEX", "РЫЧАГИ СНИЖЕНИЯ OPEX"];
  }
  const parts = keep.map((t) => sectionOf(details, t)).filter(Boolean);
  const text = parts.join("\n\n").trim();
  return (text || details).slice(0, 8000);
}

// ─── Модель на Groq ───────────────────────────────────────────────────────
// Короткий system: длинный промпт размывает вопрос. Суть вопроса — в user-сообщении.
const SYSTEM = `Ты — ИИ-консультант по экономике роботизации склада (РОБОПОДБОР).

ГЛАВНОЕ: сначала пойми вопрос пользователя (блок «ЗАДАЧА» в сообщении), потом ответь именно на него. Не подменяй тему паспортом склада, общим обзором или соседним KPI.

Опора: только «ЦИФРЫ РАСЧЁТА», «ПОДРОБНОСТИ» и «ОЦЕНКА +1 ЕДИНИЦА» (если есть). Не выдумывай цифры и не проси прислать данные.

Смысл показателей: CAPEX — разовые вложения; экономия в год = ФОТ замещаемых − OPEX роботов; окупаемость — когда экономия покроет вложения; ROI / год — чистая выгода за вычетом CAPEX, усреднённая на год; NPV/IRR — из цифр расчёта. Зарплаты выше → окупаемость короче. Лишний робот при том же потоке → CAPEX↑, экономия почти та же → окупаемость обычно длиннее.

Формат: по-русски; 4–12 строк; первая фраза — прямой ответ по сути; абзацы и списки «— »; без markdown (#,**), без простыни и без дампа досье. Можно чуть варьировать формулировку, смысл тот же.`

const contextText = (c: EconomicsContext) => {
  const yr = (x: number | null) => (x === null ? "не окупается за горизонт" : `${fmt(x)} ${years(x)}`);
  return [
    "ЦИФРЫ РАСЧЁТА:",
    c.objectTitle ? `Объект: ${c.objectTitle}${c.meta ? ` (${c.meta})` : ""}` : "",
    `Горизонт: ${c.horizonYears} ${years(c.horizonYears)}; ставка дисконтирования ${fmt(c.discountRatePct)}%`,
    `CAPEX ${fmt(c.capexMln)} млн ₽; вложения всего ${fmt(c.totalInvestmentMln)} млн ₽`,
    `Экономия в первый год ${fmt(c.effectYearMln)} млн ₽ (уже за вычетом OPEX роботов)`,
    c.opexYearMln !== undefined ? `OPEX роботов ${fmt(c.opexYearMln)} млн ₽ в год` : "OPEX роботов в год: нет в данных",
    `Окупаемость ${yr(c.paybackYears)}; дисконтированная ${yr(c.discountedPaybackYears)}`,
    `NPV ${fmt(c.npvMln)} млн ₽; IRR ${c.irrPct === null ? "не считается" : `${Math.round(c.irrPct)}%`}`,
    c.roiPct === null ? "ROI не считается" : `ROI ${fmt(c.roiPct)}% / год — на каждый вложенный рубль ~${fmt(c.roiPct / 100)} ₽ чистой прибыли в год (за вычетом CAPEX)`,
    `Остаточная стоимость ${fmt(c.salvageMln)} млн ₽; итог сверх вложений ${fmt(c.netBenefitMln)} млн ₽`,
    `Роботы: ${c.robots.map((r) => `${r.count} × ${r.name} (${SLOT_TITLE[r.slot] ?? r.slot})`).join("; ") || "нет данных"}`,
    `Стоимость владения по статьям: ${c.costGroups.map((g) => `${g.title} ${fmt(g.amountMln)} млн ₽`).join("; ") || "нет данных"}`,
    `Рычаги снижения OPEX: ${c.levers.map((l) => `${l.title} — до ${fmt(l.savingMln)} млн ₽/год`).join("; ") || "нет"}`,
    `Чувствительность окупаемости (±20%): ${c.sensitivity.map((x) => `${x.title}: ${x.low}…${x.high}`).join("; ") || "нет"}`,
  ]
    .filter(Boolean)
    .join("\n");
};

// Основная модель и запасная: у каждой свои лимиты бесплатного тарифа Groq.
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;

export class GroqLimitError extends Error {
  constructor(public retryAfterS: number) {
    super(`Groq: лимит, повтор через ${retryAfterS} с`);
  }
}

async function callGroq(model: string, messages: Array<{ role: string; content: string }>, apiKey: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      // Ниже — точнее держит задачу; вариативность — за счёт формулировки, не «плавания» темы.
      temperature: 0.35,
      max_completion_tokens: 900,
      reasoning_effort: "medium",
      include_reasoning: false,
    }),
    signal: AbortSignal.timeout(35_000),
  });
  if (response.status === 429) throw new GroqLimitError(Number(response.headers.get("retry-after") ?? 60));
  if (!response.ok) throw new Error(`Groq ${model}: ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Groq ${model}: пустой ответ`);
  // Убираем markdown-разметку, списки «—» и абзацы оставляем.
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/`+/g, "");
}

/** Сообщение пользователя: вопрос + явная задача — модель видит суть до ответа. */
export function buildUserPrompt(question: string, intent: EconomicsIntent): string {
  const clean = stripQuestionNoise(question);
  const task = taskForIntent(intent, clean);
  const variety = isSuggestedQuestion(question)
    ? "Сформулируй свежо (не как заготовку), смысл тот же."
    : "Ответь естественно, по делу.";
  return [
    `ВОПРОС: ${clean}`,
    clean !== question.trim() ? `Исходная формулировка: ${question.trim()}` : "",
    `ЗАДАЧА: ${task}`,
    variety,
    "Первая фраза — прямой ответ на ВОПРОС. Не уходи в другие темы.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Ответ модели Groq: основная модель, при лимите — запасная. */
export async function askGroq(question: string, history: ChatTurn[], context: EconomicsContext, apiKey: string, details = ""): Promise<{ answer: string; model: string }> {
  const intent = classifyEconomicsQuestion(question);
  const trimmed = detailsForModel(details, intent);
  const extraUnit = estimateExtraUnitAnswer(question, context, details);
  // Данные — в system; вопрос и задача — в user (иначе суть тонет в длинном контексте).
  const messages = [
    {
      role: "system",
      content: [
        SYSTEM,
        "",
        contextText(context),
        trimmed ? `\nПОДРОБНОСТИ РАСЧЁТА:\n${trimmed}` : "",
        extraUnit ? `\nОЦЕНКА +1 ЕДИНИЦА (используй эти цифры, если вопрос про добавление единицы):\n${extraUnit}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    // Короткая история — чтобы уточнения работали, но старые ответы не сбивали тему.
    ...history.slice(-4).map((t) => ({ role: t.role, content: t.text.slice(0, 800) })),
    { role: "user", content: buildUserPrompt(question, intent) },
  ];
  let lastError: unknown = null;
  for (const model of GROQ_MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return { answer: await callGroq(model, messages, apiKey), model };
      } catch (error) {
        lastError = error;
        if (error instanceof GroqLimitError) break;
        if (attempt === 1) return Promise.reject(error);
      }
    }
  }
  throw lastError;
}

/**
 * Сначала ИИ (Groq); локальный ответ — только если нет ключа, сбой или явный уход не по теме.
 */
export async function resolveEconomicsAnswer(
  question: string,
  history: ChatTurn[],
  context: EconomicsContext,
  details = "",
  apiKey?: string,
): Promise<{ answer: string; source: "local" | "ai" }> {
  if (apiKey) {
    try {
      const { answer } = await askGroq(question, history, context, apiKey, details);
      if (!looksOffTopicAnswer(answer, question)) return { answer, source: "ai" };
      console.error("[assistant] Ответ модели отклонён как не по теме, запасной ответ");
    } catch (error) {
      console.error("[assistant] Groq недоступен, отвечаем запасным помощником:", error instanceof Error ? error.message : error);
    }
  }
  return { answer: localAnswer(question, context, details), source: "local" };
}
