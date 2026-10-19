import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { CELL } from '@/upstream/simulation/shape/shapeTypes.js';
import { WAREHOUSE_PRESETS, encodeShape, type Shape, type WarehousePreset } from '@/features/objects/layout/warehouseLayout';
import {
  WIZARD_COMPANION_SHADOW,
  WIZARD_PREVIEW_EASE,
  WIZARD_PREVIEW_MS,
  WIZARD_RAIL_ID,
  wizardCardHeightPx,
} from '@/features/objects/WizardCard';
import { useWizardCompanion, useWizardEnter } from '@/features/objects/wizardCompanion';
import { cn } from '@/lib/utils';

/**
 * Примеры складов для шага «Планировка»: типичные расстановки (кросс-док,
 * Г-образный, высотное хранение…) с миниатюрой и тем, что покажет на них
 * симуляция. На широком экране — панель слева от карточки, на узком — лента
 * над холстом.
 */

export const PRESETS_RAIL_WIDTH = 288;

const THUMB_COLOR: Record<number, string> = {
  [CELL.EMPTY]: '#FFFFFF',
  [CELL.FLOOR]: '#D5DCE5',
  [CELL.GATE]: '#E5A13F',
  [CELL.GATE_OUT]: '#E5A13F',
  [CELL.GATE_IN]: '#5B8FD0',
  [CELL.RACK]: '#8A5A6B',
};

function PresetThumb({ shape, size }: { shape: Shape; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const px = size / shape.gridSize;
    ctx.clearRect(0, 0, size, size);
    for (let gz = 0; gz < shape.gridSize; gz += 1) {
      for (let gx = 0; gx < shape.gridSize; gx += 1) {
        ctx.fillStyle = THUMB_COLOR[shape.cells[gz * shape.gridSize + gx]!] ?? '#FFFFFF';
        ctx.fillRect(gx * px, gz * px, Math.ceil(px), Math.ceil(px));
      }
    }
  }, [shape, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      aria-hidden
      className="flex-none rounded-[8px] border border-[#E5E5EA] bg-white"
      style={{ width: size, height: size }}
    />
  );
}

interface Built {
  preset: WarehousePreset;
  shape: Shape;
  code: string;
}

function PresetCard({ item, active, onPick, compact }: { item: Built; active: boolean; onPick: () => void; compact: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        'group relative flex min-w-0 gap-2.5 rounded-[12px] border p-2 text-left transition-colors duration-150',
        compact ? 'w-[220px] flex-none items-center' : 'w-full items-start',
        active ? 'border-primary-bright bg-primary-bright/[0.05]' : 'border-[#E5E5EA] hover:border-[#C7C7CC] hover:bg-[#FAFAFA]',
      )}
    >
      <PresetThumb shape={item.shape} size={compact ? 48 : 64} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[13px] font-semibold leading-tight text-foreground">
          <span className="truncate">{item.preset.title}</span>
          {active ? <Check className="size-3.5 flex-none text-primary-bright" strokeWidth={2.4} aria-hidden /> : null}
        </span>
        {compact ? null : (
          <>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-[#6E6E73]">{item.preset.description}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#8E8E93]">
              <span className="font-medium text-[#3A3A3C]">В симуляции: </span>
              {item.preset.shows}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

export function LayoutPresets({ open, draft, onPick }: { open: boolean; draft: Shape; onPick: (shape: Shape) => void }) {
  const built = useMemo<Built[]>(
    () =>
      WAREHOUSE_PRESETS.map((preset) => {
        const shape = preset.build();
        return { preset, shape, code: encodeShape(shape) };
      }),
    [],
  );
  const current = encodeShape(draft);
  const { setRailOpen, setRailWidth, railFits } = useWizardCompanion();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(wizardCardHeightPx);
  const entered = useWizardEnter(open && railFits, setRailOpen);

  useLayoutEffect(() => {
    setSlot(document.getElementById(WIZARD_RAIL_ID));
  }, [railFits]);
  useLayoutEffect(() => {
    if (open) setRailWidth(PRESETS_RAIL_WIDTH);
  }, [open, setRailWidth]);
  useLayoutEffect(() => {
    const sync = () => setHeight(wizardCardHeightPx());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const pick = (item: Built) => onPick({ ...item.shape, cells: item.shape.cells.slice() });

  // Узкий экран: лента примеров над холстом.
  if (!railFits) {
    if (!open) return null;
    return (
      <div className="-mx-1 flex flex-none gap-2 overflow-x-auto px-1 pb-1" aria-label="Примеры складов">
        {built.map((item) => (
          <PresetCard key={item.preset.id} item={item} active={item.code === current} onPick={() => pick(item)} compact />
        ))}
      </div>
    );
  }
  if (!slot) return null;
  return createPortal(
    <div aria-hidden={!open} inert={open ? undefined : true} className="absolute right-0 top-0">
      <aside
        aria-label="Примеры складов"
        className="relative flex flex-col overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white motion-reduce:!transition-none"
        style={{
          boxShadow: WIZARD_COMPANION_SHADOW,
          width: PRESETS_RAIL_WIDTH,
          height,
          opacity: entered ? 1 : 0,
          transform: entered ? 'translate3d(0,0,0)' : 'translate3d(24px,0,0)',
          transition: `transform ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}, opacity ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}`,
        }}
      >
        <div className="flex-none px-4 pb-2 pt-4">
          <h2 className="text-[15px] font-semibold leading-tight text-foreground">Примеры складов</h2>
          <p className="mt-1 text-[12px] leading-snug text-[#6E6E73]">
            Типичные планировки: возьмите похожую и поправьте под свой склад.
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'thin' }}>
          {built.map((item) => (
            <PresetCard key={item.preset.id} item={item} active={item.code === current} onPick={() => pick(item)} compact={false} />
          ))}
        </div>
      </aside>
    </div>,
    slot,
  );
}
