import { describe, expect, it } from 'vitest';
import { calculateEconomics } from '@domain/economics';
import type { CatalogSolution } from '@domain/catalog';
import { objectParameters, solutions } from '@/mocks/fixtures';

const solutionOf = (id: string) => solutions.find((s) => s.id === id) as unknown as CatalogSolution;
const run = (objectType: string, id: string, parameters: Record<string, string> = {}) =>
  calculateEconomics({
    objectType,
    parameters,
    fields: objectParameters[objectType] ?? [],
    solution: solutionOf(id),
  });

describe('расчёт экономики по паспорту и решению', () => {
  it('результат зависит от введённых параметров, а не один на всех', () => {
    const base = run('warehouse', 'AM0001');
    const pricier = run('warehouse', 'AM0001', { wh_z_p_operatora_pogruzchika: '200000' });
    expect(base.capex.value).toBe(pricier.capex.value);
    expect(Number(pricier.payback.value.replace(',', '.'))).toBeLessThan(Number(base.payback.value.replace(',', '.')));
  });

  it('число роботов по потоку и производительности из карточки', () => {
    const result = run('warehouse', 'AM0001');
    expect(result.robots.basis).toContain('производительность из карточки');
    expect(result.robots.count).toBeGreaterThan(0);
  });

  it('роботы замещают не больше постов, чем закрывают', () => {
    const result = run('warehouse', 'AM0001');
    expect(result.assumptions.some((line) => line.startsWith('Роботы закрывают'))).toBe(true);
  });

  it('без производительности парк ограничен бюджетом из паспорта', () => {
    const result = run('airport', 'AM0003');
    expect(result.robots.basis).toContain('бюджет');
    expect(Number(result.capex.value.replace(',', '.'))).toBeLessThanOrEqual(120);
  });

  it('нет данных о замещаемом персонале — окупаемость не выдумываем', () => {
    const result = run('warehouse', 'FC0002');
    expect(result.payback.value).toBe('—');
    expect(result.roi.value).toBe('—');
    expect(result.warning).toMatch(/Не хватает данных/);
  });

  it('сценарии и структура затрат согласованы', () => {
    const result = run('warehouse', 'FL0002');
    const purchase = result.scenarios.find((s) => s.id === 'purchase')!;
    expect(result.totalTco).toBe(purchase.tco);
    const sum = result.costGroups.reduce((total, group) => total + group.amount, 0);
    expect(Math.abs(sum - result.totalTco)).toBeLessThan(0.3);
    expect(result.sensitivity.length).toBeGreaterThan(0);
  });
});
