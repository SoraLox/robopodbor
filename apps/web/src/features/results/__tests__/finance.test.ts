import { describe, expect, it } from 'vitest';
import { analyzeInvestment, replacementSchedule } from '@domain/finance';
import { calculateEconomics } from '@domain/economics';
import { objectParameters, solutions } from '@/mocks/fixtures';
import type { CatalogSolution } from '@domain/catalog';

describe('инвестиционные показатели', () => {
  it('ROI учитывает замену по сроку службы и остаточную стоимость', () => {
    const schedule = replacementSchedule(100, 5, 3);
    expect(schedule.replacements).toEqual([{ year: 3, amount: 100 }]);
    expect(schedule.salvage).toBeCloseTo(33.33, 1);
    const f = analyzeInvestment({ capex: 100, effects: [40, 40, 40, 40, 40], replacements: schedule.replacements, salvage: schedule.salvage, discountRate: 0.1 });
    // Поток: −100, 40, 40, −60, 40, 73,3 → чистая выгода 33,3 на 200 вложений.
    // ROI / год = (33,3/200)/5 ≈ 3,33%.
    expect(f.totalInvestment).toBe(200);
    expect(f.netBenefit).toBeCloseTo(33.33, 1);
    expect(f.roiPct).toBeCloseTo(3.33, 1);
    // Окупаемость — без остаточной стоимости: накопленный поток выходит в ноль к концу 5-го года.
    expect(f.paybackYears).toBeCloseTo(5, 5);
    // NPV по 10%: дисконтированная сумма потока.
    const npv = [-100, 40, 40, -60, 40, 40 + 100 / 3].reduce((s, v, t) => s + v / 1.1 ** t, 0);
    expect(f.npv).toBeCloseTo(npv, 6);
    // IRR — ставка, при которой NPV = 0.
    const irr = f.irrPct! / 100;
    expect([-100, 40, 40, -60, 40, 40 + 100 / 3].reduce((s, v, t) => s + v / (1 + irr) ** t, 0)).toBeCloseTo(0, 3);
  });

  it('без остаточной стоимости ROI ниже — она входит в доходность', () => {
    const base = { capex: 100, effects: [30, 30, 30], replacements: [], discountRate: 0.1 };
    expect(analyzeInvestment({ ...base, salvage: 20 }).roiPct!).toBeGreaterThan(analyzeInvestment({ ...base, salvage: 0 }).roiPct!);
  });

  it('склад: ROI / год — чистая выгода за вычетом CAPEX, усреднённая на горизонт', () => {
    const fields = objectParameters.warehouse as never;
    const all = solutions as unknown as CatalogSolution[];
    const forklift = all.find((s) => s.id === 'FL0002')!;
    const r = calculateEconomics({ objectType: 'warehouse', parameters: {}, fields, solution: forklift, solutions: [forklift] });
    const f = r.finance!;
    expect(f).toBeTruthy();
    const horizon = f.cashFlow.length - 1;
    expect(r.roi.label).toMatch(/ROI\s*\/\s*год/i);
    expect(r.roi.label).toMatch(/CAPEX/i);
    expect(f.cashFlow).toHaveLength(horizon + 1);
    expect(f.cashFlow[0]!.netMln).toBeLessThan(0);
    const annual = (f.netBenefitMln / f.totalInvestmentMln / horizon) * 100;
    expect(Math.abs(f.roiPct! - annual)).toBeLessThan(2);
    expect(r.roi.value).toBe(`${f.roiPct}%`);
    expect(r.assumptions.some((a) => /остаточная стоимость|ROI \/ год/.test(a))).toBe(true);
  });
});
