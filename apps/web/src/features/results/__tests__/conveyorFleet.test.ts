import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createConveyorFleet } from '@/upstream/simulation/conveyors/conveyorFleet.js';

const profile = { runtimeHours: null, chargeHours: null, workPowerKw: 8, idlePowerKw: 0.8 };

describe('конвейерная линия', () => {
  it('везёт груз с темпом паспортной производительности', () => {
    const group = new THREE.Group();
    const fleet = createConveyorFleet({
      group,
      lines: [{ start: { x: 0, z: -40 }, end: { x: 0, z: 0 } }],
      throughputPerHour: 120,
      energyProfile: profile,
      metersPerUnit: 1.41,
    });
    // Час работы шагами по 0,1 с.
    for (let i = 0; i < 36000; i += 1) fleet.step(0.1);
    // 120 ед./ч минус то, что ещё едет по ленте.
    expect(fleet.getUnitsMoved()).toBeGreaterThan(100);
    expect(fleet.getUnitsMoved()).toBeLessThanOrEqual(120);
  });
});
