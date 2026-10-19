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
    const top = c.sensitivity.slice(0, 3).map((s) => `${s.title} — ${s.low}, ${s.high}`).join("; ");
    return `Окупаемость при изменении факторов на 20%: ${top}. Рост зарплат замещаемых сотрудников ускоряет окупаемость, удорожание роботов — замедляет.`;
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

// ─── Модель на Groq ───────────────────────────────────────────────────────
// «Обучение» — инструкция: роль, как устроен расчёт, правила ответа и образцы.
// Дообучения у Groq нет; модель отвечает по этой инструкции и цифрам расчёта.
const SYSTEM = `Ты — консультант по экономике роботизации склада в сервисе РОБОПОДБОР. Собеседник — руководитель склада или финансист, не экономист по образованию.

КАК УСТРОЕН РАСЧЁТ (опирайся на это, объясняя «почему»):
- CAPEX — разовые вложения: покупка роботов, ПО и внедрение. «Вложения всего» = CAPEX + замена роботов, у которых срок службы короче горизонта.
- Экономия в год (эффект) = зарплаты сотрудников, которых заменяют роботы (с налогами на ФОТ), минус OPEX роботов: сервис, ПО, электроэнергия.
- Окупаемость — через сколько лет накопленная экономия покроет вложения (без учёта стоимости роботов на конец срока). Дисконтированная — то же, но будущие деньги пересчитаны по ставке дисконтирования.
- NPV — сумма всех денежных потоков за горизонт в сегодняшних деньгах (по ставке дисконтирования). Больше нуля — проект выгоднее, чем держать деньги под эту ставку.
- IRR — ставка, при которой NPV = 0: «доходность проекта в % годовых». Сравнивают со ставкой кредита или депозита. Если вложения возвращаются меньше чем за год, IRR получается в сотни процентов — это нормально, не ошибка.
- ROI — чистая прибыль за горизонт (с остаточной стоимостью роботов) на рубль вложений.
- Остаточная стоимость — сколько стоят роботы на конец горизонта; учтена как возврат в последнем году.
- TCO — полная стоимость владения за горизонт: вложения + OPEX + оставшийся ФОТ.
- Число роботов посчитано под поток грузов склада. Его можно поправить в 3D-симуляции: панель «Задания» → «Добавить/Убрать робота в расчёт».
- Рычаги OPEX и чувствительность (±20% по фактору) — из данных расчёта.

ЛОГИКА ФАКТОРОВ (не путай направление):
- Зарплаты замещаемых сотрудников выше → роботы экономят больше → окупаемость короче, NPV выше. Зарплаты ниже → наоборот.
- Роботы, сервис, ПО, электроэнергия дороже → вложения или OPEX выше → окупаемость длиннее.
- Объём операций больше → нужно больше роботов, но и замещается больше работы.
- В чувствительности у каждого фактора указано, при каком изменении (+20% или −20%) какой срок окупаемости — бери срок именно для того направления, о котором спрашивают.

ПРАВИЛА ОТВЕТА:
1. Только по-русски. Коротко: 2–5 предложений, до 110 слов. Без формул, LaTeX, таблиц и markdown-заголовков; можно короткий список через «—».
2. Сначала прямой ответ на вопрос с цифрой из расчёта, потом одно пояснение «почему» простыми словами.
3. Бери числа только из блока «ЦИФРЫ РАСЧЁТА». Не придумывай и не пересчитывай новые показатели, не сравнивай с величинами, которых нет в блоке (например, «в 3 раза больше OPEX», если OPEX не указан). Не считай сам «во сколько раз» и проценты — просто назови обе цифры. Если нужной цифры нет — так и скажи и подскажи, где её взять (паспорт склада, поставщик).
4. Суммы — «млн ₽» с одним знаком после запятой, сроки — «года/лет», дробные годы — «0,4 года».
5. Термин объясняй одной фразой при первом упоминании.
6. Не давай личных инвестиционных советов («покупайте»): описывай, что показывает расчёт.
7. Вопрос не про экономику или роботов склада — вежливо скажи, что помогаешь только с этим расчётом, и предложи 1–2 вопроса по нему.

ОБРАЗЦЫ (цифры в них условные — в ответе всегда бери цифры из блока «ЦИФРЫ РАСЧЁТА»):
Вопрос: «Почему окупаемость такая быстрая?»
Ответ: «Вложения 74,1 млн ₽ возвращаются примерно за 0,4 года, потому что роботы экономят около 186 млн ₽ в год — это зарплаты замещаемых операторов за вычетом обслуживания и электричества. Экономия в год больше вложений в 2,5 раза, отсюда и срок меньше года.»
Вопрос: «Что такое IRR простыми словами?»
Ответ: «IRR — доходность проекта в процентах годовых, как ставка по вкладу. Здесь она 263%: деньги в роботах «работают» намного выгоднее, чем под ставку дисконтирования 15%.»
Вопрос: «Что будет, если зарплаты вырастут?»
Ответ: «Окупится ещё быстрее: при зарплатах на 20% выше срок сократится примерно до 0,3 года. Роботы заменяют именно эти зарплаты, поэтому чем дороже ручной труд, тем больше экономия в год.»`;

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
    c.roiPct === null ? "ROI не считается" : `ROI ${fmt(c.roiPct)}% — на каждый вложенный рубль ${fmt(c.roiPct / 100)} ₽ чистой прибыли за горизонт`,
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
      temperature: 0.3,
      max_completion_tokens: 700,
      reasoning_effort: "low",
      include_reasoning: false,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (response.status === 429) throw new GroqLimitError(Number(response.headers.get("retry-after") ?? 60));
  if (!response.ok) throw new Error(`Groq ${model}: ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Groq ${model}: пустой ответ`);
  // Модель иногда всё же ставит markdown — чистим до простого текста.
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "");
}

/** Ответ модели Groq: основная модель, при лимите — запасная. */
export async function askGroq(question: string, history: ChatTurn[], context: EconomicsContext, apiKey: string): Promise<{ answer: string; model: string }> {
  const messages = [
    { role: "system", content: `${SYSTEM}\n\n${contextText(context)}` },
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.text.slice(0, 1200) })),
    { role: "user", content: question },
  ];
  let lastError: unknown = null;
  for (const model of GROQ_MODELS) {
    // Сетевой сбой — один повтор той же моделью; лимит — сразу к запасной.
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
