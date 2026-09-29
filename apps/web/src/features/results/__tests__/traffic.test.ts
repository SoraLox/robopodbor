import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultShape, CELL, cellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { withStandardRacks } from '@/features/objects/layout/warehouseLayout';
import { computeLayout, linkGatesOf } from '@/upstream/simulation/layout.js';
import { createCustomLoaderFleet } from '@/upstream/simulation/loaders/customLoaderFleet.js';
import { createShuttleFleet, planShuttleBays } from '@/upstream/simulation/loaders/shuttleFleet.js';
import { createTraffic } from '@/upstream/simulation/loaders/driver.js';
import { cellOfPoint, makeNavGrid } from '@/upstream/simulation/loaders/gridPath.js';

type Agent = { pos: { x: number; z: number } };
const profile = { runtimeHours: null, chargeHours: null, workPowerKw: 1, idlePowerKw: 0.1 };
const cargo = { lengthCm: 120, widthCm: 80, heightCm: 120, skuCount: 100, oversizedSharePct: 0 };
const robot = () => ({ group: new THREE.Group(), carry: new THREE.Group(), setForkLift: () => {}, setCargoDepth: () => {} });

function setup() {
  const shape = withStandardRacks(buildDefaultShape() as never) as never;
  const layout = computeLayout(shape, ['loader'], 1) as never as { gates: Array<{ id: number; worldCenter: { x: number; z: number }; normal: number[] }> };
  const split = linkGatesOf(layout as never) as { inbound: number[]; outbound: number[] };
  const traffic = createTraffic();
  const base = {
    group: new THREE.Group(),
    shape,
    capacityKg: 1000,
    cargoWeightKg: 500,
    speedMps: 2,
    metersPerUnit: 1.41,
    cargo,
    energyProfile: profile,
    routeLengthM: 60,
    robotFactory: robot,
    truckFactory: () => ({ group: new THREE.Group(), setDoors: () => {}, dispose: () => {} }),
    traffic,
  };
  return { shape, layout, split, traffic, base };
}

// Корпуса не пересекаются, в стеллажи не заезжают.
function watcher(shape: never, list: () => Agent[]) {
  const nav = makeNavGrid(shape);
  let minGap = Infinity;
  let inRack = 0;
  return {
    check() {
      const agents = list();
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i]!.pos;
        const c = cellOfPoint(nav, a) as { gx: number; gz: number };
        if (cellAt(shape, c.gx, c.gz) === CELL.RACK) inRack += 1;
        for (let j = i + 1; j < agents.length; j++) {
          const b = agents[j]!.pos;
          minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
    },
    result: () => ({ minGap, inRack }),
  };
}

describe('движение мобильных роботов', () => {
  it('погрузчики приёмки и отгрузки работают, не проезжают друг сквозь друга и сквозь стеллажи', () => {
    const { shape, split, base, traffic } = setup();
    const inbound = createCustomLoaderFleet({ ...base, count: 6, gateIds: split.inbound, direction: 'in', showTrucks: true });
    const outbound = createCustomLoaderFleet({ ...base, count: 4, gateIds: split.outbound, direction: 'out', showTrucks: true });
    const w = watcher(shape, () => traffic.list() as Agent[]);
    for (let i = 0; i < 12000; i += 1) {
      inbound.step(0.1);
      outbound.step(0.1);
      if (i % 5 === 0) w.check();
    }
    const r = w.result();
    console.log('погрузчики', r, inbound.getStats().cycles, outbound.getStats().cycles);
    expect(inbound.getStats().cycles + outbound.getStats().cycles).toBeGreaterThan(20);
    expect(r.inRack).toBe(0);
    expect(r.minGap).toBeGreaterThan(1.6);
  });

  it('транспортировщик сам не грузится: груз ставит и снимает погрузчик', () => {
    const { shape, split, base, traffic, layout } = setup();
    const gate = layout.gates.find((g) => g.id === split.inbound[0])!;
    const bays = planShuttleBays({
      shape,
      gatePoint: { x: gate.worldCenter.x - gate.normal[0]! * 6, z: gate.worldCenter.z - gate.normal[1]! * 6 },
      routeUnits: 40,
    });
    expect(bays).toBeTruthy();
    const shuttle = createShuttleFleet({
      group: new THREE.Group(),
      shape,
      bays,
      count: 3,
      direction: 'in',
      speedMps: 1.8,
      metersPerUnit: 1.41,
      cargo,
      energyProfile: profile,
      traffic,
      robotFactory: robot,
    });
    // Без погрузчиков транспортировщики стоят пустые на месте погрузки.
    for (let i = 0; i < 3000; i += 1) shuttle.step(0.1);
    expect(shuttle.getDelivered()).toBe(0);

    const gateSide = createCustomLoaderFleet({ ...base, count: 2, gateIds: [gate.id], direction: 'in', storageHub: shuttle.bayA, showTrucks: true });
    const rackSide = createCustomLoaderFleet({
      ...base,
      count: 2,
      gateIds: [gate.id],
      direction: 'in',
      handoffs: { [gate.id]: shuttle.bayB },
      rackNear: shuttle.bayB.park,
      showTrucks: false,
    });
    const w = watcher(shape, () => traffic.list() as Agent[]);
    for (let i = 0; i < 18000; i += 1) {
      shuttle.step(0.1);
      gateSide.step(0.1);
      rackSide.step(0.1);
      if (i % 5 === 0) w.check();
    }
    const r = w.result();
    console.log('челнок', r, shuttle.getDelivered(), rackSide.getStats().cycles);
    expect(shuttle.getDelivered()).toBeGreaterThan(10);
    expect(rackSide.getStats().cycles).toBeGreaterThan(10);
    expect(r.inRack).toBe(0);
    expect(r.minGap).toBeGreaterThan(1.6);
  });
});
