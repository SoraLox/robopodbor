/**
 * Инвестиционные показатели по денежному потоку проекта (общие для всех объектов).
 *
 * Поток по годам: год 0 — вложения (CAPEX); годы 1…N — эффект года (экономия
 * ФОТ минус OPEX), минус замена оборудования в год окончания срока службы, плюс
 * в последний год горизонта — остаточная стоимость (salvage value) парка:
 * оборудование, купленное в проект, на конец горизонта ещё чего-то стоит, и без
 * неё доходность занижается, а TCO завышается.
 *
 *   ROI = (Σ эффектов + остаточная стоимость − Σ вложений) / Σ вложений
 *   Окупаемость — когда накопленный поток выходит в плюс (с интерполяцией в году).
 *   NPV  = Σ поток_t / (1 + r)^t;  IRR — ставка, при которой NPV = 0.
 */

/** Ставка дисконтирования по умолчанию: оценка стоимости капитала, а не данные объекта. */
export const DEFAULT_DISCOUNT_RATE = 0.15;

export interface FinanceInput {
  capex: number;
  /** Эффект по годам 1…N (₽): экономия ФОТ минус OPEX. */
  effects: number[];
  /** Замена оборудования: вложение в конце года year (₽). */
  replacements: Array<{ year: number; amount: number }>;
  /** Остаточная стоимость парка на конец горизонта (₽). */
  salvage: number;
  discountRate?: number;
}

export interface CashFlowYear {
  year: number;
  investment: number;
  effect: number;
  salvage: number;
  net: number;
  cumulative: number;
  cumulativeDiscounted: number;
}

export interface FinanceResult {
  flows: CashFlowYear[];
  totalInvestment: number;
  netBenefit: number;
  roiPct: number | null;
  paybackYears: number | null;
  discountedPaybackYears: number | null;
  npv: number;
  irrPct: number | null;
  salvage: number;
  discountRate: number;
}

/** Замена по сроку службы и остаточная стоимость (линейная амортизация) на конец горизонта. */
export function replacementSchedule(capex: number, horizon: number, lifespan: number) {
  const replacements: Array<{ year: number; amount: number }> = [];
  if (lifespan > 0) {
    for (let year = lifespan; year < horizon; year += lifespan) replacements.push({ year: Math.round(year), amount: capex });
  }
  let salvage = 0;
  if (lifespan > 0 && capex > 0) {
    const lastPurchase = replacements.length ? replacements[replacements.length - 1]!.year : 0;
    salvage = capex * Math.max(0, 1 - (horizon - lastPurchase) / lifespan);
  }
  return { replacements, salvage, replacementCapex: replacements.reduce((s, r) => s + r.amount, 0) };
}

// Год, когда накопленный поток выходит в плюс (дробный — внутри года).
function crossing(points: number[]): number | null {
  for (let t = 1; t < points.length; t += 1) {
    const before = points[t - 1]!;
    const after = points[t]!;
    if (before < 0 && after >= 0) return t - 1 + -before / (after - before);
  }
  return points[0]! >= 0 ? 0 : null;
}

function npvAt(nets: number[], rate: number) {
  return nets.reduce((sum, net, t) => sum + net / (1 + rate) ** t, 0);
}

function irr(nets: number[]): number | null {
  // Без смены знака потока IRR не существует.
  if (!nets.some((n) => n > 0) || !nets.some((n) => n < 0)) return null;
  let lo = -0.99;
  let hi = 10;
  if (npvAt(nets, lo) * npvAt(nets, hi) > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (npvAt(nets, lo) * npvAt(nets, mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function analyzeInvestment(input: FinanceInput): FinanceResult {
  const rate = input.discountRate ?? DEFAULT_DISCOUNT_RATE;
  const horizon = input.effects.length;
  const flows: CashFlowYear[] = [];
  let cumulative = -input.capex;
  let cumulativeDiscounted = -input.capex;
  flows.push({ year: 0, investment: input.capex, effect: 0, salvage: 0, net: -input.capex, cumulative, cumulativeDiscounted });
  for (let year = 1; year <= horizon; year += 1) {
    const investment = input.replacements.filter((r) => r.year === year).reduce((s, r) => s + r.amount, 0);
    const effect = input.effects[year - 1] ?? 0;
    const salvage = year === horizon ? input.salvage : 0;
    const net = effect - investment + salvage;
    cumulative += net;
    cumulativeDiscounted += net / (1 + rate) ** year;
    flows.push({ year, investment, effect, salvage, net, cumulative, cumulativeDiscounted });
  }
  const totalInvestment = flows.reduce((s, f) => s + f.investment, 0);
  const netBenefit = flows.reduce((s, f) => s + f.net, 0);
  const nets = flows.map((f) => f.net);
  const rootRate = irr(nets);

  // Окупаемость — по реальным деньгам, без остаточной стоимости (она «на бумаге»
  // до продажи оборудования); за горизонтом продлеваем последний годовой эффект.
  const extend = (discounted: boolean) => {
    const salvageAt = discounted ? input.salvage / (1 + rate) ** horizon : input.salvage;
    const points = flows.map((f) => (discounted ? f.cumulativeDiscounted : f.cumulative) - (f.year === horizon ? salvageAt : 0));
    const last = input.effects[horizon - 1] ?? 0;
    let value = points[points.length - 1]!;
    for (let year = horizon + 1; year <= horizon + 30 && last > 0; year += 1) {
      value += discounted ? last / (1 + rate) ** year : last;
      points.push(value);
    }
    return points;
  };

  return {
    flows,
    totalInvestment,
    netBenefit,
    roiPct: totalInvestment > 0 ? (netBenefit / totalInvestment) * 100 : null,
    paybackYears: crossing(extend(false)),
    discountedPaybackYears: crossing(extend(true)),
    npv: npvAt(nets, rate),
    irrPct: rootRate === null ? null : rootRate * 100,
    salvage: input.salvage,
    discountRate: rate,
  };
}

/** Блок отчёта: показатели и поток по годам в млн ₽ (для графиков денежного потока). */
export interface FinanceOutput {
  discountRatePct: number;
  npvMln: number;
  irrPct: number | null;
  roiPct: number | null;
  paybackYears: number | null;
  discountedPaybackYears: number | null;
  salvageMln: number;
  totalInvestmentMln: number;
  netBenefitMln: number;
  cashFlow: Array<{
    year: number;
    investmentMln: number;
    effectMln: number;
    salvageMln: number;
    netMln: number;
    cumulativeMln: number;
    cumulativeDiscountedMln: number;
  }>;
}

const mln = (rub: number) => Math.round(rub / 1e5) / 10;
const one = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

export function financeOutput(f: FinanceResult): FinanceOutput {
  return {
    discountRatePct: Math.round(f.discountRate * 1000) / 10,
    npvMln: mln(f.npv),
    irrPct: f.irrPct === null ? null : Math.round(f.irrPct),
    roiPct: f.roiPct === null ? null : Math.round(f.roiPct),
    paybackYears: one(f.paybackYears),
    discountedPaybackYears: one(f.discountedPaybackYears),
    salvageMln: mln(f.salvage),
    totalInvestmentMln: mln(f.totalInvestment),
    netBenefitMln: mln(f.netBenefit),
    cashFlow: f.flows.map((y) => ({
      year: y.year,
      investmentMln: mln(y.investment),
      effectMln: mln(y.effect),
      salvageMln: mln(y.salvage),
      netMln: mln(y.net),
      cumulativeMln: mln(y.cumulative),
      cumulativeDiscountedMln: mln(y.cumulativeDiscounted),
    })),
  };
}
