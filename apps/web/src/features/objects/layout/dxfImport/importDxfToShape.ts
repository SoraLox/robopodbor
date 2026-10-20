/**
 * Публичный вход: ASCII DXF → Shape конструктора склада.
 */

import { CELL } from '@/upstream/simulation/shape/shapeTypes.js';
import { computeGateClusters } from '@/upstream/simulation/shape/shapeGeometry.js';
import type { Shape } from '@/features/objects/layout/warehouseLayout';
import { parseDxf } from './parseDxf';
import { extractSemantics, type GateCandidate, type RackFootprint, type Segment } from './semantics';
import { rasterizeSemantics } from './rasterize';
import { applyHeuristics } from './heuristics';

export type DxfImportResult = {
  shape: Shape;
  warnings: string[];
  /** Геометрия чертежа в метрах — для превью слева. */
  preview: {
    segments: Segment[];
    racks: RackFootprint[];
    gates: GateCandidate[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  };
};

function hasFloor(shape: Shape): boolean {
  return shape.cells.some((v) => v !== CELL.EMPTY);
}

/** Синхронный импорт из текста DXF. */
export function importDxfText(text: string): DxfImportResult {
  const doc = parseDxf(text);
  const semantics = extractSemantics(doc);
  const raster = rasterizeSemantics(semantics);
  const { shape, warnings: heurWarnings } = applyHeuristics(raster.shape);

  if (!hasFloor(shape)) {
    throw new Error('В чертеже нет контура здания.');
  }
  if (!(computeGateClusters(shape) as unknown[]).length) {
    throw new Error('Не удалось поставить ворота на край контура.');
  }

  const bounds = semantics.bounds ?? raster.bounds;

  return {
    shape,
    warnings: [...semantics.warnings, ...heurWarnings],
    preview: {
      segments: semantics.segments,
      racks: semantics.racks,
      gates: semantics.gates,
      bounds,
    },
  };
}

/** Импорт из File (браузер). */
export async function importDxfFile(file: File): Promise<DxfImportResult> {
  const text = await file.text();
  try {
    return importDxfText(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось разобрать DXF.';
    throw new Error(message);
  }
}
