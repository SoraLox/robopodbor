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

  it('склад: парк по пиковому потоку и циклу маршрута (модель Егора)', () => {
    const result = run('warehouse', 'AM0001');
    const loader = result.fleet?.[0];
    expect(loader?.kind).toBe('loader');
    expect(loader?.model).toBe('transporter');
    expect(loader!.count).toBeGreaterThan(0);
    // Хватает на пик с учётом загрузки 0,85 и готовности 0,95.
    expect(loader!.count * loader!.throughputPerRobot * 0.85 * 0.95).toBeGreaterThanOrEqual(loader!.peakDemand);
    expect(result.robots.count).toBe(loader!.count);
  });

  it('склад: экономия ФОТ по ролям, не больше того, что успевает парк', () => {
    const result = run('warehouse', 'AM0001');
    expect(result.assumptions.some((line) => line.includes('Операторы погрузчиков'))).toBe(true);
    const few = run('warehouse', 'AM0001', { wh_obem_priemki: '10', wh_obem_otgruzki: '10' });
    expect(few.assumptions.some((line) => /успевает \d+%/.test(line))).toBe(true);
  });

  it('склад: пробелы карточки закрываются демо-роботом и названы в предупреждении', () => {
    const result = run('warehouse', 'MM0002');
    expect(result.fleet?.[0]?.substitutions.map((item) => item.field)).toContain('производительность');
    expect(result.warning).toContain('из демо-робота');
  });

  it('склад: набор роботов — флоты складываются', () => {
    const solution = solutionOf('FL0002');
    const combo = calculateEconomics({
      objectType: 'warehouse',
      parameters: {},
      fields: objectParameters.warehouse ?? [],
      solution,
      solutions: [solution, solutionOf('MM0002'), solutionOf('FC0002')],
    });
    const single = run('warehouse', 'FL0002');
    expect(combo.fleet?.map((group) => group.kind)).toEqual(['loader', 'arm', 'vacuum']);
    expect(combo.robots.count).toBe(combo.fleet!.reduce((sum, group) => sum + group.count, 0));
    expect(Number(combo.capex.value.replace(',', '.'))).toBeGreaterThan(Number(single.capex.value.replace(',', '.')));
  });

  it('без производительности парк ограничен бюджетом из паспорта', () => {
    const result = run('airport', 'AM0003');
    expect(result.robots.basis).toContain('бюджет');
    expect(Number(result.capex.value.replace(',', '.'))).toBeLessThanOrEqual(120);
  });

  it('уборка не замещает ролей с зарплатой — окупаемость не выдумываем', () => {
    const result = run('warehouse', 'FC0002');
    expect(result.payback.value).toBe('—');
    expect(result.roi.value).toBe('—');
    expect(result.payback.note).toMatch(/не замещает/);
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
