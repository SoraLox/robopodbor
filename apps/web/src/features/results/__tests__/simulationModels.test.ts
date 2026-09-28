import { describe, expect, it } from 'vitest';
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
    const input = buildSimulationInput(objectParameters.warehouse ?? [], {}, byId('AS0001'), 'loader');
    expect(input.substitutions.map((item) => item.value).join(' ')).not.toMatch(/null|undefined/);
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
