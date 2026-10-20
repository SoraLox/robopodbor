/**
 * Лёгкий ASCII DXF reader: только то, что нужно для контура склада
 * (LINE / LWPOLYLINE / ARC / INSERT / TEXT + BLOCKS + $INSUNITS).
 */

export type DxfPoint = { x: number; y: number };

export type DxfLine = { layer: string; start: DxfPoint; end: DxfPoint };

export type DxfPolyline = { layer: string; closed: boolean; points: DxfPoint[] };

export type DxfArc = {
  layer: string;
  center: DxfPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
};

export type DxfInsert = {
  layer: string;
  name: string;
  position: DxfPoint;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
};

export type DxfText = { layer: string; value: string; position: DxfPoint };

export type DxfBlock = {
  name: string;
  base: DxfPoint;
  lines: DxfLine[];
  polylines: DxfPolyline[];
};

export type DxfDocument = {
  insunits: number;
  layers: string[];
  lines: DxfLine[];
  polylines: DxfPolyline[];
  arcs: DxfArc[];
  inserts: DxfInsert[];
  texts: DxfText[];
  blocks: Map<string, DxfBlock>;
};

function pairs(text: string): Array<[number, string]> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const out: Array<[number, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (!Number.isFinite(code)) continue;
    out.push([code, lines[i + 1] ?? '']);
  }
  return out;
}

function sectionPairs(all: Array<[number, string]>, name: string): Array<[number, string]> {
  let i = 0;
  while (i < all.length) {
    if (all[i]![0] === 0 && all[i]![1].trim() === 'SECTION' && all[i + 1]?.[0] === 2 && all[i + 1]![1].trim() === name) {
      i += 2;
      const start = i;
      while (i < all.length && !(all[i]![0] === 0 && all[i]![1].trim() === 'ENDSEC')) i += 1;
      return all.slice(start, i);
    }
    i += 1;
  }
  return [];
}

function splitEntities(section: Array<[number, string]>): Array<Array<[number, string]>> {
  const entities: Array<Array<[number, string]>> = [];
  let current: Array<[number, string]> | null = null;
  for (const pair of section) {
    if (pair[0] === 0) {
      if (current) entities.push(current);
      current = [pair];
    } else if (current) {
      current.push(pair);
    }
  }
  if (current) entities.push(current);
  return entities;
}

function group(entity: Array<[number, string]>): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const [code, value] of entity) {
    const list = map.get(code);
    if (list) list.push(value);
    else map.set(code, [value]);
  }
  return map;
}

