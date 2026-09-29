import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultShape } from '@/upstream/simulation/shape/shapeTypes.js';
import { computeArmSlots, computeLayout, linkGatesOf } from '@/upstream/simulation/layout.js';
import { planPickingNetwork } from '@/upstream/simulation/arms/pickingNetwork.js';
import { createArmFleet } from '@/upstream/simulation/arms/armFleet.js';
import { withStandardRacks } from '@/features/objects/layout/warehouseLayout';

const profile = { runtimeHours: null, chargeHours: null, workPowerKw: 2, idlePowerKw: 0.2 };

function scene(count: number) {
  const shape = withStandardRacks(buildDefaultShape() as never) as never;
  const layout = computeLayout(shape, ['arm', 'loader'], 1) as never as {
    armZone: object;
    gates: Array<{ id: number; worldCenter: { x: number; z: number } }>;
  };
  const outbound = linkGatesOf(layout as never).outbound as number[];
  const slots = computeArmSlots(layout.armZone as never, count);
  const gates = layout.gates.filter((g) => outbound.includes(g.id));
  const net = planPickingNetwork({ shape, slots, gates: gates as never });
  return { shape, layout, slots, gates, net };
}

describe('сеть участка отбора', () => {
  it('подача начинается у торца стеллажей, сборный конвейер доходит до ворот отгрузки', () => {
    const { net, gates } = scene(4);
    expect(net.rows).toHaveLength(1);
    const row = net.rows[0]!;
    // Отвод подачи упирается в последний ряд стеллажей (z = 18).
    expect(row.feed.points[0]!.z).toBeLessThan(19.5);
    // Конец сборного — в проёме одних из ворот отгрузки.
    const end = row.take.points[row.take.points.length - 1]!;
    const nearest = Math.min(...gates.map((g) => Math.hypot(g.worldCenter.x - end.x, g.worldCenter.z - end.z)));
    expect(nearest).toBeLessThan(8);
    // Участки сборного — только вдоль осей, без диагоналей.
    for (const s of row.take.segments) expect(Math.min(Math.abs(s.b.x - s.a.x), Math.abs(s.b.z - s.a.z))).toBeLessThan(1e-6);
  });

  it('руки берут товар с подачи и сдают на сборный — до ворот доезжает отобранное', () => {
    const { layout, slots, net } = scene(3);
    const fleet = createArmFleet({
      group: new THREE.Group(),
      zone: layout.armZone,
      count: 3,
      beltTexture: null,
      armProd: 12,
      energyProfile: profile,
      slots,
      network: net,
    });
    for (let i = 0; i < 6000; i += 1) fleet.step(0.1);
    // 10 минут: 3 руки × 12 оп/мин — сотни операций, и почти всё уже у ворот.
    expect(fleet.getOpsDone()).toBeGreaterThan(200);
    expect(fleet.getDelivered()).toBeGreaterThan(fleet.getOpsDone() * 0.8);
  });
});
