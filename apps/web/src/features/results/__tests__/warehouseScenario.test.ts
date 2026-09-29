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
  it('погрузчик и AMR — оба в наборе, делят поток приёмки и отгрузки', () => {
    const result = run(['FL0002', 'AM0001']);
    const inbound = result.fleet!.filter((g) => g.slot === 'inbound');
    expect(inbound.map((g) => g.solutionId).sort()).toEqual(['AM0001', 'FL0002']);
    expect(inbound.reduce((sum, g) => sum + g.share, 0)).toBeCloseTo(1);
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

  it('генератор собирает варианты из подходящих решений и отмечает лучший по TCO', () => {
    const variants = generateWarehouseScenarios({ parameters: {}, fields, solutions: solutions as unknown as CatalogSolution[] });
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.filter((v) => v.best)).toHaveLength(1);
    for (const v of variants) expect(v.assignments.length).toBeGreaterThan(0);
  });
});
