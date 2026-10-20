import { Router } from "express";
import { wrap } from "../asyncHandler.js";
import { resolveEconomicsAnswer, type EconomicsContext } from "../domain/economicsAssistant.js";
import { assistantRequestSchema } from "../domain/assistantRequest.js";

/**
 * POST /api/assistant/economics — вопрос по экономике расчёта.
 * Отвечает ИИ (Groq); запасной локальный ответ — только при сбое.
 * Кеша нет: повтор того же вопроса должен давать свежую формулировку.
 */
const router = Router();

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
    const parsed = assistantRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный вопрос" });
      return;
    }
    if (!allowed(req.ip ?? "unknown")) {
      res.status(429).json({ error: "Слишком много вопросов подряд — попробуйте через несколько минут" });
      return;
    }
    const { question, history, context, details } = parsed.data;
    const { answer, source } = await resolveEconomicsAnswer(
      question,
      history,
      context as EconomicsContext,
      details,
      process.env.GROQ_API_KEY,
    );
    res.json({ answer, source });
  }),
);

export default router;
