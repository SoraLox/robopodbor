import { describe, expect, it } from 'vitest';
import { calculateEconomics } from '@domain/economics';
import type { CatalogSolution } from '@domain/catalog';
import { objectParameters, solutions } from '@/mocks/fixtures';
import {
  buildSimulationInput,
  parseLeadingNumber,
  simRobotTypeOf,
} from '@/features/results/simulation/simulationInput';

const fields = objectParameters.warehouse ?? [];
const byId = (id: string) => solutions.find((s) => s.id === id)!;
/** Парк из расчёта экономики — ровно то, что сцена получает с сервера. */
const fleetOf = (ids: string[], values: Record<string, string> = {}) =>
  calculateEconomics({
    objectType: 'warehouse',
    parameters: values,
    fields,
    solution: byId(ids[0]!) as unknown as CatalogSolution,
    solutions: ids.map((id) => byId(id) as unknown as CatalogSolution),
  }).fleet ?? [];
const sceneOf = (ids: string[], values: Record<string, string> = {}) =>
  buildSimulationInput(fields, values, fleetOf(ids, values));

describe('simulationInput', () => {
  it('разбирает числа из паспорта решения', () => {
    expect(parseLeadingNumber('1 500 кг')).toBe(1500);
    expect(parseLeadingNumber('1.8 м/с')).toBe(1.8);
    expect(parseLeadingNumber('—')).toBeNull();
  });

  it('относит решения каталога к типу робота в сцене', () => {
    expect(simRobotTypeOf(byId('AM0001'))).toBe('loader');
    expect(simRobotTypeOf(byId('FL0002'))).toBe('loader');
    expect(simRobotTypeOf(byId('IM0001'))).toBe('arm');
    expect(simRobotTypeOf(byId('RC0007'))).toBe('arm');
    expect(simRobotTypeOf(byId('FC0003'))).toBe('vacuum');
    // ПО со сценарием «сортировка» — не роборука
    expect(simRobotTypeOf(byId('SW0001'))).toBeNull();
    expect(simRobotTypeOf(byId('IN0001'))).toBeNull();
    // без типа решения — по ключевым словам назначения
    expect(simRobotTypeOf({ ...byId('AM0001'), solutionType: undefined, useCase: 'Уборка терминала' })).toBe('vacuum');
  });

  it('переносит параметры склада и парк из расчёта в сцену', () => {
    const input = sceneOf(['AM0001']);
    const loader = input.fleets.loader!;
    const economics = fleetOf(['AM0001']).filter((g) => g.kind === 'loader');
    const sum = (key: 'count' | 'peakDemand') => economics.reduce((s, g) => s + g[key], 0);

    expect(input.params.floorAreaM2).toBe(20000);
    expect(input.params.workZonePct).toBe(50);
    expect(input.params.cargoWeightKg).toBe(800);
    // 1000 поддонов/сут при 2 сменах по 11 ч
    expect(input.params.requiredLoadThroughput).toBeCloseTo(1000 / 22);
    expect(loader.capacityKg).toBe(1500);
    expect(loader.speedMps).toBe(1.5);
    // Сцена и экономика — одни числа.
    // Сцена и экономика — одни числа: приёмка + отгрузка.
    expect(loader.throughput).toBeCloseTo(economics[0]!.throughputPerRobot);
    expect(loader.requiredCount).toBe(sum('count'));
    expect(input.demand.loader).toBeCloseTo(sum('peakDemand'));
    expect(loader.recommendedCount).toBeLessThanOrEqual(loader.maxCount);
  });

  it('больше приёмка — больше погрузчиков по расчёту', () => {
    const low = sceneOf(['AM0001'], { wh_obem_priemki: '500', wh_obem_otgruzki: '500' });
    const high = sceneOf(['AM0001'], { wh_obem_priemki: '5000', wh_obem_otgruzki: '5000' });
    expect(high.fleets.loader!.requiredCount).toBeGreaterThan(low.fleets.loader!.requiredCount);
  });

  it('набор роботов — все флоты в одной сцене', () => {
    const input = sceneOf(['FL0002', 'MM0002', 'FC0002']);
    expect(input.robotTypes).toEqual(['loader', 'arm', 'vacuum']);
    expect(input.fleets.arm?.name).toBe(byId('MM0002').name);
    expect(input.demand.vacuum).toBeGreaterThan(0);
  });
});

describe('сцена по связям сценария', () => {
  const sceneWith = (ids: string[], assignments?: Parameters<typeof calculateEconomics>[0]['assignments']) => {
    const fleet =
      calculateEconomics({
        objectType: 'warehouse',
        parameters: {},
        fields,
        solution: byId(ids[0]!) as unknown as CatalogSolution,
        solutions: ids.map((id) => byId(id) as unknown as CatalogSolution),
        ...(assignments ? { assignments } : {}),
      }).fleet ?? [];
    return buildSimulationInput(fields, {}, fleet);
  };

  it('простой паллетный склад — прежним флотом с полосами хранения', () => {
    expect(sceneWith(['FL0002']).transportLinks).toBeNull();
  });

  it('конвейер и два транспортных робота — по связям, погрузчики на последних метрах', () => {
    const input = sceneWith(['CV0001', 'FL0002', 'AM0001'], [
      { slot: 'inbound', solutionId: 'CV0001' },
      { slot: 'inbound', solutionId: 'FL0002' },
      { slot: 'inbound', solutionId: 'AM0001' },
      { slot: 'outbound', solutionId: 'FL0002' },
    ]);
    const inbound = input.transportLinks!.find((l) => l.slot === 'inbound')!;
    expect(inbound.conveyor).not.toBeNull();
    expect(inbound.carriers.map((c) => c.name).sort()).toEqual([byId('AM0001').name, byId('FL0002').name].sort());
    expect(inbound.effectiveRouteM).toBeLessThan(input.params.routeLengthM);
    expect(input.transportLinks!.find((l) => l.slot === 'outbound')!.conveyor).toBeNull();
  });
});
