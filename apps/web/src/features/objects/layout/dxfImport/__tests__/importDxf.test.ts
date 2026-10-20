import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CELL } from '@/upstream/simulation/shape/shapeTypes.js';
import { computeGateClusters } from '@/upstream/simulation/shape/shapeGeometry.js';
import { importDxfText } from '@/features/objects/layout/dxfImport/importDxfToShape';
import { parseDxf } from '@/features/objects/layout/dxfImport/parseDxf';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function readFixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

function counts(shape: { cells: Uint8Array }) {
  let floor = 0;
  let rack = 0;
  let empty = 0;
  for (const value of shape.cells) {
    if (value === CELL.EMPTY) empty += 1;
    else if (value === CELL.RACK) rack += 1;
    else if (value !== CELL.EMPTY) floor += 1; // floor + gates
  }
  return { floor, rack, empty, footprint: 625 - empty };
}

describe('import DXF → Shape', () => {
  it('парсит ASCII DXF warehouse-bay', () => {
    const doc = parseDxf(readFixture('warehouse-bay.dxf'));
    expect(doc.insunits).toBe(1);
    expect(doc.lines.length).toBeGreaterThan(10);
    expect(doc.inserts.some((i) => i.name === 'RACK-BAY')).toBe(true);
  });

  it('warehouse-bay: ворота сверху/снизу, стеллажи параллельными парами', () => {
    const { shape, warnings } = importDxfText(readFixture('warehouse-bay.dxf'));
    const c = counts(shape);
    expect(c.footprint).toBeGreaterThan(20);
    expect(c.rack).toBeGreaterThan(0);
    expect((computeGateClusters(shape) as unknown[]).length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toMatch(/сверху и снизу/);

    const n = shape.gridSize;
    let gateInGz = 0;
    let gateInN = 0;
    let gateOutGz = 0;
    let gateOutN = 0;
    const rackRows: Array<{ gz: number; left: boolean; right: boolean }> = [];
    for (let gz = 0; gz < n; gz += 1) {
      let left = false;
      let right = false;
      const mid = Math.floor(n / 2);
      for (let gx = 0; gx < n; gx += 1) {
        const value = shape.cells[gz * n + gx]!;
        if (value === CELL.GATE_IN) {
          gateInGz += gz;
          gateInN += 1;
        }
        if (value === CELL.GATE_OUT) {
          gateOutGz += gz;
          gateOutN += 1;
        }
        if (value === CELL.RACK) {
          if (gx < mid) left = true;
          else right = true;
        }
      }
      if (left || right) rackRows.push({ gz, left, right });
    }
    expect(gateInN).toBeGreaterThan(0);
    expect(gateOutN).toBeGreaterThan(0);
    expect(gateInGz / gateInN).toBeLessThan(gateOutGz / gateOutN);
    // Пары слева/справа на одном gz — не «лесенка».
    const paired = rackRows.filter((r) => r.left && r.right).length;
    expect(paired).toBeGreaterThanOrEqual(3);
  });

  it('loading-dock: ворота выгрузки на контуре', () => {
    const { shape } = importDxfText(readFixture('loading-dock.dxf'));
    expect(counts(shape).footprint).toBeGreaterThan(10);
    const clusters = computeGateClusters(shape) as Array<{ kind: string }>;
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.some((cl) => cl.kind === 'in' || cl.kind === 'generic')).toBe(true);
  });

  it('Склад2-Тело2: стеллажи по рядам сверху чертежа, не типовой шаблон', () => {
    const { shape, warnings } = importDxfText(readFixture('Склад2-Тело2.dxf'));
    const c = counts(shape);
    expect(c.footprint).toBeGreaterThan(50);
    expect(c.rack).toBeGreaterThan(0);
    expect((computeGateClusters(shape) as unknown[]).length).toBeGreaterThan(0);
    expect(warnings.some((w) => /параллельн/i.test(w))).toBe(true);
    expect(warnings.join(' ')).not.toMatch(/типово/);

    const n = shape.gridSize;
    let rackSumGz = 0;
    let rackN = 0;
    let floorMinGz = n;
    let floorMaxGz = 0;
    let gateInGx = 0;
    let gateInN = 0;
    let gateOutGx = 0;
    let gateOutGz = 0;
    let gateOutN = 0;
    let aisleGaps = 0;
    for (let gz = 0; gz < n; gz += 1) {
      let rowHasRack = false;
      let rowHasFloorBetween = false;
      let seenRack = false;
      for (let gx = 0; gx < n; gx += 1) {
        const value = shape.cells[gz * n + gx]!;
        if (value === CELL.EMPTY) continue;
        floorMinGz = Math.min(floorMinGz, gz);
        floorMaxGz = Math.max(floorMaxGz, gz);
        if (value === CELL.RACK) {
          rackSumGz += gz;
          rackN += 1;
          rowHasRack = true;
          seenRack = true;
        } else if (value === CELL.FLOOR && seenRack) {
          rowHasFloorBetween = true;
        }
        if (value === CELL.GATE_IN) {
          gateInGx += gx;
          gateInN += 1;
        }
        if (value === CELL.GATE_OUT) {
          gateOutGx += gx;
          gateOutGz += gz;
          gateOutN += 1;
        }
      }
      void rowHasFloorBetween;
      void rowHasRack;
    }
    // Между рядами стеллажей по gz есть хотя бы один проезд (FLOOR).
    const rackRows: number[] = [];
    for (let gz = 0; gz < n; gz += 1) {
      let any = false;
      for (let gx = 0; gx < n; gx += 1) {
        if (shape.cells[gz * n + gx] === CELL.RACK) {
          any = true;
          break;
        }
      }
      if (any) rackRows.push(gz);
    }
    for (let i = 1; i < rackRows.length; i += 1) {
      if (rackRows[i]! - rackRows[i - 1]! >= 2) aisleGaps += 1;
    }
    expect(aisleGaps).toBeGreaterThanOrEqual(1);

    const rackMeanGz = rackSumGz / rackN;
    const midGz = (floorMinGz + floorMaxGz) / 2;
    expect(rackMeanGz).toBeLessThan(midGz);

    // Синие слева, жёлтые справа и не ниже середины корпуса.
    expect(gateInN).toBeGreaterThan(0);
    expect(gateOutN).toBeGreaterThan(0);
    expect(gateInGx / gateInN).toBeLessThan(gateOutGx / gateOutN);
    expect(gateOutGz / gateOutN).toBeLessThan(midGz + 2);
  });

  it('warehouse-office: контур и ворота (можно править кистью)', () => {
    const { shape, warnings } = importDxfText(readFixture('warehouse-office.dxf'));
    expect(counts(shape).footprint).toBeGreaterThan(5);
    expect((computeGateClusters(shape) as unknown[]).length).toBeGreaterThan(0);
    expect(warnings.some((w) => /офис/i.test(w))).toBe(true);
  });

  it('бинарный DXF отклоняется', () => {
    expect(() => importDxfText('AutoCAD Binary DXF\n\0')).toThrow(/Бинарный/);
  });
});
