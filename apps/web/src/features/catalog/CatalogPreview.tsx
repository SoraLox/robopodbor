import { useEffect, useId, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { Maturity, Solution } from '@/api/types';
import { Button } from '@/components/ui/button';
import { robotPhoto } from '@/features/objects/previewImages';
import { categorize } from './solutionCategory';
import { SOURCE_KIND_LABEL } from '@domain/catalog';
import { provenanceTag, specGroups, withSourceRefs } from './solutionSpecs';
import { cn } from '@/lib/utils';

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

const MATURITY_DOT: Record<Maturity, string> = {
  operation: 'bg-status-operation',
  piloting: 'bg-status-piloting',
  rnd: 'bg-status-rnd',
};

const MATURITY_TEXT: Record<Maturity, string> = {
  operation: 'text-status-operation',
  piloting: 'text-status-piloting',
  rnd: 'text-status-rnd',
};

const PREVIEW_WIDTH = 360;

/** Стиль карточки как у мини-меню профиля. */
export const catalogPanelClass =
  'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]';

/**
 * Превью в колонке сетки каталога — скроллится вместе со страницей.
 * Выезжает плавно; контент держим до конца анимации закрытия.
 */
export function CatalogPreview({
  solution,
  open,
  compared,
  onClose,
  onToggleCompare,
  embedded = false,
}: {
  solution: Solution | null;
  open: boolean;
  compared: boolean;
  onClose: () => void;
  onToggleCompare: () => void;
  /** true — панель заполняет родителя (мобильный fixed-слой), без своего max-width. */
  embedded?: boolean;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [displayed, setDisplayed] = useState<Solution | null>(solution);

  useEffect(() => {
    if (solution) setDisplayed(solution);
  }, [solution]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const active = displayed;
  const category = active ? categorize(active) : null;
  const photo = active ? robotPhoto(active) : undefined;
  const specs = active ? withSourceRefs(specGroups(active)) : null;

  const panel = (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cn(
        catalogPanelClass,
        'flex flex-col overflow-hidden',
        embedded
          ? 'h-full w-full'
          : cn(
              'transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
              open ? 'translate-x-0' : 'translate-x-5',
            ),
      )}
      style={embedded ? undefined : { width: PREVIEW_WIDTH }}
    >
      {active ? (
        <>
          <div className="relative flex-none border-b border-[#E5E5EA] px-3.5 pb-3 pt-3.5">
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-[12px] text-foreground transition-colors hover:bg-[#F2F2F2]"
              aria-label="Закрыть"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>

            {photo ? (
              <div className="relative mr-6 overflow-hidden rounded-[12px] border border-[#E5E5EA] bg-white">
                {/* Фото производителя — предмет на фоне: вписываем целиком, а не обрезаем. */}
                <img
                  src={photo}
                  alt={active.name}
                  decoding="async"
                  className="aspect-[16/10] w-full object-contain object-center p-3"
                />
                {category ? (
                  <span className="absolute bottom-2 left-2 rounded-[6px] bg-[#F2F2F2]/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
                    {category.label}
                  </span>
                ) : null}
              </div>
            ) : category ? (
              <span className="inline-flex rounded-[6px] bg-[#F2F2F2] px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                {category.label}
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 [scrollbar-width:thin]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8E8E93]">
                {active.vendor}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-[12px] font-medium',
                  MATURITY_TEXT[active.maturity],
                )}
              >
                <span className={cn('size-1.5 rounded-full', MATURITY_DOT[active.maturity])} aria-hidden />
                {MATURITY_LABEL[active.maturity]}
              </span>
            </div>

            <h2
              id={titleId}
              className="mt-1 font-heading text-[17px] font-semibold leading-snug tracking-h2 text-foreground"
            >
              {active.name}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6E6E73]">{active.useCase}</p>

            <div className="mt-3.5 font-heading text-[22px] font-semibold tabular leading-none tracking-h1 text-foreground">
              {active.price}
              <span className="ml-1.5 text-[13px] font-medium text-[#8E8E93]">млн ₽</span>
            </div>

            <dl className="mt-3.5 grid grid-cols-2 gap-1.5">
              <Spec label="Грузоподъёмность" value={active.payload} />
              <Spec label="Скорость" value={active.speed} />
              <Spec
                label="Данные"
                value={active.confidence === 'confirmed' ? 'Подтверждены' : 'Требуют проверки'}
              />
              <Spec
                label="Полнота карточки"
                value={active.completeness !== undefined ? `${active.completeness}%` : '—'}
              />
            </dl>

            {specs?.groups.map((group) => (
              <section key={group.title} className="mt-4">
                <h3 className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8E8E93]">
                  {group.title}
                </h3>
                <dl className="mt-1.5 divide-y divide-[#F2F2F2]">
                  {group.rows.map((row) => {
                    const tag = provenanceTag(row.provenance) ?? (row.assumption ? 'допущение' : undefined);
                    return (
                      <div key={row.label} className="flex gap-3 py-1.5 text-[12.5px] leading-snug">
                        <dt className="w-[42%] flex-none text-[#8E8E93]">{row.label}</dt>
                        <dd className={cn('min-w-0 flex-1', row.value ? 'text-foreground' : 'text-[#C7C7CC]')}>
                          {row.value ?? 'нет данных'}
                          {row.value && row.refs?.length ? (
                            <sup
                              className="ml-0.5 text-[10px] tabular-nums text-[#8E8E93]"
                              aria-label={`Источники: ${row.refs.join(', ')}`}
                            >
                              {row.refs.join(',')}
                            </sup>
                          ) : null}
                          {tag ? (
                            <span className="ml-1.5 whitespace-nowrap text-[11px] font-medium text-status-piloting">{tag}</span>
                          ) : null}
                          {tag && row.provenance?.note ? (
                            <span className="mt-0.5 block text-[11px] leading-snug text-[#8E8E93]">{row.provenance.note}</span>
                          ) : null}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}

            {specs?.sources.length ? (
              <section className="mt-4">
                <h3 className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8E8E93]">
                  Источники
                </h3>
                <ol className="mt-1.5 space-y-1.5">
                  {specs.sources.map((source, index) => (
                    <li key={`${source.title}-${index}`} className="flex gap-2 text-[12px] leading-snug">
                      <span className="w-4 flex-none tabular-nums text-[#8E8E93]">{index + 1}</span>
                      <span className="min-w-0">
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="break-words text-foreground underline decoration-[#C7C7CC] underline-offset-2 hover:decoration-foreground"
                          >
                            {source.title}
                          </a>
                        ) : (
                          <span className="text-foreground">{source.title}</span>
                        )}
                        <span className="block text-[11px] text-[#8E8E93]">
                          {SOURCE_KIND_LABEL[source.kind]}
                          {source.date ? ` · ${source.date}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {active.sourceUrl ? (
              <a
                href={active.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block text-[12px] font-medium text-foreground underline underline-offset-2"
              >
                Открыть источник
              </a>
            ) : null}
          </div>

          <div className="flex-none border-t border-[#E5E5EA] p-3">
            <Button
              className="w-full rounded-[12px]"
              size="sm"
              variant={compared ? 'outline' : 'default'}
              onClick={onToggleCompare}
            >
              {compared ? (
                <>
                  <Minus className="size-3.5" strokeWidth={2.5} />
                  Убрать из сравнения
                </>
              ) : (
                <>
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  Добавить в сравнение
                </>
              )}
            </Button>
          </div>
        </>
      ) : null}
    </aside>
  );

  if (embedded) {
    return (
      <div className="h-full" aria-hidden={!open}>
        {panel}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden transition-[max-width,opacity] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ maxWidth: open ? PREVIEW_WIDTH : 0 }}
      aria-hidden={!open}
    >
      {panel}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#E5E5EA] px-2.5 py-2">
      <dt className="text-[10.5px] text-[#8E8E93]">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold tabular text-foreground">{value}</dd>
    </div>
  );
}
