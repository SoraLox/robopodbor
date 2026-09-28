import { describe, expect, it } from 'vitest';
import { calculateEconomics } from '@domain/economics';
import type { CatalogSolution } from '@domain/catalog';
import type { Solution } from '@/api/types';
import { solutions, objectParameters } from '@/mocks/fixtures';
import { buildSimulationInput, simModelOf, simRobotTypeOf } from '@/features/results/simulation/simulationInput';
import { buildAirportInput, hasAirportScene } from '@/features/results/simulation/airportInput';

const byId = (id: string) => solutions.find((s) => s.id === id) as Solution;

describe('3D-модели upstream для наших роботов', () => {
  it('AMR показываем платформой LowCart, погрузчик — погрузчиком', () => {
    expect(simModelOf(byId('AM0001'), 'loader')).toBe('transporter');
    expect(simModelOf(byId('FL0002'), 'loader')).toBeUndefined();
  });

  it('система хранения получает сцену СтойкаБокс', () => {
    const smartCube = byId('AS0001');
    expect(simRobotTypeOf(smartCube)).toBe('loader');
    expect(simModelOf(smartCube, 'loader')).toBe('storagecube');
  });

  it('у стационарной системы хранения не пишем «скорость — null»', () => {
    const fields = objectParameters.warehouse ?? [];
    const solution = byId('AS0001') as unknown as CatalogSolution;
    const fleet = calculateEconomics({ objectType: 'warehouse', parameters: {}, fields, solution }).fleet ?? [];
    const input = buildSimulationInput(fields, {}, fleet);
    expect(input.fleets.loader?.model).toBe('storagecube');
    expect(input.fleets.loader!.substitutions.map((item) => item.value).join(' ')).not.toMatch(/null|undefined/);
  });
});

describe('сцена аэропорта', () => {
  it('только для транспортных роботов багажа, перрона и грузов', () => {
    expect(hasAirportScene(byId('AM0001'))).toBe(true);
    expect(hasAirportScene(byId('FC0001'))).toBe(false);
  });

  it('берёт гейты и рейсы из паспорта, а число роботов — из экономики', () => {
    const input = buildAirportInput(objectParameters.airport ?? [], { ap_kolichestvo_vyhodov_posadku: '12' }, byId('AM0001'), {
      solutionId: 'AM0001',
      count: 7,
    });
    expect(input.gatesCount).toBe(12);
    expect(input.transportCount).toBe(7);
    expect(input.demand.transport).toBe(32 * 18);
  });
});

describe('СтойкаБокс: шаттлы — роботы, башни — ёмкость', () => {
  it('шаттлов столько, сколько в расчёте, башни — от паллетомест паспорта', () => {
    const fields = objectParameters.warehouse ?? [];
    const solution = byId('AS0004') as unknown as CatalogSolution;
    const result = calculateEconomics({ objectType: 'warehouse', parameters: {}, fields, solution });
    const cube = result.fleet![0]!;
    expect(cube.model).toBe('storagecube');
    // 20 000 паллетомест / 5 ярусов (10 м / (1,6 + 0,2) м).
    expect(cube.storageTowers).toBe(4000);
    expect(result.assumptions.some((line) => line.includes('шаттлы над сеткой башен'))).toBe(true);
    const input = buildSimulationInput(fields, {}, result.fleet!);
    expect(input.fleets.loader!.requiredCount).toBe(cube.count);
    expect(input.fleets.loader!.storageTowers).toBe(4000);
  });
});
