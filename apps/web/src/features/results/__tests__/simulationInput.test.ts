import { describe, expect, it } from 'vitest';
import { objectParameters, solutions } from '@/mocks/fixtures';
import {
  buildSimulationInput,
  parseLeadingNumber,
  simRobotTypeOf,
} from '@/features/results/simulation/simulationInput';

const fields = objectParameters.warehouse ?? [];
const byId = (id: string) => solutions.find((s) => s.id === id)!;

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

  it('переносит параметры склада и паспорт погрузчика в сцену', () => {
    const input = buildSimulationInput(fields, {}, byId('AM0001'), 'loader');

    expect(input.params.floorAreaM2).toBe(20000);
    expect(input.params.workZonePct).toBe(50);
    expect(input.params.cargoWeightKg).toBe(800);
    // 1000 поддонов/сут при 2 сменах по 11 ч
    expect(input.params.requiredLoadThroughput).toBeCloseTo(1000 / 22);
    expect(input.capacityKg).toBe(1500);
    expect(input.speedMps).toBe(1.5);
    expect(input.throughput).toBeGreaterThan(0);
    expect(input.recommendedCount).toBeGreaterThanOrEqual(1);
    expect(input.recommendedCount).toBeLessThanOrEqual(input.maxCount);
  });

  it('больше приёмка — больше погрузчиков по расчёту', () => {
    const low = buildSimulationInput(fields, { wh_obem_priemki: '500', wh_obem_otgruzki: '500' }, byId('AM0001'), 'loader');
    const high = buildSimulationInput(fields, { wh_obem_priemki: '5000', wh_obem_otgruzki: '5000' }, byId('AM0001'), 'loader');
    expect(high.requiredCount).toBeGreaterThan(low.requiredCount);
  });

  it('берёт производительность роборуки из карточки каталога', () => {
    const input = buildSimulationInput(fields, {}, byId('RC0007'), 'arm');
    expect(input.throughput).toBe(6000);
  });
});
