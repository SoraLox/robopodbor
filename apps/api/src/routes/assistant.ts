import { Router } from "express";
import { z } from "zod";
import { wrap } from "../asyncHandler.js";
import { askClaude, localAnswer, type EconomicsContext } from "../domain/economicsAssistant.js";

/**
 * POST /api/assistant/economics — вопрос по экономике расчёта. Цифры расчёта
 * приходят в контексте с клиента (у гостя расчёт может быть не сохранён).
 * С ANTHROPIC_API_KEY отвечает Claude, без ключа или при сбое — встроенные ответы.
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
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        const answer = await askClaude(question, history, context as EconomicsContext, key);
        res.json({ answer, source: "ai" });
        return;
      } catch (error) {
        console.error("[assistant] Claude недоступен, отвечаем встроенным помощником:", error);
      }
    }
    res.json({ answer: localAnswer(question, context as EconomicsContext), source: "local" });
  }),
);

export default router;
