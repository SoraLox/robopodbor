import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useWizardStore } from '@/app/store';
import { CELL, buildDefaultShape, cellAt, cloneShape, setCellAt } from '@/upstream/simulation/shape/shapeTypes.js';
import { computeGateClusters } from '@/upstream/simulation/shape/shapeGeometry.js';
import {
  DEFAULT_LAYOUT,
  areaOf,
  decodeShape,
  encodeShape,
  isGate,
  layoutMetrics,
  type Shape,
} from '@/features/objects/layout/warehouseLayout';
import { cn } from '@/lib/utils';

/**
 * Шаг мастера «Планировка» (только склад): контур здания пиксель-артом по сетке,
 * ворота выгрузки (фура → склад) и загрузки (склад → фура), стеллажи. Логика —
 * конструктор формы Егора (upstream ShapeEditor.jsx), интерфейс — наш.
 */

const COLOR: Record<number, string> = {
  [CELL.EMPTY]: '#F5F5F7',
  [CELL.FLOOR]: '#D5DCE5',
  [CELL.GATE]: '#E5A13F',
  [CELL.GATE_OUT]: '#E5A13F',
  [CELL.GATE_IN]: '#5B8FD0',
  [CELL.RACK]: '#8A5A6B',
};

const TOOLS = [
  { id: 'floor', label: 'Пол', hint: 'Контур здания', cell: CELL.FLOOR },
  { id: 'in', label: 'Выгрузка', hint: 'Фура → склад', cell: CELL.GATE_IN },
  { id: 'out', label: 'Загрузка', hint: 'Склад → фура', cell: CELL.GATE_OUT },
  { id: 'rack', label: 'Стеллаж', hint: 'Место хранения', cell: CELL.RACK },
  { id: 'erase', label: 'Ластик', hint: 'Снять метку или пол', cell: null },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

const PX = 24;

/** Клетки ворот, которые не касаются края контура: воротами они не станут. */
function strayGateCells(shape: Shape): Set<string> {
  const clustered = new Set<string>();
  for (const cluster of computeGateClusters(shape) as Array<{ cells: Array<{ gx: number; gz: number }> }>) {
    for (const cell of cluster.cells) clustered.add(`${cell.gx},${cell.gz}`);
  }
  const stray = new Set<string>();
  for (let gz = 0; gz < shape.gridSize; gz += 1) {
    for (let gx = 0; gx < shape.gridSize; gx += 1) {
      if (isGate(cellAt(shape, gx, gz)) && !clustered.has(`${gx},${gz}`)) stray.add(`${gx},${gz}`);
    }
  }
  return stray;
}

function draw(ctx: CanvasRenderingContext2D, shape: Shape) {
  const size = shape.gridSize * PX;
  ctx.clearRect(0, 0, size, size);
  const stray = strayGateCells(shape);
  for (let gz = 0; gz < shape.gridSize; gz += 1) {
    for (let gx = 0; gx < shape.gridSize; gx += 1) {
      const bad = stray.has(`${gx},${gz}`);
      const value = cellAt(shape, gx, gz);
      ctx.fillStyle = bad ? '#F4D4D4' : COLOR[value] ?? COLOR[CELL.EMPTY]!;
      ctx.fillRect(gx * PX, gz * PX, PX, PX);
      if (value === CELL.GATE && !bad) {
        // Двусторонние ворота стандартной формы: и выгрузка, и загрузка.
        ctx.fillStyle = COLOR[CELL.GATE_IN]!;
        ctx.beginPath();
        ctx.moveTo(gx * PX, gz * PX);
        ctx.lineTo(gx * PX + PX, gz * PX);
        ctx.lineTo(gx * PX, gz * PX + PX);
        ctx.fill();
      }
      if (bad) {
        ctx.strokeStyle = '#C0392B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx * PX + 6, gz * PX + 6);
        ctx.lineTo(gx * PX + PX - 6, gz * PX + PX - 6);
        ctx.moveTo(gx * PX + PX - 6, gz * PX + 6);
        ctx.lineTo(gx * PX + 6, gz * PX + PX - 6);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= shape.gridSize; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * PX, 0);
    ctx.lineTo(i * PX, size);
    ctx.moveTo(0, i * PX);
    ctx.lineTo(size, i * PX);
    ctx.stroke();
  }
}

function initialShape(layout: string | null): Shape {
  return (decodeShape(layout) ?? (buildDefaultShape() as Shape));
}

const nf = new Intl.NumberFormat('ru-RU');

export function LayoutStep({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const layout = useWizardStore((s) => s.layout);
  const setLayout = useWizardStore((s) => s.setLayout);
  const parameters = useWizardStore((s) => s.parameters);
  const areaM2 = areaOf(parameters);

  const [draft, setDraft] = useState<Shape>(() => initialShape(layout));
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<ToolId>('floor');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);

  // Вернулись на шаг после правки в другом месте (загрузили проект) — берём сохранённое.
  useEffect(() => {
    if (active) setDraft(initialShape(layout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx, draft);
  }, [draft, version]);

  const metrics = useMemo(() => layoutMetrics(draft, areaM2), [draft, version, areaM2]); // eslint-disable-line react-hooks/exhaustive-deps
  const stray = useMemo(() => strayGateCells(draft).size, [draft, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const isDefault = useMemo(() => encodeShape(draft) === DEFAULT_LAYOUT, [draft, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const canContinue = metrics.footprintCells > 0 && metrics.gates > 0;

  const lastCell = useRef<{ gx: number; gz: number } | null>(null);

  const cellOf = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      gx: Math.floor(((clientX - rect.left) / rect.width) * draft.gridSize),
      gz: Math.floor(((clientY - rect.top) / rect.height) * draft.gridSize),
    };
  };

  // Ластик решает по первой клетке штриха: начали с метки (ворота, стеллаж) —
  // снимаем только метки до пола; начали с пола или снаружи — стираем контур.
  const eraseMode = useRef<'marks' | 'floor'>('floor');

  const paintCell = (gx: number, gz: number) => {
    if (gx < 0 || gz < 0 || gx >= draft.gridSize || gz >= draft.gridSize) return false;
    const current = cellAt(draft, gx, gz);
    const brush = TOOLS.find((t) => t.id === tool)!.cell;
    let next = brush;
    if (next === null) {
      if (eraseMode.current === 'marks') next = current === CELL.FLOOR || current === CELL.EMPTY ? current : CELL.FLOOR;
      else next = CELL.EMPTY;
    }
    if (current === next) return false;
    setCellAt(draft, gx, gz, next);
    return true;
  };

  // Мышь за кадр проходит несколько клеток — закрашиваем весь отрезок, а не только
  // точки событий, иначе быстрый штрих получается пунктиром.
  const paintTo = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const to = cellOf(clientX, clientY);
    if (!lastCell.current) {
      const first = cellAt(draft, to.gx, to.gz);
      eraseMode.current = first === CELL.FLOOR || first === CELL.EMPTY ? 'floor' : 'marks';
    }
    const from = lastCell.current ?? to;
    const steps = Math.max(Math.abs(to.gx - from.gx), Math.abs(to.gz - from.gz));
    let changed = false;
    for (let i = 0; i <= steps; i += 1) {
      const t = steps ? i / steps : 0;
      changed = paintCell(Math.round(from.gx + (to.gx - from.gx) * t), Math.round(from.gz + (to.gz - from.gz) * t)) || changed;
    }
    lastCell.current = to;
    if (changed) setVersion((v) => v + 1);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    painting.current = true;
    lastCell.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintTo(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (painting.current) paintTo(event.clientX, event.clientY);
  };
  const onPointerUp = () => {
    painting.current = false;
    lastCell.current = null;
  };

  const reset = () => {
    setDraft(buildDefaultShape() as Shape);
    setVersion((v) => v + 1);
  };

  const goNext = () => {
    if (!canContinue) return;
    setLayout(isDefault ? null : encodeShape(cloneShape(draft) as Shape));
    navigate(`/calculate/${objectType}/processes`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-h-0 flex-1 items-start justify-center">
          <canvas
            ref={canvasRef}
            width={draft.gridSize * PX}
            height={draft.gridSize * PX}
            aria-label="План склада: сетка для рисования контура, ворот и стеллажей"
            className="aspect-square h-full max-h-full max-w-full cursor-crosshair touch-none rounded-[12px] border border-[#E5E5EA]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>

        <div className="flex w-[300px] flex-none flex-col gap-4 overflow-y-auto">
          <p className="text-[12.5px] leading-snug text-[#6E6E73]">
            Нарисуйте контур склада и расставьте ворота и стеллажи. Контур — это вся площадь из паспорта (
            {nf.format(areaM2)} м²). В ворота выгрузки фуры привозят товар, роботы везут его к ближайшему стеллажу; из
            ворот загрузки товар увозят.
          </p>

          <div role="radiogroup" aria-label="Инструмент" className="grid gap-1.5">
            {TOOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={tool === item.id}
                onClick={() => setTool(item.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left transition-colors duration-100',
                  tool === item.id ? 'border-foreground' : 'border-[#E5E5EA] hover:border-[#C7C7CC]',
                )}
              >
                <span
                  aria-hidden
                  className="size-4 flex-none rounded-[4px] border border-black/10"
                  style={{ background: item.cell === null ? '#FFFFFF' : COLOR[item.cell] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-tight text-foreground">{item.label}</span>
                  <span className="block text-[11.5px] leading-snug text-[#8E8E93]">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-[#8E8E93]">Клетка</dt>
            <dd className="text-right tabular-nums text-foreground">
              {metrics.cellMeters.toFixed(1).replace('.', ',')} × {metrics.cellMeters.toFixed(1).replace('.', ',')} м
            </dd>
            <dt className="text-[#8E8E93]">Ворота</dt>
            <dd className="text-right tabular-nums text-foreground">
              {metrics.gates}
              {metrics.gatesIn || metrics.gatesOut
                ? ` (выгрузка ${metrics.gatesIn}, загрузка ${metrics.gatesOut})`
                : ' двусторонних'}
            </dd>
            <dt className="text-[#8E8E93]">Стеллажи</dt>
            <dd className="text-right tabular-nums text-foreground">
              {metrics.rackCells ? `${nf.format(Math.round(metrics.rackCells * metrics.cellMeters ** 2))} м²` : 'по типу хранения'}
            </dd>
            <dt className="text-[#8E8E93]">Путь до хранения</dt>
            <dd className="text-right tabular-nums text-foreground">~{metrics.routeLengthM} м</dd>
          </dl>

          {!canContinue ? (
            <p role="alert" className="flex gap-1.5 text-[12px] leading-snug text-status-danger">
              <AlertTriangle className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
              Нужен контур и хотя бы одни ворота на его краю.
            </p>
          ) : null}
          {stray ? (
            <p role="alert" className="flex gap-1.5 text-[12px] leading-snug text-status-danger">
              <AlertTriangle className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
              {stray === 1 ? 'Клетка ворот отмечена' : `${stray} клеток ворот отмечены`} крестом: они не на краю контура и
              воротами не станут.
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            disabled={isDefault}
            className="flex items-center gap-1.5 self-start text-[12.5px] font-medium text-[#6E6E73] hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" strokeWidth={2} aria-hidden />
            Стандартный прямоугольник
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={!canContinue}
        onClick={goNext}
        className="mt-3 flex h-11 w-full flex-none items-center justify-center rounded-[10px] bg-primary-bright text-[14px] font-semibold text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 disabled:bg-[#E5E5EA] disabled:text-[#8E8E93] disabled:opacity-100"
      >
        Далее
      </button>
    </div>
  );
}

export default LayoutStep;
