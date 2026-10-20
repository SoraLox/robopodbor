/**
 * Из DXF-документа — геометрия склада в метрах: стены, кандидаты ворот, стеллажи.
 */

import type { DxfArc, DxfDocument, DxfInsert, DxfLine, DxfPoint, DxfPolyline } from './parseDxf';

export type Segment = { a: DxfPoint; b: DxfPoint };

export type RackFootprint = { minX: number; minY: number; maxX: number; maxY: number };

export type GateCandidate = {
  position: DxfPoint;
  /** Ширина проёма в метрах (оценка). */
  widthM: number;
  kind: 'in' | 'out' | 'generic';
};

export type WarehouseSemantics = {
  segments: Segment[];
  areaPolygon: DxfPoint[] | null;
  racks: RackFootprint[];
  gates: GateCandidate[];
  warnings: string[];
  /** Габариты полезной геометрии, м. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
};

/** AutoCAD $INSUNITS → множитель в метры. */
export function metersPerUnit(insunits: number): number {
  switch (insunits) {
    case 1:
      return 0.0254; // inches
    case 2:
      return 0.3048; // feet
    case 4:
      return 0.001; // mm
    case 5:
      return 0.01; // cm
    case 6:
      return 1; // m
    default:
      return 1;
  }
}

function scalePoint(p: DxfPoint, s: number): DxfPoint {
  return { x: p.x * s, y: p.y * s };
}

function scaleLine(line: DxfLine, s: number): Segment {
  return { a: scalePoint(line.start, s), b: scalePoint(line.end, s) };
}

function rotate(p: DxfPoint, deg: number): DxfPoint {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  return { x: p.x * c - p.y * sn, y: p.x * sn + p.y * c };
}

function blockBBox(doc: DxfDocument, name: string): RackFootprint | null {
  const block = doc.blocks.get(name);
  if (!block) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: DxfPoint) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const line of block.lines) {
    consider(line.start);
    consider(line.end);
  }
  for (const poly of block.polylines) for (const p of poly.points) consider(p);
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function insertFootprint(doc: DxfDocument, insert: DxfInsert, s: number): RackFootprint {
  const local = blockBBox(doc, insert.name) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const corners: DxfPoint[] = [
    { x: local.minX * insert.scaleX, y: local.minY * insert.scaleY },
    { x: local.maxX * insert.scaleX, y: local.minY * insert.scaleY },
    { x: local.maxX * insert.scaleX, y: local.maxY * insert.scaleY },
    { x: local.minX * insert.scaleX, y: local.maxY * insert.scaleY },
  ].map((p) => {
    const r = rotate(p, insert.rotationDeg);
    return { x: (r.x + insert.position.x) * s, y: (r.y + insert.position.y) * s };
  });
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

function isWallLayer(name: string): boolean {
  const n = name.toUpperCase();
  return n === 'A-WALL' || n === 'BODY' || n === 'WALLS' || n === 'WALL' || n.includes('WALL');
}

function isAreaLayer(name: string): boolean {
  const n = name.toUpperCase();
  return n === 'A-AREA' || n === 'AREA' || n.includes('AREA');
}

function isRackInsert(name: string): boolean {
  const n = name.toUpperCase();
  return n.includes('RACK') || n.includes('SHELF') || n.includes('СТЕЛЛ');
}

function isDockInsert(name: string): boolean {
  const n = name.toUpperCase();
  return n.includes('ROLLUP') || n.includes('DOCK') || n.includes('LEVELER') || n.includes('OVERHEAD');
}

function isDoorInsert(name: string): boolean {
  const n = name.toUpperCase();
  return n.startsWith('DOOR') || n.includes('DOOR') || n.includes('GATE') || n.includes('ВОРОТ');
}

function layerLength(lines: DxfLine[], layer: string): number {
  let sum = 0;
  for (const line of lines) {
    if (line.layer !== layer) continue;
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    sum += Math.hypot(dx, dy);
  }
  return sum;
}

function pickWallLayers(doc: DxfDocument): Set<string> {
  const named = new Set(doc.layers.filter(isWallLayer));
  for (const line of doc.lines) if (isWallLayer(line.layer)) named.add(line.layer);
  for (const poly of doc.polylines) if (isWallLayer(poly.layer)) named.add(poly.layer);
  for (const arc of doc.arcs) if (isWallLayer(arc.layer)) named.add(arc.layer);
  if (named.size) return named;

  // Fallback: слой с наибольшей суммарной длиной линий (сырые чертежи без AIA).
  const byLayer = new Map<string, number>();
  for (const line of doc.lines) {
    byLayer.set(line.layer, (byLayer.get(line.layer) ?? 0) + layerLength([line], line.layer));
  }
  let best = '0';
  let bestLen = -1;
  for (const [layer, len] of byLayer) {
    if (len > bestLen) {
      best = layer;
      bestLen = len;
    }
  }
  return new Set([best]);
}

function arcToSegments(arc: DxfArc, s: number, steps = 12): Segment[] {
  const start = arc.startAngle;
  let end = arc.endAngle;
  while (end < start) end += 360;
  const segments: Segment[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a0 = start + ((end - start) * i) / steps;
    const a1 = start + ((end - start) * (i + 1)) / steps;
    const r0 = (a0 * Math.PI) / 180;
    const r1 = (a1 * Math.PI) / 180;
    segments.push({
      a: scalePoint({ x: arc.center.x + arc.radius * Math.cos(r0), y: arc.center.y + arc.radius * Math.sin(r0) }, s),
      b: scalePoint({ x: arc.center.x + arc.radius * Math.cos(r1), y: arc.center.y + arc.radius * Math.sin(r1) }, s),
    });
  }
  return segments;
}

function polylineSegments(poly: DxfPolyline, s: number): Segment[] {
  const pts = poly.points.map((p) => scalePoint(p, s));
  const segments: Segment[] = [];
  for (let i = 0; i + 1 < pts.length; i += 1) segments.push({ a: pts[i]!, b: pts[i + 1]! });
  if (poly.closed && pts.length > 2) segments.push({ a: pts[pts.length - 1]!, b: pts[0]! });
  return segments;
}

function expandBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  p: DxfPoint,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!bounds) return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  return {
    minX: Math.min(bounds.minX, p.x),
    minY: Math.min(bounds.minY, p.y),
    maxX: Math.max(bounds.maxX, p.x),
    maxY: Math.max(bounds.maxY, p.y),
  };
}

