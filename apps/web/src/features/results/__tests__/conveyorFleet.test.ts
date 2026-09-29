import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createConveyorFleet } from '@/upstream/simulation/conveyors/conveyorFleet.js';

const profile = { runtimeHours: null, chargeHours: null, workPowerKw: 8, idlePowerKw: 0.8 };
type Hub = { take: () => boolean; put: () => boolean };
const hubOf = (fleet: { hubs: unknown }) => (fleet.hubs as Record<number, Hub>)[0]!;
const line = (direction: 'in' | 'out') => ({ gateId: 0, direction, start: { x: 0, z: -40 }, end: { x: 0, z: 0 } });

describe('конвейерная линия связи', () => {
  it('приёмка: паллеты ждут на конце ленты, пока их не заберёт погрузчик', () => {
    const fleet = createConveyorFleet({
      group: new THREE.Group(),
      lines: [line('in')],
      throughputPerHour: 120,
      beltTexture: null,
      energyProfile: profile,
      metersPerUnit: 1.41,
    });
    // Никто не забирает — лента встаёт, «сданных» нет.
    for (let i = 0; i < 6000; i += 1) fleet.step(0.1);
    expect(fleet.getUnitsMoved()).toBe(0);
    // Погрузчик забирает с конца — час работы шагами по 0,1 с.
    for (let i = 0; i < 36000; i += 1) {
      fleet.step(0.1);
      hubOf(fleet).take();
    }
    expect(fleet.getUnitsMoved()).toBeGreaterThan(100);
  });

  it('отгрузка: паллета, поставленная у стеллажей, доезжает до ворот', () => {
    const fleet = createConveyorFleet({
      group: new THREE.Group(),
      lines: [line('out')],
      throughputPerHour: 120,
      beltTexture: null,
      energyProfile: profile,
      metersPerUnit: 1.41,
    });
    expect(hubOf(fleet).put()).toBe(true);
    // Сразу вторую не поставить — начало ленты занято.
    expect(hubOf(fleet).put()).toBe(false);
    for (let i = 0; i < 2000; i += 1) fleet.step(0.1);
    expect(fleet.getUnitsMoved()).toBe(1);
  });
});
