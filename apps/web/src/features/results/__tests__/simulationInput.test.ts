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
    expect(simRobotTypeOf(byId('p15'))).toBe('loader');
    expect(simRobotTypeOf(byId('wf3'))).toBe('loader');
    expect(simRobotTypeOf(byId('srt8'))).toBe('arm');
    expect(simRobotTypeOf(byId('ams'))).toBe('arm');
    expect(simRobotTypeOf(byId('floorclean'))).toBe('vacuum');
    expect(simRobotTypeOf(byId('drone'))).toBeNull();
  });

  it('переносит параметры склада и паспорт погрузчика в сцену', () => {
    const input = buildSimulationInput(fields, {}, byId('p15'), 'loader');

    expect(input.params.floorAreaM2).toBe(20000);
    expect(input.params.workZonePct).toBe(50);
    expect(input.params.cargoWeightKg).toBe(800);
    // 1000 поддонов/сут при 2 сменах по 11 ч
    expect(input.params.requiredLoadThroughput).toBeCloseTo(1000 / 22);
    expect(input.capacityKg).toBe(1500);
    expect(input.speedMps).toBe(1.8);
    expect(input.throughput).toBeGreaterThan(0);
    expect(input.recommendedCount).toBeGreaterThanOrEqual(1);
    expect(input.recommendedCount).toBeLessThanOrEqual(input.maxCount);
  });

  it('больше приёмка — больше погрузчиков по расчёту', () => {
    const low = buildSimulationInput(fields, { wh_obem_priemki: '500', wh_obem_otgruzki: '500' }, byId('p15'), 'loader');
    const high = buildSimulationInput(fields, { wh_obem_priemki: '5000', wh_obem_otgruzki: '5000' }, byId('p15'), 'loader');
    expect(high.requiredCount).toBeGreaterThan(low.requiredCount);
  });

  it('берёт производительность сортировщика из описания решения', () => {
    const input = buildSimulationInput(fields, {}, byId('srt8'), 'arm');
    expect(input.throughput).toBe(8000);
  });
});
