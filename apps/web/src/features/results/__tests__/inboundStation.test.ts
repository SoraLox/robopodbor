import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultShape, CELL, cellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { withStandardRacks } from '@/features/objects/layout/warehouseLayout';
import { computeLayout, linkGatesOf } from '@/upstream/simulation/layout.js';
import { createCustomLoaderFleet } from '@/upstream/simulation/loaders/customLoaderFleet.js';
import { blockedNav, createShuttleFleet } from '@/upstream/simulation/loaders/shuttleFleet.js';
import { createTraffic } from '@/upstream/simulation/loaders/driver.js';
import { cellOfPoint, makeNavGrid } from '@/upstream/simulation/loaders/gridPath.js';
import { createInboundStation, planInboundStation, stationObstacles } from '@/upstream/simulation/arms/inboundStation.js';

type Agent = { pos: { x: number; z: number } };
const profile = { runtimeHours: null, chargeHours: null, workPowerKw: 1, idlePowerKw: 0.1 };
const cargo = { lengthCm: 120, widthCm: 80, heightCm: 120, skuCount: 100, oversizedSharePct: 0 };
const robot = () => ({ group: new THREE.Group(), carry: new THREE.Group(), setForkLift: () => {}, setCargoDepth: () => {} });
const rig = () => ({ group: new THREE.Group(), claw: new THREE.Group(), pose: () => {} });

describe('станция приёмки', () => {
  it('фура → погрузчик → карусель → роборука → транспортировщик → погрузчик → стеллаж', () => {
    const shape = withStandardRacks(buildDefaultShape() as never) as never;
    const layout = computeLayout(shape, ['loader', 'arm'], 1) as never as { gates: Array<{ id: number }> };
    const split = linkGatesOf(layout as never) as { inbound: number[] };
    const gates = layout.gates.filter((g) => split.inbound.includes(g.id));
    const plan = planInboundStation({ nav: blockedNav(shape, []), gates, armCount: 4 });
    expect(plan).toBeTruthy();
    expect(plan!.arms.length).toBe(4);
    console.log('PLAN', JSON.stringify(plan!.arms.map((a) => a.park)), JSON.stringify(plan!.holds), JSON.stringify(plan!.drops.map((d) => d.stand)));

    const traffic = createTraffic();
    const blocked = stationObstacles(plan!);
    const rackBays = { b: plan!.rackBay };
    expect(rackBays).toBeTruthy();
    console.log('B', JSON.stringify(rackBays!.b));
    const group = new THREE.Group();
    const shuttle = createShuttleFleet({
      group,
      shape,
      bays: { loads: plan!.arms.map((a) => a.park), holds: plan!.holds, b: rackBays!.b },
      count: 4,
      direction: 'in',
      speedMps: 1.8,
      metersPerUnit: 1.41,
      cargo,
      energyProfile: profile,
      traffic,
      blockedRects: blocked,
      robotFactory: robot,
    });
    const station = createInboundStation({
      group,
      plan: plan!,
      beltTexture: null,
      rigFactory: rig,
      opsPerMinute: 6,
      energyProfile: profile,
      itemHeight: 1.9,
      loadBays: shuttle.loadBays,
    });
    const base = {
      group,
      shape,
      capacityKg: 1000,
      cargoWeightKg: 500,
      speedMps: 2,
      metersPerUnit: 1.41,
      cargo,
      energyProfile: profile,
      routeLengthM: 40,
      robotFactory: robot,
      truckFactory: () => ({ group: new THREE.Group(), setDoors: () => {}, dispose: () => {} }),
      traffic,
      blockedRects: blocked,
      direction: 'in',
    };
    const gateSide = createCustomLoaderFleet({ ...base, count: 3, gateIds: gates.map((g) => g.id), storageHub: station.drops, showTrucks: true });
    const rackSide = createCustomLoaderFleet({
      ...base,
      count: 2,
      gateIds: [gates[0]!.id],
      handoffs: { [gates[0]!.id]: shuttle.bayB },
      rackNear: shuttle.bayB.park,
      showTrucks: false,
    });

    const nav = makeNavGrid(shape);
    let minGap = Infinity;
    let inRack = 0;
    for (let i = 0; i < 18000; i += 1) {
      station.step(0.1);
      shuttle.step(0.1);
      gateSide.step(0.1);
      rackSide.step(0.1);
      if (i % 5) continue;
      const agents = traffic.list() as Agent[];
      for (let a = 0; a < agents.length; a++) {
        const p = agents[a]!.pos;
        const c = cellOfPoint(nav, p) as { gx: number; gz: number };
        if (cellAt(shape, c.gx, c.gz) === CELL.RACK) inRack += 1;
        for (let b = a + 1; b < agents.length; b++) minGap = Math.min(minGap, Math.hypot(p.x - agents[b]!.pos.x, p.z - agents[b]!.pos.z));
      }
    }
    const placed = gateSide.getStats().cycles;
    const picked = station.getOpsDone();
    const hauled = shuttle.getDelivered();
    const stored = rackSide.getStats().cycles;
    console.log('поставлено на карусель', placed, 'рука сняла', picked, 'довезено', hauled, 'в стеллаж', stored, { minGap, inRack });
    // Груз проходит всю цепочку: на каждом следующем шаге — не больше, чем на предыдущем.
    expect(placed).toBeGreaterThan(10);
    expect(picked).toBeGreaterThan(5);
    expect(picked).toBeLessThanOrEqual(placed);
    expect(hauled).toBeLessThanOrEqual(picked);
    expect(stored).toBeLessThanOrEqual(hauled);
    expect(stored).toBeGreaterThan(3);
    expect(inRack).toBe(0);
    expect(minGap).toBeGreaterThan(1.6);
  });
});
