import { describe, expect, it } from 'vitest';
import { CELL, buildDefaultShape, setCellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { largestFloorRect } from '@/upstream/simulation/shape/shapeGeometry.js';
import { computeLayout } from '@/upstream/simulation/layout.js';
import {
  DEFAULT_LAYOUT,
  decodeShape,
  encodeShape,
  layoutMetrics,
  layoutParameters,
  type Shape,
} from '@/features/objects/layout/warehouseLayout';

/** Г-образный склад: юго-восточный угол вырезан, стеллажи, ворота выгрузки на западе. */
function lShape(): Shape {
  const shape = buildDefaultShape() as Shape;
  for (let gz = 14; gz < 25; gz += 1) for (let gx = 15; gx < 25; gx += 1) setCellAt(shape, gx, gz, CELL.EMPTY);
  for (let gx = 3; gx <= 12; gx += 1) setCellAt(shape, gx, 5, CELL.RACK);
  for (let gz = 12; gz <= 14; gz += 1) setCellAt(shape, 0, gz, CELL.GATE_IN);
  return shape;
}

describe('планировка склада', () => {
  it('форма переживает кодирование в строку паспорта', () => {
    const shape = lShape();
    const text = encodeShape(shape);
    expect(text.length).toBeLessThan(2000);
    expect(Array.from(decodeShape(text)!.cells)).toEqual(Array.from(shape.cells));
    expect(decodeShape('мусор')).toBeNull();
    expect(decodeShape('25:F10')).toBeNull();
  });

  it('контур — вся площадь склада: вырез увеличивает клетку, а не уменьшает склад', () => {
    const full = layoutMetrics(buildDefaultShape() as Shape, 20000);
    const cut = layoutMetrics(lShape(), 20000);
    expect(full.sceneAreaM2).toBe(20000);
    expect(cut.sceneAreaM2).toBeGreaterThan(20000);
    expect(cut.footprintCells * cut.cellMeters ** 2).toBeCloseTo(20000, -1);
    expect(cut.gates).toBe(6);
    expect(cut.gatesIn).toBe(1);
  });

  it('стандартная форма в расчёт не идёт, своя — формой и путём погрузчика', () => {
    expect(layoutParameters(DEFAULT_LAYOUT, 20000)).toEqual({});
    const params = layoutParameters(encodeShape(lShape()), 20000);
    expect(params.wh_layout).toBeDefined();
    expect(Number(params.wh_route_length_m)).toBeGreaterThan(0);
  });

  it('зоны роботов не выходят за контур Г-образного склада', () => {
    const shape = lShape();
    const free = largestFloorRect(shape)!;
    const layout = computeLayout(shape, ['vacuum', 'arm'], 0.5);
    const inside = (x: number, z: number) => x >= free.xMin && x <= free.xMax && z >= free.zMin && z <= free.zMax;
    const arm = layout.armZone!;
    expect(inside(arm.xMin, arm.zMin) && inside(arm.xMin + arm.width, arm.zMax)).toBe(true);
    // Вырез: x > 10, z > 6 в координатах сцены — туда зона заходить не должна.
    expect(arm.xMin + arm.width <= 10 || arm.zMax <= 6).toBe(true);
    expect(layout.vacuumZone!.dockZ).toBeLessThanOrEqual(free.zMax);
  });
});

describe('ёмкость стеллажей', () => {
  it('площадь стеллажей × паллет на м² × ярусы по высоте потолка', async () => {
    const { rackStorage } = await import('@/features/objects/layout/warehouseLayout');
    const storage = rackStorage(lShape(), {
      wh_obschaya_ploschad_sklada: '20000',
      wh_vysota_potolkov_zone_hraneniya: '10',
      wh_pallet_length: '1200',
      wh_pallet_width: '800',
      wh_pallet_height: '1600',
    })!;
    // 10 м / (1,6 м паллета + 0,2 м зазор) = 5 ярусов; 1 / (1,3 × 0,9) ≈ 0,85 паллет на м².
    expect(storage.levels).toBe(5);
    expect(storage.perLevelPerM2).toBeCloseTo(1 / 1.17, 3);
    expect(storage.pallets).toBe(Math.floor(storage.rackAreaM2 * storage.perLevelPerM2 * 5));
    expect(rackStorage(buildDefaultShape() as Shape, {})).toBeNull();
  });
});
