import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CELL, cellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { standardLayoutShape } from '@/features/objects/layout/warehouseLayout';
import { computeLayout, linkGatesOf } from '@/upstream/simulation/layout.js';
import { blockedNav } from '@/upstream/simulation/loaders/shuttleFleet.js';
import { cellOfPoint, makeNavGrid } from '@/upstream/simulation/loaders/gridPath.js';
import { pickStationObstacles, planPickStation } from '@/upstream/simulation/arms/pickStation.js';
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
  const nav = blockedNav(shape, []);
  const plan = planPickStation({ nav, shape, gates: layout.gates, armCount: 3 })!;
  const blocked = pickStationObstacles(plan, nav);
  return { shape, plan, blocked, inGates, outGates };
}

type Ops = ReturnType<typeof createWarehouseOps>;
type Res = { t0: number; t1: number; id: number };

// Час работы: шаги по 0,1 с; следим, чтобы роботы не сближались и не заезжали в стеллажи.
function runHour(ops: Ops, shape: never) {
  const nav = makeNavGrid(shape);
  let minGap = Infinity;
  let inRack = 0;
  for (let i = 0; i < 36000; i += 1) {
    ops.step(0.1);
    if (i % 10) continue;
    const agents = ops.agents() as Array<{ pos: { x: number; z: number } }>;
    for (let a = 0; a < agents.length; a++) {
      const p = agents[a]!.pos;
      const c = cellOfPoint(nav, p) as { gx: number; gz: number };
      if (cellAt(shape, c.gx, c.gz) === CELL.RACK) inRack += 1;
      for (let b = a + 1; b < agents.length; b++) minGap = Math.min(minGap, Math.hypot(p.x - agents[b]!.pos.x, p.z - agents[b]!.pos.z));
    }
  }
  // Брони планировщика: ни одна клетка не занята двумя роботами одновременно.
  let overlaps = 0;
  for (const list of (ops.planner.table as Map<number, Res[]>).values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (list[a]!.id !== list[b]!.id && list[a]!.t0 < list[b]!.t1 && list[b]!.t0 < list[a]!.t1) overlaps += 1;
      }
    }
  }
  const snap = ops.snapshot();
  console.log('приёмка', snap.doneIn, 'отгрузка', snap.doneOut, 'отбор', snap.donePick, 'коробок', snap.cartons, 'в работе', snap.inFlight, { minGap, inRack, overlaps });
  console.log('загрузка', ops.bottleneck().map((g) => `${g.label} ${Math.round(g.load * 100)}%`).join('; '));
  return { snap, minGap, inRack, overlaps };
}

describe('диспетчер склада', () => {
  // Ячейки выбираются случайно — фиксируем, чтобы прогон был повторяемым.
  let seed = 7;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const forklifts = { count: 4, speedMps: 2, capacityKg: 1000, energyProfile: profile };
  const amrs = { count: 4, speedMps: 1.8, energyProfile: profile };
  const base = (shape: never, blockedRects: unknown[]) => ({
    group: new THREE.Group(),
    armGroup: new THREE.Group(),
    shape,
    metersPerUnit: 1.41,
    blockedRects,
    cargo,
    cargoWeightKg: 500,
    truckPayload: 12,
    beltTexture: null,
    factories,
  });

  it('приёмка и отгрузка через AMR, отбор роборуками: маршруты расписаны, роботы не встречаются', () => {
    const { shape, plan, blocked, inGates, outGates } = scene();
    const ops = createWarehouseOps({
      ...base(shape, blocked),
      links: [
        { slot: 'inbound', gates: inGates, forklifts, amrs },
        { slot: 'outbound', gates: outGates, forklifts, amrs },
      ],
      picking: { plan, armProd: 6, energyProfile: profile },
    });
    const { snap, minGap, inRack, overlaps } = runHour(ops, shape);
    expect(snap.doneIn).toBeGreaterThan(30);
    expect(snap.doneOut).toBeGreaterThan(15);
    // Руки разбирают кучки: паллеты приезжают, коробки уходят по ленте в стену.
    expect(snap.donePick).toBeGreaterThan(3);
    expect(snap.cartons).toBeGreaterThan(30);
    // Общие пулы: никто не простаивает больше половины времени.
    for (const g of ops.bottleneck()) expect(g.load).toBeGreaterThan(0.5);
    expect(inRack).toBe(0);
    expect(overlaps).toBe(0);
    expect(minGap).toBeGreaterThan(2);
  }, 180_000);

  it('приёмка погрузчиками, отгрузка через AMR: груз берут из горки у ворот', () => {
    const { shape, inGates, outGates } = scene();
    const ops = createWarehouseOps({
      ...base(shape, []),
      links: [
        { slot: 'inbound', gates: inGates, forklifts },
        { slot: 'outbound', gates: outGates, forklifts, amrs },
      ],
    });
    const { snap, minGap, inRack, overlaps } = runHour(ops, shape);
    expect(snap.doneIn).toBeGreaterThan(30);
    expect(snap.doneOut).toBeGreaterThan(15);
    expect(inRack).toBe(0);
    expect(overlaps).toBe(0);
    expect(minGap).toBeGreaterThan(2);
  }, 180_000);
});