function expandBoundsRect(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  r: RackFootprint,
) {
  return expandBounds(expandBounds(bounds, { x: r.minX, y: r.minY }), { x: r.maxX, y: r.maxY });
}

type AxisBand = { axis: number; a0: number; a1: number };

/**
 * На «голых» чертежах стеллажи часто нарисованы двумя длинными параллельными
 * линиями (глубина ряда ~1–4 м). Собираем такие пары в прямоугольники RACK.
 */
export function detectImpliedRacks(
  segments: Segment[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
): RackFootprint[] {
  if (!bounds) return [];
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const minLen = Math.max(8, size * 0.06);
  const minDepth = 1.2;
  const maxDepth = 4.8;
  const margin = size * 0.012;
  const yTol = Math.max(0.15, size * 0.001);

  const horiz: AxisBand[] = [];
  const vert: AxisBand[] = [];

  for (const seg of segments) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;
    if (Math.abs(dy) <= Math.abs(dx) * 0.08) {
      const y = (seg.a.y + seg.b.y) / 2;
      const x0 = Math.min(seg.a.x, seg.b.x);
      const x1 = Math.max(seg.a.x, seg.b.x);
      if (y <= bounds.minY + margin || y >= bounds.maxY - margin) continue;
      if (x0 <= bounds.minX + margin && x1 >= bounds.maxX - margin) continue;
      horiz.push({ axis: y, a0: x0, a1: x1 });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.08) {
      const x = (seg.a.x + seg.b.x) / 2;
      const y0 = Math.min(seg.a.y, seg.b.y);
      const y1 = Math.max(seg.a.y, seg.b.y);
      if (x <= bounds.minX + margin || x >= bounds.maxX - margin) continue;
      if (y0 <= bounds.minY + margin && y1 >= bounds.maxY - margin) continue;
      vert.push({ axis: x, a0: y0, a1: y1 });
    }
  }

  const mergeBands = (bands: AxisBand[]): AxisBand[] => {
    if (!bands.length) return [];
    const sorted = [...bands].sort((a, b) => a.axis - b.axis || a.a0 - b.a0);
    const out: AxisBand[] = [];
    for (const band of sorted) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.axis - band.axis) <= yTol) {
        last.a0 = Math.min(last.a0, band.a0);
        last.a1 = Math.max(last.a1, band.a1);
      } else {
        out.push({ ...band });
      }
    }
    return out;
  };

  const pairBands = (bands: AxisBand[], horizontal: boolean): RackFootprint[] => {
    const merged = mergeBands(bands);
    const used = new Set<number>();
    const racks: RackFootprint[] = [];
    for (let i = 0; i < merged.length; i += 1) {
      if (used.has(i)) continue;
      const a = merged[i]!;
      let bestJ = -1;
      let bestDepth = Infinity;
      for (let j = i + 1; j < merged.length; j += 1) {
        if (used.has(j)) continue;
        const b = merged[j]!;
        const depth = b.axis - a.axis;
        if (depth < minDepth) continue;
        if (depth > maxDepth) break;
        const overlap0 = Math.max(a.a0, b.a0);
        const overlap1 = Math.min(a.a1, b.a1);
        if (overlap1 - overlap0 < minLen * 0.45) continue;
        if (depth < bestDepth) {
          bestDepth = depth;
          bestJ = j;
        }
      }
      if (bestJ < 0) continue;
      const b = merged[bestJ]!;
      used.add(i);
      used.add(bestJ);
      const overlap0 = Math.max(a.a0, b.a0);
      const overlap1 = Math.min(a.a1, b.a1);
      if (horizontal) {
        racks.push({ minX: overlap0, minY: a.axis, maxX: overlap1, maxY: b.axis });
      } else {
        racks.push({ minX: a.axis, minY: overlap0, maxX: b.axis, maxY: overlap1 });
      }
    }
    return racks;
  };

  return [...pairBands(horiz, true), ...pairBands(vert, false)];
}