function num(map: Map<number, string[]>, code: number, fallback = 0): number {
  const raw = map.get(code)?.[0];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function str(map: Map<number, string[]>, code: number, fallback = ''): string {
  return (map.get(code)?.[0] ?? fallback).trim();
}

function parseLine(map: Map<number, string[]>): DxfLine {
  return {
    layer: str(map, 8, '0'),
    start: { x: num(map, 10), y: num(map, 20) },
    end: { x: num(map, 11), y: num(map, 21) },
  };
}

function parsePolyline(map: Map<number, string[]>): DxfPolyline {
  const xs = map.get(10) ?? [];
  const ys = map.get(20) ?? [];
  const points: DxfPoint[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i += 1) {
    points.push({ x: Number(xs[i]), y: Number(ys[i]) });
  }
  const flags = num(map, 70, 0);
  return { layer: str(map, 8, '0'), closed: (flags & 1) === 1, points };
}

function parseArc(map: Map<number, string[]>): DxfArc {
  return {
    layer: str(map, 8, '0'),
    center: { x: num(map, 10), y: num(map, 20) },
    radius: num(map, 40),
    startAngle: num(map, 50),
    endAngle: num(map, 51),
  };
}

function parseInsert(map: Map<number, string[]>): DxfInsert {
  return {
    layer: str(map, 8, '0'),
    name: str(map, 2),
    position: { x: num(map, 10), y: num(map, 20) },
    rotationDeg: num(map, 50, 0),
    scaleX: num(map, 41, 1),
    scaleY: num(map, 42, 1),
  };
}

function parseText(map: Map<number, string[]>, type: string): DxfText | null {
  const value = type === 'MTEXT' ? str(map, 1).replace(/\\P/g, ' ').replace(/\{[^;]*;/g, '').replace(/\}/g, '') : str(map, 1);
  if (!value) return null;
  return { layer: str(map, 8, '0'), value, position: { x: num(map, 10), y: num(map, 20) } };
}

function collectGeometry(
  entities: Array<Array<[number, string]>>,
  into: {
    lines: DxfLine[];
    polylines: DxfPolyline[];
    arcs: DxfArc[];
    inserts: DxfInsert[];
    texts: DxfText[];
  },
) {
  for (const entity of entities) {
    const type = entity[0]?.[1]?.trim();
    if (!type) continue;
    const map = group(entity.slice(1));
    if (type === 'LINE') into.lines.push(parseLine(map));
    else if (type === 'LWPOLYLINE' || type === 'POLYLINE') into.polylines.push(parsePolyline(map));
    else if (type === 'ARC') into.arcs.push(parseArc(map));
    else if (type === 'INSERT') into.inserts.push(parseInsert(map));
    else if (type === 'TEXT' || type === 'MTEXT' || type === 'ATTRIB') {
      const text = parseText(map, type);
      if (text) into.texts.push(text);
    }
  }
}

function parseBlocks(section: Array<[number, string]>): Map<string, DxfBlock> {
  const blocks = new Map<string, DxfBlock>();
  const entities = splitEntities(section);
  let current: DxfBlock | null = null;
  for (const entity of entities) {
    const type = entity[0]?.[1]?.trim();
    if (!type) continue;
    const map = group(entity.slice(1));
    if (type === 'BLOCK') {
      current = {
        name: str(map, 2),
        base: { x: num(map, 10), y: num(map, 20) },
        lines: [],
        polylines: [],
      };
    } else if (type === 'ENDBLK') {
      if (current?.name) blocks.set(current.name, current);
      current = null;
    } else if (current) {
      if (type === 'LINE') current.lines.push(parseLine(map));
      else if (type === 'LWPOLYLINE' || type === 'POLYLINE') current.polylines.push(parsePolyline(map));
    }
  }
  return blocks;
}

function parseHeaderInsunits(header: Array<[number, string]>): number {
  for (let i = 0; i < header.length; i += 1) {
    if (header[i]![0] === 9 && header[i]![1].trim() === '$INSUNITS') {
      const next = header[i + 1];
      if (next?.[0] === 70) return Number(next[1]) || 0;
    }
  }
  return 0;
}

function parseLayers(tables: Array<[number, string]>): string[] {
  const layers: string[] = [];
  const entities = splitEntities(tables);
  for (const entity of entities) {
    if (entity[0]?.[1]?.trim() !== 'LAYER') continue;
    const map = group(entity.slice(1));
    const name = str(map, 2);
    if (name) layers.push(name);
  }
  return layers;
}

/** Разбор ASCII DXF. Бинарный DXF не поддерживается. */
export function parseDxf(text: string): DxfDocument {
  if (text.startsWith('AutoCAD Binary DXF') || text.includes('\0')) {
    throw new Error('Бинарный DXF не поддерживается — сохраните как ASCII DXF.');
  }
  const all = pairs(text);
  const header = sectionPairs(all, 'HEADER');
  const tables = sectionPairs(all, 'TABLES');
  const blocksSection = sectionPairs(all, 'BLOCKS');
  const entitiesSection = sectionPairs(all, 'ENTITIES');

  const doc: DxfDocument = {
    insunits: parseHeaderInsunits(header),
    layers: parseLayers(tables),
    lines: [],
    polylines: [],
    arcs: [],
    inserts: [],
    texts: [],
    blocks: parseBlocks(blocksSection),
  };
  collectGeometry(splitEntities(entitiesSection), doc);
  return doc;
}
