import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CELL, cellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { standardLayoutShape } from '@/features/objects/layout/warehouseLayout';
import { computeLayout, linkGatesOf } from '@/upstream/simulation/layout.js';
import { blockedNav, planShuttleBays } from '@/upstream/simulation/loaders/shuttleFleet.js';
import { createTraffic } from '@/upstream/simulation/loaders/driver.js';
import { cellOfPoint, makeNavGrid } from '@/upstream/simulation/loaders/gridPath.js';
import { planInboundStation, stationObstacles } from '@/upstream/simulation/arms/inboundStation.js';
import { createWarehouseOps } from '@/upstream/simulation/ops/warehouseOps.js';

type Gate = { id: number; worldCenter: { x: number; z: number }; normal: number[] };
const profile = { runtimeHours: null, chargeHours: null, workPowerKw: 1, idlePowerKw: 0.1 };
const cargo = { lengthCm: 120, widthCm: 80, heightCm: 120, skuCount: 100, oversizedSharePct: 0 };
const robot = () => ({ group: new THREE.Group(), carry: new THREE.Group(), setForkLift: () => {}, setCargoDepth: () => {} });
const factories = {
  forklift: () => robot,
  transporter: robot,
  truck: () => ({ group: new THREE.Group(), setDoors: () => {}, dispose: () => {} }),
  arm: () => ({ group: new THREE.Group(), claw: new THREE.Group(), pose: () => {} }),
};

function scene() {
  const shape = standardLayoutShape() as never;
  const layout = computeLayout(shape, ['loader', 'arm'], 1) as never as { gates: Gate[] };
  const split = linkGatesOf(layout as never) as { inbound: number[]; outbound: number[] };
  const inGates = layout.gates.filter((g) => split.inbound.includes(g.id));
  const outGates = layout.gates.filter((g) => split.outbound.includes(g.id));
  const plan = planInboundStation({ nav: blockedNav(shape, []), gates: inGates, armCount: 4 })!;
  const blocked = stationObstacles(plan);
  const g = outGates[0]!;
  const outBays = planShuttleBays({
    shape,
    blockedRects: blocked,
    gatePoint: { x: g.worldCenter.x - g.normal[0]! * 6, z: g.worldCenter.z - g.normal[1]! * 6 },
    routeUnits: 30,
    avoid: [...plan.holds, ...plan.arms.map((a) => a.park), plan.rackBay.park],
  })!;
  return { shape, plan, blocked, inGates, outGates, outBays };
}

describe('диспетчер склада', () => {
  // Ячейки выбираются случайно — фиксируем, чтобы прогон был повторяемым.
  let seed = 7;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  it('станция приёмки и отгрузка через AMR: каждая паллета идёт по своему маршруту', () => {
    const { shape, plan, blocked, inGates, outGates, outBays } = scene();
    const traffic = createTraffic();
    const forklifts = { count: 4, speedMps: 2, capacityKg: 1000, energyProfile: profile };
    const amrs = { count: 4, speedMps: 1.8, energyProfile: profile };
    const ops = createWarehouseOps({
      group: new THREE.Group(),
      armGroup: new THREE.Group(),
      shape,
      metersPerUnit: 1.41,
      traffic,
      blockedRects: blocked,
      cargo,
      cargoWeightKg: 500,
      truckPayload: 12,
      beltTexture: null,
      factories,
      links: [
        { slot: 'inbound', gates: inGates, forklifts, amrs, station: { plan, armProd: 6, energyProfile: profile } },
        { slot: 'outbound', gates: outGates, forklifts, amrs, bays: outBays },
      ],
    });
    const nav = makeNavGrid(shape);
    let minGap = Infinity;
    let inRack = 0;
    for (let i = 0; i < 36000; i += 1) {
      ops.step(0.1);
      if (i % 10) continue;
      const agents = traffic.list() as Array<{ pos: { x: number; z: number } }>;
      for (let a = 0; a < agents.length; a++) {
        const p = agents[a]!.pos;
        const c = cellOfPoint(nav, p) as { gx: number; gz: number };
        if (cellAt(shape, c.gx, c.gz) === CELL.RACK) inRack += 1;
        for (let b = a + 1; b < agents.length; b++) minGap = Math.min(minGap, Math.hypot(p.x - agents[b]!.pos.x, p.z - agents[b]!.pos.z));
      }
    }
    const snap = ops.snapshot();
    console.log('приёмка', snap.doneIn, 'отгрузка', snap.doneOut, 'в работе', snap.inFlight, 'руки', ops.getOpsDone(), { minGap, inRack });
    console.log('загрузка', ops.bottleneck().map((g) => `${g.label} ${Math.round(g.load * 100)}%`).join('; '));
    console.log(snap.agents.join(' | '));
    // Час работы: обе стороны выполняют задания, ничего не стоит намертво.
    expect(snap.doneIn).toBeGreaterThan(15);
    expect(snap.doneOut).toBeGreaterThan(10);
    expect(ops.getOpsDone()).toBeGreaterThanOrEqual(snap.doneIn);
    expect(inRack).toBe(0);
    expect(minGap).toBeGreaterThan(1.6);
  }, 60_000);
});
