/**
 * Помощник по экономике расчёта: отвечает на вопросы простым языком по цифрам
 * конкретного расчёта. С ключом ANTHROPIC_API_KEY — модель Claude (цифры
 * передаются ей в контексте); без ключа — встроенные ответы по тем же цифрам.
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

/** Ответ без внешней модели: по ключевым словам вопроса, на цифрах расчёта. */
export function localAnswer(question: string, c: EconomicsContext): string {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("npv", "приведен", "приведён", "чистая")) {
    return [
      `NPV — сколько проект заработает за ${c.horizonYears} ${years(c.horizonYears)} в сегодняшних деньгах. Будущие рубли «дешевле» сегодняшних, поэтому каждый год пересчитывается по ставке ${fmt(c.discountRatePct)}%.`,
      c.npvMln >= 0
        ? `Здесь NPV ${fmt(c.npvMln)} млн ₽ — больше нуля: проект выгоднее, чем держать деньги под ${fmt(c.discountRatePct)}% годовых.`
        : `Здесь NPV ${fmt(c.npvMln)} млн ₽ — меньше нуля: при ставке ${fmt(c.discountRatePct)}% проект не окупает стоимость денег.`,
    ].join(" ");
  }
  if (has("irr", "норма", "доходност")) {
    return c.irrPct === null
      ? "IRR не считается: денежный поток проекта не меняет знак (вложения не возвращаются за горизонт)."
      : `IRR ${Math.round(c.irrPct)}% — доходность проекта в процентах годовых. Сравните со ставкой кредита или вклада: если IRR выше, вкладываться в роботов выгоднее. Ставка в расчёте — ${fmt(c.discountRatePct)}%.`;
  }
  if (has("roi")) {
    return c.roiPct === null
      ? "ROI не считается для этого расчёта."
      : `ROI ${fmt(c.roiPct)}% — сколько чистой прибыли приносит каждый вложенный рубль за ${c.horizonYears} ${years(c.horizonYears)} (с учётом стоимости роботов на конец срока): на 1 ₽ вложений — ${fmt(1 + c.roiPct / 100)} ₽ возврата.`;
  }
  if (has("окуп", "вернут", "вернёт", "payback", "срок")) {
    const disc = c.discountedPaybackYears === null ? "" : ` С учётом стоимости денег (ставка ${fmt(c.discountRatePct)}%) — через ${fmt(c.discountedPaybackYears)} ${years(c.discountedPaybackYears)}.`;
    return paybackText(c) + disc;
  }
  if (has("остаточ", "salvage", "продать", "конец срока")) {
    return `Остаточная стоимость ${fmt(c.salvageMln)} млн ₽ — сколько будут стоить роботы на конец ${c.horizonYears}-го года. Их можно продать или работать на них дальше, поэтому она учтена как возврат в последнем году.`;
  }
  if (has("opex", "снизит", "сократить", "дешевле", "сэконом", "рычаг")) {
    if (!c.levers.length) return "Отдельных рычагов снижения операционных затрат для этого расчёта нет.";
    const top = c.levers.slice(0, 3).map((l) => `«${l.title}» — до ${fmt(l.savingMln)} млн ₽ в год`).join("; ");
    return `OPEX — расходы на содержание роботов каждый год: обслуживание, электричество, ПО. Сильнее всего их снизят: ${top}.`;
  }
  if (has("capex", "вложен", "стоит", "стоимость", "дорог", "затрат", "из чего")) {
    const top = [...c.costGroups].sort((a, b) => b.amountMln - a.amountMln).slice(0, 3).map((g) => `${g.title} — ${fmt(g.amountMln)} млн ₽`).join("; ");
    return `CAPEX ${fmt(c.capexMln)} млн ₽ — разовые вложения: покупка роботов и внедрение. Всего с заменами по сроку службы — ${fmt(c.totalInvestmentMln)} млн ₽. Крупнее всего в стоимости владения: ${top}.`;
  }
  if (has("риск", "чувствит", "если", "вырастет", "упадёт", "упадет", "зарплат")) {
    if (!c.sensitivity.length) return "Анализа чувствительности для этого расчёта нет.";
    const top = c.sensitivity.slice(0, 3).map((s) => `${s.title}: окупаемость от ${s.low} до ${s.high}`).join("; ");
    return `Сильнее всего на окупаемость влияют (каждый фактор ±20%): ${top}.`;
  }
  if (has("робот", "сколько", "парк", "состав")) {
    const list = c.robots.map((r) => `${r.count} × ${r.name} (${SLOT_TITLE[r.slot] ?? r.slot})`).join(", ");
    return `В расчёте: ${list}. Число роботов посчитано под ваш поток грузов; поправить его можно в симуляции через панель «Задания».`;
  }
  return [
    `Коротко: вкладываете ${fmt(c.totalInvestmentMln)} млн ₽, роботы экономят около ${fmt(c.effectYearMln)} млн ₽ в год.`,
    paybackText(c),
    `За ${c.horizonYears} ${years(c.horizonYears)} проект даёт ${fmt(c.netBenefitMln)} млн ₽ сверх вложений.`,
    "Можно спросить: что такое NPV, почему такая окупаемость, из чего складываются затраты, что снизит OPEX, что будет, если вырастут зарплаты.",
  ].join(" ");
}

const SYSTEM = [
  "Ты — помощник по экономике роботизации склада в сервисе РОБОПОДБОР.",
  "Отвечай по-русски, коротко (до 120 слов), простыми словами, без формул и жаргона; термины (CAPEX, OPEX, NPV, IRR, ROI, TCO) объясняй одной фразой.",
  "Опирайся только на цифры расчёта из контекста; если нужной цифры нет — так и скажи. Не придумывай данные и не давай персональных инвестиционных советов.",
  "Суммы — в млн ₽, сроки — в годах.",
].join(" ");

const MODEL = "claude-sonnet-5-5";

export async function askClaude(question: string, history: ChatTurn[], context: EconomicsContext, apiKey: string): Promise<string> {
  const messages = [
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.text })),
    { role: "user" as const, content: question },
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: `${SYSTEM}\n\nЦифры расчёта (JSON):\n${JSON.stringify(context)}`,
      messages,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Claude API: ${response.status}`);
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new Error("Claude API: пустой ответ");
  return text;
}