export function extractSemantics(doc: DxfDocument): WarehouseSemantics {
  const s = metersPerUnit(doc.insunits);
  const warnings: string[] = [];
  const wallLayers = pickWallLayers(doc);

  // Если единицы не заданы, а геометрия выглядит как мм/дюймы — эвристика по размеру.
  let scale = s;
  if (doc.insunits === 0) {
    let maxAbs = 0;
    for (const line of doc.lines) {
      maxAbs = Math.max(maxAbs, Math.abs(line.start.x), Math.abs(line.start.y), Math.abs(line.end.x), Math.abs(line.end.y));
    }
    if (maxAbs > 5000) {
      scale = 0.001;
      warnings.push('Единицы чертежа не заданы — приняты миллиметры.');
    } else if (maxAbs > 200) {
      scale = 0.0254;
      warnings.push('Единицы чертежа не заданы — приняты дюймы.');
    }
  }

  const segments: Segment[] = [];
  for (const line of doc.lines) {
    if (!wallLayers.has(line.layer)) continue;
    segments.push(scaleLine(line, scale));
  }
  for (const poly of doc.polylines) {
    if (!wallLayers.has(poly.layer)) continue;
    segments.push(...polylineSegments(poly, scale));
  }
  for (const arc of doc.arcs) {
    if (!wallLayers.has(arc.layer)) continue;
    segments.push(...arcToSegments(arc, scale));
  }

  let areaPolygon: DxfPoint[] | null = null;
  for (const poly of doc.polylines) {
    if (!isAreaLayer(poly.layer) || poly.points.length < 3) continue;
    areaPolygon = poly.points.map((p) => scalePoint(p, scale));
    break;
  }

  const racks: RackFootprint[] = [];
  const gates: GateCandidate[] = [];
  let hasOfficeCue = false;

  for (const insert of doc.inserts) {
    const name = insert.name.toUpperCase();
    if (name.includes('DESK') || name.includes('CHAIR') || name.includes('FILE-CABINET')) hasOfficeCue = true;

    if (isRackInsert(insert.name)) {
      racks.push(insertFootprint(doc, insert, scale));
      continue;
    }

    if (isDockInsert(insert.name)) {
      const fp = insertFootprint(doc, insert, scale);
      gates.push({
        position: { x: (fp.minX + fp.maxX) / 2, y: (fp.minY + fp.maxY) / 2 },
        widthM: Math.max(fp.maxX - fp.minX, fp.maxY - fp.minY, 1.5),
        kind: 'in',
      });
      continue;
    }

    if (isDoorInsert(insert.name) || insert.layer.toUpperCase() === 'A-DOOR') {
      // Пешеходные двери не делаем воротами склада, кроме rollup уже выше.
      if (name.includes('SWING') || name.includes('WINDOW')) continue;
      const fp = insertFootprint(doc, insert, scale);
      gates.push({
        position: { x: (fp.minX + fp.maxX) / 2, y: (fp.minY + fp.maxY) / 2 },
        widthM: Math.max(fp.maxX - fp.minX, fp.maxY - fp.minY, 1.2),
        kind: 'generic',
      });
    }
  }

  if (hasOfficeCue && racks.length === 0) {
    warnings.push('Похоже на офисный чертёж — проверьте масштаб и контур.');
  }

  let bounds: WarehouseSemantics['bounds'] = null;
  for (const seg of segments) {
    bounds = expandBounds(bounds, seg.a);
    bounds = expandBounds(bounds, seg.b);
  }
  if (areaPolygon) for (const p of areaPolygon) bounds = expandBounds(bounds, p);
  for (const rack of racks) bounds = expandBoundsRect(bounds, rack);
  for (const gate of gates) bounds = expandBounds(bounds, gate.position);

  if (!racks.length) {
    const implied = detectImpliedRacks(segments, bounds);
    if (implied.length) {
      racks.push(...implied);
      for (const rack of implied) bounds = expandBoundsRect(bounds, rack);
      warnings.push('Стеллажи сняты с чертежа по параллельным рядам.');
    }
  }

  if (!segments.length && !areaPolygon) {
    warnings.push('Не удалось найти стены — импорт может быть неточным.');
  }

  return { segments, areaPolygon, racks, gates, warnings, bounds };
}
