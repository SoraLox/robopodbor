/**
 * Модалка импорта AutoCAD DXF: drop-зона → превью чертежа | сетка 25×25 → подтверждение.
 */

import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileBox, Upload, X } from 'lucide-react';
import { CELL } from '@/upstream/simulation/shape/shapeTypes.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Shape } from '@/features/objects/layout/warehouseLayout';
import { importDxfFile, importDxfText, type DxfImportResult } from './importDxfToShape';
import { DXF_SAMPLES, type DxfSample } from './samples';

const GRID_COLOR: Record<number, string> = {
  [CELL.EMPTY]: '#F5F5F7',
  [CELL.FLOOR]: '#D5DCE5',
  [CELL.GATE]: '#E5A13F',
  [CELL.GATE_OUT]: '#E5A13F',
  [CELL.GATE_IN]: '#5B8FD0',
  [CELL.RACK]: '#8A5A6B',
};

const PREVIEW_PX = 280;

function drawShapePreview(canvas: HTMLCanvasElement, shape: Shape) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const n = shape.gridSize;
  const px = PREVIEW_PX / n;
  ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
  for (let gz = 0; gz < n; gz += 1) {
    for (let gx = 0; gx < n; gx += 1) {
      ctx.fillStyle = GRID_COLOR[shape.cells[gz * n + gx]!] ?? GRID_COLOR[CELL.EMPTY]!;
      ctx.fillRect(gx * px, gz * px, Math.ceil(px), Math.ceil(px));
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= n; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * px, 0);
    ctx.lineTo(i * px, PREVIEW_PX);
    ctx.moveTo(0, i * px);
    ctx.lineTo(PREVIEW_PX, i * px);
    ctx.stroke();
  }
}

