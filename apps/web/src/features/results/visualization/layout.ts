/**
 * Геометрия склада для 3D-сцены симуляции. Чистая математика, без Three.js —
 * значения не привязаны к конкретному расчёту (см. WarehouseSimulation.tsx):
 * это иллюстрация «как работает автоматизация», а не отрисовка цифр расчёта.
 */

export const FLOOR = 100;
export const MARGIN = 10;

export const LANE_MIN_X = -FLOOR / 2 + MARGIN;
export const LANE_MAX_X = FLOOR / 2 - MARGIN;

export const Z_MIN = -FLOOR / 2 + 3;
export const Z_MAX = FLOOR / 2 - 3;

export type SimMode = 'vacuum' | 'arm' | 'both';

export interface ZoneWidths {
  usableWidth: number;
  vacuumZoneWidth: number;
  armZoneWidth: number;
  zoneSplitX: number;
  vacuumZoneAreaM2: number;
}

export function computeZoneWidths(mode: SimMode): ZoneWidths {
  const usableWidth = LANE_MAX_X - LANE_MIN_X;

  const vacuumZoneWidth = mode === 'vacuum' ? usableWidth : mode === 'arm' ? 0 : usableWidth * 0.55;
  const armZoneWidth = mode === 'arm' ? usableWidth : mode === 'vacuum' ? 0 : usableWidth * 0.45;
  const zoneSplitX = LANE_MIN_X + vacuumZoneWidth;
  const vacuumZoneAreaM2 = Math.round(vacuumZoneWidth * (Z_MAX - Z_MIN));

  return { usableWidth, vacuumZoneWidth, armZoneWidth, zoneSplitX, vacuumZoneAreaM2 };
}
