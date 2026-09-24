import { useEffect, useId, useRef } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { Maturity, Solution } from '@/api/types';
import { Button } from '@/components/ui/button';
import { categorize } from './solutionCategory';
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

/*
  Запасная картинка лежит отдельной константой, а не ключом 'other' внутри
  таблицы: при noUncheckedIndexedAccess чтение по индексу даёт string |
  undefined, поэтому фоллбэк из той же таблицы сам считается возможно
  отсутствующим и не закрывает тип.
*/
const PREVIEW_FALLBACK = `${import.meta.env.BASE_URL}pics/roboarm4.webp`;

const PREVIEW_BY_CATEGORY: Record<string, string> = {
  amr: `${import.meta.env.BASE_URL}pics/placeholders/warehouse.webp`,
  asrs: `${import.meta.env.BASE_URL}pics/placeholders/warehouse.webp`,
  sort: `${import.meta.env.BASE_URL}pics/roboarm4.webp`,
  pick: `${import.meta.env.BASE_URL}pics/roboarm3.webp`,
  uav: `${import.meta.env.BASE_URL}pics/placeholders/airport.webp`,
};

function previewImage(solution: Solution): string {
  return PREVIEW_BY_CATEGORY[categorize(solution).id] ?? PREVIEW_FALLBACK;
}

/**
 * Боковая панель каталога: детали решения без балла соответствия.
 * Открывается по клику на строку выдачи.
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
  const category = solution ? categorize(solution) : null;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !solution) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/25"
        aria-label="Закрыть предпросмотр"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-background shadow-lift animate-in slide-in-from-right duration-200"
      >
        <div className="relative flex-none border-b border-hairline px-5 pb-4 pt-5">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-canvas text-foreground transition-colors hover:bg-hairline"
            aria-label="Закрыть"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>

          <div className="relative mr-8 overflow-hidden rounded-2xl border border-border bg-canvas">
            <img
              src={previewImage(solution)}
              alt=""
              className="aspect-[16/10] w-full object-cover object-center"
            />
            {category ? (
              <span className="absolute bottom-2.5 left-2.5 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
                {category.label}
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:thin]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-meta-foreground">
              {solution.vendor}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[12.5px] font-medium',
                MATURITY_TEXT[solution.maturity],
              )}
            >
              <span className={cn('size-1.5 rounded-full', MATURITY_DOT[solution.maturity])} aria-hidden />
              {MATURITY_LABEL[solution.maturity]}
            </span>
          </div>

          <h2
            id={titleId}
            className="mt-1.5 font-heading text-[20px] font-semibold leading-snug tracking-h2 text-foreground"
          >
            {solution.name}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{solution.useCase}</p>

          <div className="mt-5 font-heading text-[28px] font-semibold tabular leading-none tracking-h1 text-foreground">
            {solution.price}
            <span className="ml-1.5 text-[14px] font-medium text-muted-foreground">млн ₽</span>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2">
            <Spec label="Грузоподъёмность" value={solution.payload} />
            <Spec label="Скорость" value={solution.speed} />
            <Spec
              label="Данные"
              value={solution.confidence === 'confirmed' ? 'Подтверждены' : 'Требуют проверки'}
            />
            <Spec label="Класс" value={category?.label ?? '—'} />
          </dl>

          {solution.source ? (
            <p className="mt-5 text-[12px] leading-snug text-meta-foreground">
              Источник: {solution.source}
              {solution.sourceDate ? ` · ${solution.sourceDate}` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex-none border-t border-hairline p-4">
          <Button className="w-full" variant={compared ? 'outline' : 'default'} onClick={onToggleCompare}>
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
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border px-3 py-2.5">
      <dt className="text-[11px] text-meta-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-[13.5px] font-semibold tabular text-foreground">{value}</dd>
    </div>
  );
}
