import { Router } from "express";
import { z } from "zod";
import { wrap } from "../asyncHandler.js";
import { askGroq, localAnswer, type EconomicsContext } from "../domain/economicsAssistant.js";

/**
 * POST /api/assistant/economics — вопрос по экономике расчёта. Цифры расчёта
 * приходят в контексте с клиента (у гостя расчёт может быть не сохранён).
 * С GROQ_API_KEY отвечает модель на Groq (запасная — при лимите), без ключа или
 * при сбое — встроенные ответы. Одинаковые вопросы по одному расчёту — из кеша.
 */
const router = Router();

const num = z.number().finite();
const contextSchema = z.object({
  objectTitle: z.string().max(200).optional(),
  meta: z.string().max(400).optional(),
  horizonYears: num,
  capexMln: num,
  totalInvestmentMln: num,
  effectYearMln: num,
  paybackYears: num.nullable(),
  discountedPaybackYears: num.nullable(),
  npvMln: num,
  irrPct: num.nullable(),
  roiPct: num.nullable(),
  discountRatePct: num,
  salvageMln: num,
  netBenefitMln: num,
  opexYearMln: num.optional(),
  robots: z.array(z.object({ name: z.string().max(120), count: num, slot: z.string().max(20) })).max(30),
  costGroups: z.array(z.object({ title: z.string().max(120), amountMln: num })).max(30),
  levers: z.array(z.object({ title: z.string().max(160), savingMln: num })).max(20),
  sensitivity: z.array(z.object({ title: z.string().max(160), low: z.string().max(40), high: z.string().max(40) })).max(20),
});
const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12).default([]),
  context: contextSchema,
});

// Не больше 20 вопросов за 10 минут с одного адреса: ответ модели платный.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 20;
const hits = new Map<string, number[]>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  return true;
}

// Кеш ответов: до 200 последних, на сутки.
const CACHE_MAX = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, string>();
const cachedAt = new Map<string, number>();
function remember(key: string, answer: string) {
  cache.set(key, answer);
  cachedAt.set(key, Date.now());
  for (const [k, t] of cachedAt) {
    if (cache.size <= CACHE_MAX && Date.now() - t < CACHE_TTL_MS) break;
    cache.delete(k);
    cachedAt.delete(k);
  }
}

router.post(
  "/economics",
  wrap(async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный вопрос" });
      return;
    }
    if (!allowed(req.ip ?? "unknown")) {
      res.status(429).json({ error: "Слишком много вопросов подряд — попробуйте через несколько минут" });
      return;
    }
    const { question, history, context } = parsed.data;
    const key = process.env.GROQ_API_KEY;
    // Первый вопрос без истории по тем же цифрам — частый (готовые вопросы): из кеша.
    const cacheKey = history.length ? null : `${question.toLowerCase()}|${JSON.stringify(context)}`;
    const cached = cacheKey ? cache.get(cacheKey) : undefined;
    if (cached) {
      res.json({ answer: cached, source: "ai" });
      return;
    }
    if (key) {
      try {
        const { answer } = await askGroq(question, history, context as EconomicsContext, key);
        if (cacheKey) remember(cacheKey, answer);
        res.json({ answer, source: "ai" });
        return;
      } catch (error) {
        console.error("[assistant] Groq недоступен, отвечаем встроенным помощником:", error instanceof Error ? error.message : error);
      }
    }
    res.json({ answer: localAnswer(question, context as EconomicsContext), source: "local" });
  }),
);

export default router;
