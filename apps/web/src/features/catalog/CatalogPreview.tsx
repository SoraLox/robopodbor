import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** Стиль карточки как у мини-меню профиля. */
export const catalogPanelClass =
  'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]';

/**
 * Модальная карточка робота поверх каталога: затемнение, Esc, клик по фону.
 */
export function CatalogPreview({
  solution,
  open,
  compared,
  onClose,
  onToggleCompare,
}: {
  solution: Solution | null;
  open: boolean;
  compared: boolean;
  onClose: () => void;
  onToggleCompare: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [displayed, setDisplayed] = useState<Solution | null>(solution);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (solution) setDisplayed(solution);
  }, [solution]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      return;
    }
    // Держим карточку до конца анимации закрытия.
    const timer = window.setTimeout(() => setVisible(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!visible || !displayed) return null;

  const category = categorize(displayed);
  const CategoryIcon = category.icon;
  const photo = robotPhoto(displayed);
  const specs = withSourceRefs(specGroups(displayed));

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6',
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        open ? 'opacity-100' : 'opacity-0',
      )}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[min(92dvh,880px)] w-full max-w-[480px] flex-col overflow-hidden',
          'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.16)]',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          open ? 'translate-y-0 sm:scale-100' : 'translate-y-3 sm:translate-y-0 sm:scale-[0.98]',
        )}
      >
        <div className="relative flex-none border-b border-[#E5E5EA] px-4 pb-3.5 pt-4">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-[#F2F2F2] text-foreground transition-colors hover:bg-[#E5E5EA]"
            aria-label="Закрыть"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>

          {photo ? (
            <div className="relative mr-8 overflow-hidden rounded-[14px] border border-[#E5E5EA] bg-white">
              <img
                src={photo}
                alt={displayed.name}
                decoding="async"
                className="aspect-[16/10] w-full object-contain object-center p-4"
              />
              <span className="absolute bottom-2.5 left-2.5 rounded-[6px] bg-[#F2F2F2]/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
                {category.label}
              </span>
            </div>
          ) : (
            <div className="relative mr-8 flex aspect-[16/10] flex-col items-center justify-center gap-2 overflow-hidden rounded-[14px] border border-[#E5E5EA] bg-[#FAFAFA]">
              <span className="flex size-12 items-center justify-center rounded-[14px] bg-[#F2F2F2] text-[#8E8E93]">
                <CategoryIcon className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-[12px] font-medium text-[#8E8E93]">{category.label}</span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 [scrollbar-width:thin]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8E8E93]">
              {displayed.vendor}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px] font-medium',
                MATURITY_TEXT[displayed.maturity],
              )}
            >
              <span className={cn('size-1.5 rounded-full', MATURITY_DOT[displayed.maturity])} aria-hidden />
              {MATURITY_LABEL[displayed.maturity]}
            </span>
          </div>

          <h2
            id={titleId}
            className="mt-1 font-heading text-[18px] font-semibold leading-snug tracking-h2 text-foreground"
          >
            {displayed.name}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6E6E73]">{displayed.useCase}</p>

          <div className="mt-4 font-heading text-[24px] font-semibold tabular leading-none tracking-h1 text-foreground">
            {displayed.price}
            <span className="ml-1.5 text-[13px] font-medium text-[#8E8E93]">млн ₽</span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Spec label="Грузоподъёмность" value={displayed.payload} />
            <Spec label="Скорость" value={displayed.speed} />
            <Spec
              label="Данные"
              value={displayed.confidence === 'confirmed' ? 'Подтверждены' : 'Требуют проверки'}
            />
            <Spec
              label="Полнота карточки"
              value={displayed.completeness !== undefined ? `${displayed.completeness}%` : '—'}
            />
          </dl>

          {specs.groups.map((group) => (
            <section key={group.title} className="mt-5">
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
                          <span className="ml-1.5 whitespace-nowrap text-[11px] font-medium text-status-piloting">
                            {tag}
                          </span>
                        ) : null}
                        {tag && row.provenance?.note ? (
                          <span className="mt-0.5 block text-[11px] leading-snug text-[#8E8E93]">
                            {row.provenance.note}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}

          {specs.sources.length ? (
            <section className="mt-5">
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

          {displayed.sourceUrl ? (
            <a
              href={displayed.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-block text-[12px] font-medium text-foreground underline underline-offset-2"
            >
              Открыть источник
            </a>
          ) : null}
        </div>

        <div className="flex-none border-t border-[#E5E5EA] p-3.5">
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
      </aside>
    </div>,
    document.body,
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
