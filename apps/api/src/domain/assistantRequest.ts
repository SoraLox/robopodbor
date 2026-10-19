import { z } from "zod";

/**
 * Запрос к помощнику по экономике — общий для API (routes/assistant.ts) и
 * посредника для GitHub Pages (workers/economics-assistant): одинаковые пределы.
 */
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
export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12).default([]),
  context: contextSchema,
  /** Досье расчёта: паспорт склада, парк, статьи затрат, денежный поток, допущения. */
  details: z.string().max(16000).optional(),
});
