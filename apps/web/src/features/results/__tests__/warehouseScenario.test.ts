import { describe, expect, it } from 'vitest';
import { calculateEconomics } from '@domain/economics';
import type { CatalogSolution } from '@domain/catalog';
import { generateWarehouseScenarios } from '@domain/warehouseScenarios';
import { objectParameters, solutions } from '@/mocks/fixtures';

const fields = objectParameters.warehouse ?? [];
const byId = (id: string) => solutions.find((s) => s.id === id) as unknown as CatalogSolution;
const run = (ids: string[], assignments?: Parameters<typeof calculateEconomics>[0]['assignments']) =>
  calculateEconomics({
    objectType: 'warehouse',
    parameters: {},
    fields,
    solution: byId(ids[0]!),
    solutions: ids.map(byId),
    ...(assignments ? { assignments } : {}),
  });

describe('сценарий склада: зоны и связи', () => {
  it('поправка из симуляции: +1 погрузчик дороже по CAPEX, −1 — дешевле, не меньше одного', () => {
    const base = [{ slot: 'inbound' as const, solutionId: 'FL0002' }];
    const count = (r: ReturnType<typeof run>) => r.fleet!.find((g) => g.slot === 'inbound')!.count;
    const capex = (r: ReturnType<typeof run>) => Number(r.capex.value.replace(/\s/g, '').replace(',', '.'));
    const plain = run(['FL0002'], base);
    const more = run(['FL0002'], [{ ...base[0]!, extra: 1 }]);
    const fewer = run(['FL0002'], [{ ...base[0]!, extra: -100 }]);
    expect(count(more)).toBe(count(plain) + 1);
    expect(capex(more)).toBeGreaterThan(capex(plain));
    expect(count(fewer)).toBe(1);
  });

  it('AMR-платформа сама груз не берёт: везёт весь поток, погрузчик делает две перегрузки на паллету', () => {
    const result = run(['FL0002', 'AM0001']);
    const inbound = result.fleet!.filter((g) => g.slot === 'inbound');
    expect(inbound.map((g) => g.solutionId).sort()).toEqual(['AM0001', 'FL0002']);
    const amr = inbound.find((g) => g.solutionId === 'AM0001')!;
    const lifter = inbound.find((g) => g.solutionId === 'FL0002')!;
    expect(amr.share).toBeCloseTo(1);
    // Перегрузок вдвое больше, чем паллет, но на коротком плече.
    expect(lifter.peakDemand).toBeCloseTo(amr.peakDemand * 2);
    expect(lifter.routeM).toBeLessThan(amr.routeM!);
    expect(result.assumptions.some((a) => /перегрузку .* делают погрузчики-роботы/.test(a))).toBe(true);
    // Без погрузчика перегрузку делают операторы — часов на людях остаётся больше.
    const alone = run(['AM0001']);
    expect(alone.assumptions.some((a) => /делают операторы/.test(a))).toBe(true);
    const remaining = (r: typeof result) => Number(/остаётся (\d+)% часов/.exec(r.assumptions.join(' '))?.[1] ?? 0);
    expect(remaining(alone)).toBeGreaterThan(remaining(result));
  });

  it('роботов можно развести по связям: погрузчик на приёмке, AMR на отгрузке', () => {
    const result = run(['FL0002', 'AM0001'], [
      { slot: 'inbound', solutionId: 'FL0002' },
      { slot: 'outbound', solutionId: 'AM0001' },
    ]);
    expect(result.fleet!.map((g) => `${g.slot}:${g.solutionId}`)).toEqual(['inbound:FL0002', 'outbound:AM0001']);
  });

  it('конвейер — инфраструктура связи: укорачивает путь, но не замещает людей целиком', () => {
    const conveyorOnly = run(['CV0001']);
    const link = conveyorOnly.scenario!.links.find((l) => l.slot === 'inbound')!;
    expect(link.effectiveRouteM).toBeLessThan(link.routeM);
    expect(link.manualShare).toBe(1);
    expect(conveyorOnly.assumptions.some((a) => /остаётся [1-9]\d?% часов/.test(a))).toBe(true);
    // С погрузчиками последних метров их нужно меньше, чем на весь путь.
    const withLoaders = run(['CV0001', 'FL0002']);
    const loadersOnly = run(['FL0002']);
    const count = (r: typeof withLoaders) => r.fleet!.filter((g) => g.kind === 'loader').reduce((s, g) => s + g.count, 0);
    expect(count(withLoaders)).toBeLessThan(count(loadersOnly));
  });

  it('генератор перебирает составы и отдаёт варианты с причиной выбора', () => {
    const started = performance.now();
    const variants = generateWarehouseScenarios({ parameters: {}, fields, solutions: solutions as unknown as CatalogSolution[] });
    const elapsed = performance.now() - started;
    console.log(elapsed.toFixed(0), 'мс', variants.map((v) => `${v.title} | ${v.highlights.join(', ')} | экономия ${v.savingMln} | окуп ${v.paybackYears} | capex ${v.capexMln}\n   ${v.description}`).join('\n'));
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.filter((v) => v.best)).toHaveLength(1);
    // Лучший — с наибольшей экономией за горизонт.
    const best = variants.find((v) => v.best)!;
    expect(Math.max(...variants.map((v) => v.savingMln))).toBe(best.savingMln);
    // У каждого варианта — причина выбора, разные составы.
    for (const v of variants) expect(v.highlights.length).toBeGreaterThan(0);
    const keys = variants.map((v) => v.assignments.map((a) => `${a.slot}:${a.solutionId}`).sort().join('|'));
    // Рекомендуем — первым, один, подобран под склад: роботы на нескольких
    // участках и загружены (в описании — насколько).
    const recommended = variants.filter((v) => v.recommended);
    expect(recommended).toHaveLength(1);
    expect(variants[0]!.recommended).toBe(true);
    expect(new Set(recommended[0]!.assignments.map((a) => a.slot)).size).toBeGreaterThanOrEqual(2);
    expect(recommended[0]!.description).toMatch(/загружены на \d+/);
    expect(new Set(keys).size).toBe(variants.length);
  }, 60_000);

  it('рекомендуемый состав подстраивается под данные склада', () => {
    const pick = (parameters: Record<string, string>) =>
      generateWarehouseScenarios({ parameters, fields, solutions: solutions as unknown as CatalogSolution[] }).find((v) => v.recommended)!;
    const small = pick({ wh_obschaya_ploschad_sklada: '3000', wh_obem_priemki: '200', wh_obem_otgruzki: '200', wh_obem_otbora: '500' });
    const large = pick({ wh_obschaya_ploschad_sklada: '40000', wh_obem_priemki: '6000', wh_obem_otgruzki: '6000', wh_obem_otbora: '20000' });
    console.log('малый:', small.title, small.robots, '| крупный:', large.title, large.robots);
    expect(small.robots).toBeLessThan(large.robots);
  }, 60_000);
});
