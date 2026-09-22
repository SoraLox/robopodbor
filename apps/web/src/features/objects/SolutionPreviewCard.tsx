import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Maturity, Solution } from '@/api/types';
import { categorize } from '@/features/catalog/solutionCategory';
import { getFitTone } from '@/features/catalog/fitTone';
import { wizardCardHeightPx, WIZARD_WIDTH_PREVIEW } from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

const PREVIEW_BY_CATEGORY: Record<string, string> = {
  amr: '/pics/placeholders/warehouse.webp',
  asrs: '/pics/placeholders/warehouse.webp',
  sort: '/pics/roboarm4.webp',
  pick: '/pics/roboarm3.webp',
  uav: '/pics/placeholders/airport.webp',
  other: '/pics/roboarm4.webp',
};

function previewImage(solution: Solution): string {
  return PREVIEW_BY_CATEGORY[categorize(solution).id] ?? PREVIEW_BY_CATEGORY.other;
}

/**
 * Вторая карточка мастера: тот же блок (высота, радиус, тень),
 * выезжает справа от списка — не fullscreen-drawer.
 */
export function SolutionPreviewCard({
  solution,
  open,
  onClose,
}: {
  solution: Solution | null;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(wizardCardHeightPx);
  const tone = solution?.score !== undefined ? getFitTone(solution.score) : null;
  const category = solution ? categorize(solution) : null;

  useLayoutEffect(() => {
    const sync = () => setHeight(wizardCardHeightPx());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={cn(
        'overflow-hidden transition-[max-width,opacity,margin] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        open ? 'ml-3 opacity-100' : 'ml-0 max-w-0 opacity-0',
      )}
      style={open ? { maxWidth: WIZARD_WIDTH_PREVIEW } : undefined}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className="flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[20px] bg-white"
        style={{
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          width: WIZARD_WIDTH_PREVIEW,
          height,
        }}
      >
        {solution ? (
          <>
            <div className="relative flex-none px-5 pt-5">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-[#F2F2F2] text-[#1C1C1E] transition-colors hover:bg-[#E5E5EA]"
                aria-label="Закрыть"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>

              <div className="relative overflow-hidden rounded-[14px] border border-[#E5E5EA] bg-[#F2F2F2]">
                <img
                  src={previewImage(solution)}
                  alt=""
                  className="aspect-[16/9] w-full object-cover object-center"
                />
                {category ? (
                  <span className="absolute bottom-2.5 left-2.5 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#1C1C1E] backdrop-blur-sm">
                    {category.label}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:thin]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8E8E93]">
                  {solution.vendor}
                </span>
                <span className="text-[12px] font-medium text-[#8E8E93]">
                  {MATURITY_LABEL[solution.maturity]}
                </span>
              </div>

              <h2
                id={titleId}
                className="mt-1 text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-[#1C1C1E]"
              >
                {solution.name}
              </h2>
              <p className="mt-1.5 text-[13px] leading-[1.4] text-[#6E6E73]">{solution.useCase}</p>

              {solution.score !== undefined ? (
                <div className="mt-4 rounded-[12px] bg-[#F7F7F8] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-[#8E8E93]">Соответствие</span>
                    <span
                      className={cn(
                        'text-[20px] font-semibold tabular-nums leading-none',
                        tone?.text,
                      )}
                    >
                      {solution.score}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E5EA]">
                    <div
                      className={cn('h-full rounded-full', tone?.bar)}
                      style={{ width: `${solution.score}%` }}
                    />
                  </div>
                  {solution.scoreFactors && solution.scoreFactors.length > 0 ? (
                    <ul className="mt-3 grid gap-1.5">
                      {solution.scoreFactors.map((factor) => (
                        <li
                          key={factor.label}
                          className="flex items-baseline justify-between gap-3 text-[12px]"
                        >
                          <span className="min-w-0 truncate text-[#6E6E73]">{factor.label}</span>
                          <span className="flex-none tabular-nums font-medium text-[#1C1C1E]">
                            {factor.weight}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <dl className="mt-4 grid grid-cols-2 gap-2">
                <Spec label="Цена" value={`${solution.price} млн ₽`} />
                <Spec label="Грузоподъёмность" value={solution.payload} />
                <Spec label="Скорость" value={solution.speed} />
                <Spec
                  label="Данные"
                  value={solution.confidence === 'confirmed' ? 'Подтверждены' : 'Проверить'}
                />
              </dl>

              {solution.source ? (
                <p className="mt-4 text-[11px] leading-snug text-[#8E8E93]">
                  Источник: {solution.source}
                  {solution.sourceDate ? ` · ${solution.sourceDate}` : ''}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[#E5E5EA] px-2.5 py-2">
      <dt className="text-[10px] text-[#8E8E93]">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-[#1C1C1E]">
        {value}
      </dd>
    </div>
  );
}