function drawDxfPreview(canvas: HTMLCanvasElement, preview: DxfImportResult['preview']) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { bounds, segments, racks, gates } = preview;
  const pad = 12;
  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const scale = Math.min((PREVIEW_PX - pad * 2) / width, (PREVIEW_PX - pad * 2) / height);
  const ox = pad + (PREVIEW_PX - pad * 2 - width * scale) / 2;
  const oy = pad + (PREVIEW_PX - pad * 2 - height * scale) / 2;

  const map = (x: number, y: number) => ({
    x: ox + (x - bounds.minX) * scale,
    y: oy + (bounds.maxY - y) * scale,
  });

  ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);

  ctx.fillStyle = 'rgba(138, 90, 107, 0.35)';
  for (const rack of racks) {
    const a = map(rack.minX, rack.maxY);
    const b = map(rack.maxX, rack.minY);
    ctx.fillRect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
  }

  ctx.strokeStyle = '#1C1C1E';
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  for (const seg of segments) {
    const a = map(seg.a.x, seg.a.y);
    const b = map(seg.b.x, seg.b.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const gate of gates) {
    const p = map(gate.position.x, gate.position.y);
    ctx.fillStyle = gate.kind === 'out' ? '#E5A13F' : '#5B8FD0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function DxfImportDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (shape: Shape, warnings: string[]) => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dxfCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [result, setResult] = useState<DxfImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) {
      setDragging(false);
      setBusy(false);
      setError(null);
      setFileName(null);
      setSelectedSampleId(null);
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!result) return;
    if (dxfCanvasRef.current) drawDxfPreview(dxfCanvasRef.current, result.preview);
    if (gridCanvasRef.current) drawShapePreview(gridCanvasRef.current, result.shape);
  }, [result]);

  const applyParsed = (next: DxfImportResult, name: string, sampleId: string | null) => {
    setResult(next);
    setFileName(name);
    setSelectedSampleId(sampleId);
    setError(null);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setError('Нужен файл AutoCAD в формате .dxf');
      setResult(null);
      setFileName(null);
      setSelectedSampleId(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFileName(file.name);
    setSelectedSampleId(null);
    try {
      applyParsed(await importDxfFile(file), file.name, null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Не удалось разобрать DXF.');
    } finally {
      setBusy(false);
    }
  };

  const loadSample = (sample: DxfSample) => {
    setBusy(true);
    setError(null);
    setFileName(sample.fileName);
    setSelectedSampleId(sample.id);
    try {
      applyParsed(importDxfText(sample.source), sample.fileName, sample.id);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Не удалось разобрать DXF.');
    } finally {
      setBusy(false);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    void loadFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files?.[0]);
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
    setFileName(null);
    setSelectedSampleId(null);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-foreground/40"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92vh,720px)] w-full max-w-[800px] flex-col overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
      >
        <div className="flex flex-none items-start justify-between gap-3 border-b border-[#E5E5EA] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              Загрузить AutoCAD
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#6E6E73]">
              Выберите пример или перетащите свой .dxf — затем превью и подтверждение.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex size-8 flex-none items-center justify-center rounded-full bg-[#F2F2F2] text-foreground transition-colors hover:bg-[#E5E5EA] disabled:opacity-40"
            aria-label="Закрыть"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept=".dxf,image/vnd.dxf,application/dxf,text/plain"
            className="sr-only"
            aria-label="Файл чертежа AutoCAD DXF"
            tabIndex={-1}
            onChange={onInput}
          />

          {!result ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-[12px] font-medium text-[#6E6E73]">Примеры</p>
                <div className="flex flex-col gap-1.5" role="list">
                  {DXF_SAMPLES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      role="listitem"
                      disabled={busy}
                      onClick={() => loadSample(sample)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-[12px] border px-2.5 py-2 text-left transition-colors',
                        selectedSampleId === sample.id
                          ? 'border-primary-bright bg-primary-bright/[0.06]'
                          : 'border-[#E5E5EA] bg-white hover:border-[#C7C7CC] hover:bg-[#FAFAFA]',
                        busy && 'opacity-60',
                      )}
                    >
                      <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-[8px] bg-[#F2F2F2] text-foreground">
                        <FileBox className="size-3.5" strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-tight text-foreground">{sample.title}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-[#8E8E93]">{sample.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  setDragging(false);
                }}
                onDrop={onDrop}
                className={cn(
                  'flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-6 py-10 text-center transition-colors',
                  dragging
                    ? 'border-primary-bright bg-primary-bright/[0.08]'
                    : 'border-[#C7C7CC] bg-[#FAFAFA] hover:border-primary-bright/60 hover:bg-primary-bright/[0.04]',
                  busy && 'pointer-events-none opacity-60',
                )}
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-bright/[0.12] text-primary-bright">
                  <Upload className="size-5" strokeWidth={2} aria-hidden />
                </span>
                <span className="text-[14px] font-semibold text-foreground">
                  {busy ? 'Разбираем чертёж…' : 'Перетащите файл .dxf сюда'}
                </span>
                <span className="text-[12.5px] text-[#6E6E73]">или нажмите, чтобы выбрать на диске</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="truncate text-[12.5px] font-medium text-foreground" title={fileName ?? undefined}>
                  {selectedSampleId
                    ? (DXF_SAMPLES.find((s) => s.id === selectedSampleId)?.title ?? fileName)
                    : fileName}
                </p>
                <button
                  type="button"
                  onClick={clearResult}
                  className="text-[12.5px] font-medium text-primary-bright hover:opacity-80"
                >
                  Выбрать другой файл
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <figure className="min-w-0">
                  <figcaption className="mb-1.5 text-[12px] font-medium text-[#6E6E73]">Чертёж AutoCAD</figcaption>
                  <canvas
                    ref={dxfCanvasRef}
                    width={PREVIEW_PX}
                    height={PREVIEW_PX}
                    className="w-full max-w-full rounded-[12px] border border-[#E5E5EA] bg-[#FAFAFA]"
                    aria-label="Превью геометрии DXF"
                  />
                </figure>
                <figure className="min-w-0">
                  <figcaption className="mb-1.5 text-[12px] font-medium text-[#6E6E73]">Сетка планировки 25×25</figcaption>
                  <canvas
                    ref={gridCanvasRef}
                    width={PREVIEW_PX}
                    height={PREVIEW_PX}
                    className="w-full max-w-full rounded-[12px] border border-[#E5E5EA]"
                    aria-label="Превью сетки склада"
                  />
                </figure>
              </div>

              {result.warnings.length ? (
                <p className="text-[12px] leading-snug text-[#8E8E93]">{result.warnings.join(' ')}</p>
              ) : null}
            </div>
          )}

          {error ? (
            <p role="alert" className="mt-3 flex gap-1.5 text-[12.5px] leading-snug text-status-danger">
              <AlertTriangle className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-none items-center justify-end gap-2 border-t border-[#E5E5EA] px-5 py-4">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose} className="rounded-[10px]">
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!result || busy}
            onClick={() => {
              if (!result) return;
              onConfirm(result.shape, result.warnings);
            }}
            className="rounded-[10px] bg-primary-bright text-white hover:bg-primary-bright hover:opacity-90"
          >
            Подтвердить
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
