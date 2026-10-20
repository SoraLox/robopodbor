import { describe, expect, it } from 'vitest';
import {
  fillParameterDefaults,
  reconcileWarehouseAreas,
  warehouseAreaConsistencyError,
} from '@domain/parameters';
import type { ParameterFieldDef } from '@domain/parameters';

const fields: ParameterFieldDef[] = [
  {
    id: 'wh_obschaya_ploschad_sklada',
    label: 'Общая площадь',
    kind: 'number',
    min: 10000,
    max: 100000,
    defaultValue: '20000',
  },
  {
    id: 'wh_ploschad_aktivnoy_zony',
    label: 'Активная зона',
    kind: 'number',
    min: 5000,
    max: 100000,
    defaultValue: '10000',
  },
];

describe('warehouse area defaults', () => {
  it('fills empty form with active ≤ total', () => {
    const values = fillParameterDefaults(fields, {});
    expect(Number(values.wh_obschaya_ploschad_sklada)).toBe(20000);
    expect(Number(values.wh_ploschad_aktivnoy_zony)).toBe(10000);
    expect(warehouseAreaConsistencyError(values)).toBeNull();
  });

  it('repairs persisted store where active > total', () => {
    const values = fillParameterDefaults(fields, {
      wh_obschaya_ploschad_sklada: '10000',
      wh_ploschad_aktivnoy_zony: '50000',
    });
    expect(Number(values.wh_ploschad_aktivnoy_zony)).toBeLessThanOrEqual(
      Number(values.wh_obschaya_ploschad_sklada),
    );
    expect(Number(values.wh_ploschad_aktivnoy_zony)).toBe(5000);
  });

  it('reconcile shrinks active when total drops', () => {
    const values = reconcileWarehouseAreas({
      wh_obschaya_ploschad_sklada: '12000',
      wh_ploschad_aktivnoy_zony: '18000',
    });
    expect(Number(values.wh_ploschad_aktivnoy_zony)).toBe(6000);
  });

  it('reports consistency error when active exceeds total', () => {
    const err = warehouseAreaConsistencyError({
      wh_obschaya_ploschad_sklada: '10000',
      wh_ploschad_aktivnoy_zony: '15000',
    });
    expect(err?.fieldId).toBe('wh_ploschad_aktivnoy_zony');
  });
});
