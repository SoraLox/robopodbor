import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, Minus, MoreVertical, Plus, Search, X } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Maturity, Solution } from '@/api/types';
import { CatalogFilters } from './CatalogFilters';

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

/** Диагональная штриховка вместо картинки — технический знак «фото не загружено», а не детская иконка-заглушка. */
const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(135deg, hsl(var(--border)) 0 1px, transparent 1px 9px)',
};

function matchesQuery(solution: Solution, query: string): boolean {
  const haystack = `${solution.name} ${solution.vendor} ${solution.useCase}`.toLocaleLowerCase('ru');
  return haystack.includes(query);
}

/** Меню действий карточки: три точки → добавить в сравнение или перейти к нему сразу. */
function CardMenu({
  selected,
  onToggleCompare,
  onCompareNow,
}: {
  selected: boolean;
  onToggleCompare: () => void;
  onCompareNow: () => void;
}) {
  const close = (event: React.MouseEvent<HTMLElement>) => {
    event.currentTarget.closest('details')?.removeAttribute('open');
  };

  return (
    <details name="catalog-card-menu" className="absolute right-2.5 top-2.5">
      <summary
        className={cn(
          'flex size-7 list-none items-center justify-center rounded-md border transition-colors [&::-webkit-details-marker]:hidden',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:border-foreground/40',
        )}
        aria-label="Действия с решением"
      >
        <MoreVertical className="size-3.5" strokeWidth={2} />
      </summary>

      <div className="absolute right-0 top-[calc(100%+4px)] z-10 w-52 overflow-hidden rounded-md border border-border bg-background py-1 shadow-soft">
        <button
          type="button"
          onClick={(event) => {
            onToggleCompare();
            close(event);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-canvas"
        >
          {selected ? (
            <Minus className="size-3.5 flex-none text-muted-foreground" strokeWidth={2} />
          ) : (
            <Plus className="size-3.5 flex-none text-muted-foreground" strokeWidth={2} />
          )}
          {selected ? 'Убрать из сравнения' : 'Добавить в сравнение'}
        </button>
        <button
          type="button"
          onClick={(event) => {
            onCompareNow();
            close(event);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-canvas"
        >
          <ArrowUpRight className="size-3.5 flex-none text-muted-foreground" strokeWidth={2} />
          Сравнить прямо сейчас
        </button>
      </div>
    </details>
  );
}

function SolutionCard({
  solution,
  selected,
  onToggleCompare,
  onCompareNow,
}: {
  solution: Solution;
  selected: boolean;
  onToggleCompare: () => void;
  onCompareNow: () => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-background transition-colors',
        selected ? 'border-primary' : 'border-border hover:border-foreground/25',
      )}
    >
      <div className="relative aspect-[4/3] border-b border-border bg-canvas" style={HATCH_STYLE}>
        <CardMenu selected={selected} onToggleCompare={onToggleCompare} onCompareNow={onCompareNow} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-meta-foreground">
            {solution.vendor}
          </span>
          <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', MATURITY_TEXT[solution.maturity])}>
            <span className={cn('size-1.5 rounded-full', MATURITY_DOT[solution.maturity])} aria-hidden />
            {MATURITY_LABEL[solution.maturity]}
          </span>
        </div>

        <h3 className="mt-1.5 font-heading text-[17px] font-semibold leading-snug tracking-h2">
          {solution.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.5] text-muted-foreground">
          {solution.useCase}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
          <div>
            <div className="font-mono text-[15px] font-medium tabular text-foreground">
              {solution.price}
            </div>
            <div className="meta-label mt-0.5">млн ₽</div>
          </div>
          <div>
            <div className="font-mono text-[15px] font-medium tabular text-foreground">
              {solution.payload}
            </div>
            <div className="meta-label mt-0.5">грузопод.</div>
          </div>
          <div>
            <div className="font-mono text-[15px] font-medium tabular text-foreground">
              {solution.speed}
            </div>
            <div className="meta-label mt-0.5">скорость</div>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-hairline pt-3">
          {solution.score !== undefined ? (
            <details className="group/rank">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-primary [&::-webkit-details-marker]:hidden hover:text-primary-hover">
                Балл {solution.score}
                <ChevronDown
                  className="size-3 transition-transform group-open/rank:rotate-180"
                  strokeWidth={2}
                />
              </summary>
              <ul className="mt-1.5 grid gap-1">
                {solution.scoreFactors?.map((factor) => (
                  <li key={factor.label} className="text-[11px] leading-tight text-muted-foreground">
                    {factor.label} · +{factor.weight}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <span />
          )}

          <span
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium',
              solution.confidence === 'confirmed' ? 'text-status-confirmed' : 'text-status-piloting',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                solution.confidence === 'confirmed' ? 'bg-status-confirmed' : 'bg-status-piloting',
              )}
              aria-hidden
            />
            {solution.confidence === 'confirmed' ? 'Подтверждено' : 'Требует проверки'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SolutionCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-2.5 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const objectType = searchParams.get('objectType') ?? 'warehouse';
  const { data: solutions, isLoading } = useSolutions(objectType);
  const { comparedIds, toggleCompared, addCompared } = useWizardStore();
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const rows = useMemo(() => solutions ?? [], [solutions]);
  const filteredRows = useMemo(
    () => (normalizedQuery ? rows.filter((solution) => matchesQuery(solution, normalizedQuery)) : rows),
    [rows, normalizedQuery],
  );

  const compareNow = (id: string) => {
    addCompared(id);
    navigate('/catalog/compare');
  };

  return (
    <AppShell>
      <label className="mb-5 mt-5 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors focus-within:border-primary">
        <Search className="size-[17px] flex-none text-muted-foreground" strokeWidth={2} aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти по названию, вендору или задаче — например, «паллетовоз»"
          className="w-full border-0 bg-transparent p-0 text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Очистить поиск"
            className="flex-none text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        ) : null}
        {!isLoading ? (
          <span className="flex-none rounded-md bg-canvas px-2 py-1 font-mono text-[12px] tabular text-meta-foreground">
            {filteredRows.length}
          </span>
        ) : null}
      </label>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <CatalogFilters
          objectType={objectType}
          onObjectTypeChange={(slug) => setSearchParams({ objectType: slug })}
        />

        <div className={cn(comparedIds.length > 0 && 'pb-20')}>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <SolutionCardSkeleton key={key} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-background p-16 text-center">
              <h2 className="font-heading text-[17px] font-semibold">Пока нет решений</h2>
              <p className="mx-auto mt-2 max-w-[38ch] text-[13.5px] text-muted-foreground">
                Для этого типа объекта в каталоге ещё нет решений. Попробуйте выбрать другой тип слева.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-16 text-center">
              <h2 className="font-heading text-[17px] font-semibold">
                Ничего не нашлось по запросу «{query}»
              </h2>
              <p className="max-w-[38ch] text-[13.5px] text-muted-foreground">
                Проверьте написание или попробуйте более общее слово.
              </p>
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                Сбросить поиск
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRows.map((solution) => (
                <SolutionCard
                  key={solution.id}
                  solution={solution}
                  selected={comparedIds.includes(solution.id)}
                  onToggleCompare={() => toggleCompared(solution.id)}
                  onCompareNow={() => compareNow(solution.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {comparedIds.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-[18px] pb-[18px]">
          <div className="pointer-events-auto flex items-center gap-4 rounded-lg border border-border bg-background px-5 py-3 shadow-lift">
            <span className="text-[13.5px] font-medium">
              Выбрано для сравнения: <span className="font-mono tabular">{comparedIds.length}</span>
            </span>
            <Button asChild size="sm">
              <Link to="/catalog/compare">
                Сравнить
                <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

export default CatalogPage;
