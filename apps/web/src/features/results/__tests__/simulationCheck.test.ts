import { describe, expect, it } from 'vitest';
import { deviation } from '../SimulationCheck';
import { buildVerifyRows, MIN_VERIFY_SECONDS } from '@/upstream/simulation/verification.js';

describe('сверка симуляции', () => {
  it('Δ считает к Расчёту, не к Нужно', () => {
    // Сцена ≈ расчёт парка, но сильно ниже пика паспорта — раньше было красное.
    const dev = deviation(2000, 2100, 6800);
    expect(dev.ok).toBe(true);
    expect(dev.text).toMatch(/−|-/);
  });

  it('без Расчёта (поток) — база Нужно', () => {
    const dev = deviation(85, null, 68);
    expect(dev.ok).toBe(true);
    expect(dev.text).toMatch(/\+/);
  });

  it('buildVerifyRows: Расчёт рук + note про N из M и пик', () => {
    const rows = buildVerifyRows({
      layout: { useArm: true, useLoader: false, useVacuum: false, useSorter: false, useConveyor: false },
      demand: { arm: 6800 },
      fleet: { arm: 2000 },
      stats: {
        simSeconds: MIN_VERIFY_SECONDS,
        opsDone: 1900 * (MIN_VERIFY_SECONDS / 3600),
        armPlaced: 5,
        armRequested: 12,
        vacuum: { activeSeconds: 0, cleanedCells: 0 },
        loader: {},
      },
      areaPerUnit2: 1,
      inflowPerFloor: { inbound: 0, outbound: 0 },
      routeLengthM: 90,
    });
    const arm = rows.find((r) => r.label === 'Внутрискладские операции');
    expect(arm?.calculated).toBe(2000);
    expect(arm?.note).toMatch(/не закрывает пик/);
    expect(arm?.note).toMatch(/в сцене 5 из 12/);
  });
});
