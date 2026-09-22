import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Maturity, Solution } from '@/api/types';
import { categorize, listCategories } from './solutionCategory';

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

const ALL_MATURITY: Maturity[] = ['operation', 'piloting', 'rnd'];

const OBJECT_TYPES = [
  { slug: 'warehouse', label: 'Склад' },
  { slug: 'airport', label: 'Аэропорт' },
  { slug: 'clinic', label: 'Клиника' },
];

const MATURITY_OPTIONS: { id: Maturity; label: string }[] = [
  { id: 'operation', label: 'В эксплуатации' },
  { id: 'piloting', label: 'Пилот' },
  { id: 'rnd', label: 'НИОКР' },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'По названию' },
  { value: 'price-asc', label: 'Сначала дешевле' },
  { value: 'price-desc', label: 'Сначала дороже' },
  { value: 'payload-desc', label: 'По грузоподъёмности' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

function matchesQuery(solution: Solution, query: string): boolean {
  const haystack = `${solution.name} ${solution.vendor} ${solution.useCase}`.toLocaleLowerCase('ru');
  return haystack.includes(query);
}

function parsePrice(value: string): number {
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-hairline py-4 last:border-b-0">
      <h2 className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-meta-foreground">
        {title}
      </h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function FilterCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-[32px] cursor-pointer items-center gap-2.5 text-[13.5px] leading-snug text-foreground">
      <Checkbox checked={checked} onCheckedChange={onChange} className="size-4" />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

function SolutionRow({
  solution,
  selected,
  onToggleCompare,
}: {
  solution: Solution;
  selected: boolean;
  onToggleCompare: () => void;
}) {
  const category = categorize(solution);

  return (
    <article
      className={cn(
        'border-b border-hairline px-4 py-3.5 transition-colors last:border-b-0 sm:px-5',
        selected ? 'bg-accent-tint/70' : 'hover:bg-canvas/60',
      )}
    >
      <div className="flex gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleCompare}
          className="mt-1 size-[18px] shrink-0"
          aria-label={
            selected ? `Убрать ${solution.name} из сравнения` : `Добавить ${solution.name} в сравнение`
          }
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-meta-foreground">
                  {solution.vendor}
                </span>
                <span className="text-[11px] text-meta-foreground">· {category.label}</span>
              </div>
              <h3 className="mt-0.5 font-heading text-[16px] font-semibold leading-snug tracking-h2 text-foreground sm:text-[17px]">
                {solution.name}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-muted-foreground">
                {solution.useCase}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <div className="font-heading text-[20px] font-semibold tabular leading-none tracking-h2 text-foreground sm:text-[22px]">
                {solution.price}
                <span className="ml-1 text-[12px] font-medium text-muted-foreground">млн ₽</span>
              </div>
              <span
                className={cn(
                  'mt-1.5 inline-flex items-center justify-end gap-1.5 text-[12px] font-medium',
                  MATURITY_TEXT[solution.maturity],
                )}
              >
                <span className={cn('size-1.5 rounded-full', MATURITY_DOT[solution.maturity])} aria-hidden />
                {MATURITY_LABEL[solution.maturity]}
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
            <span>
              <span className="font-mono font-medium tabular text-foreground">{solution.payload}</span>
              <span className="ml-1">груз</span>
            </span>
            <span className="text-border" aria-hidden>
              |
            </span>
            <span>
              <span className="font-mono font-medium tabular text-foreground">{solution.speed}</span>
              <span className="ml-1">скорость</span>
            </span>
            <span className="text-border" aria-hidden>
              |
            </span>
            <span
              className={cn(
                'font-medium',
                solution.confidence === 'confirmed' ? 'text-status-confirmed' : 'text-status-piloting',
              )}
            >
              {solution.confidence === 'confirmed' ? 'Подтверждено' : 'Требует проверки'}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function SolutionRowSkeleton() {
  return (
    <div className="flex gap-3 border-b border-hairline px-4 py-4 last:border-b-0 sm:px-5">
      <div className="mt-1 size-[18px] animate-pulse rounded bg-muted" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const objectType = searchParams.get('objectType') ?? 'warehouse';
  const { data: solutions, isLoading } = useSolutions(objectType);
  const { comparedIds, toggleCompared } = useWizardStore();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortValue>('name');
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [activeMaturity, setActiveMaturity] = useState<Set<Maturity>>(new Set(ALL_MATURITY));
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const categories = listCategories();

  const toggleCategory = (id: string) =>
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleMaturity = (id: Maturity) =>
    setActiveMaturity((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const resetFilters = () => {
    setActiveCategories(new Set());
    setActiveMaturity(new Set(ALL_MATURITY));
    setPriceMin('');
    setPriceMax('');
  };

  const activeFilterCount =
    activeCategories.size + (ALL_MATURITY.length - activeMaturity.size) + (priceMin ? 1 : 0) + (priceMax ? 1 : 0);

  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const rows = useMemo(() => solutions ?? [], [solutions]);

  const filteredRows = useMemo(() => {
    const min = priceMin ? parsePrice(priceMin) : undefined;
    const max = priceMax ? parsePrice(priceMax) : undefined;

    return rows.filter((solution) => {
      if (normalizedQuery && !matchesQuery(solution, normalizedQuery)) return false;
      if (activeCategories.size > 0 && !activeCategories.has(categorize(solution).id)) return false;
      if (!activeMaturity.has(solution.maturity)) return false;
      const price = parsePrice(solution.price);
      if (min !== undefined && price < min) return false;
      if (max !== undefined && price > max) return false;
      return true;
    });
  }, [rows, normalizedQuery, activeCategories, activeMaturity, priceMin, priceMax]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    switch (sort) {
      case 'price-asc':
        return copy.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      case 'price-desc':
        return copy.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
      case 'payload-desc':
        return copy.sort((a, b) => parseFloat(b.payload) - parseFloat(a.payload) || 0);
      case 'name':
      default:
        return copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
  }, [filteredRows, sort]);

  const filters = (
    <>
      <FilterSection title="Тип объекта">
        <div className="grid gap-0.5">
          {OBJECT_TYPES.map((item) => (
            <button
              key={item.slug}
              type="button"
              aria-pressed={item.slug === objectType}
              onClick={() => setSearchParams({ objectType: item.slug })}
              className={cn(
                'rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors',
                item.slug === objectType
                  ? 'bg-foreground font-medium text-background'
                  : 'text-foreground/80 hover:bg-canvas',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Класс решения">
        <div className="grid gap-0.5">
          {categories.map((category) => (
            <FilterCheck
              key={category.id}
              label={category.label}
              checked={activeCategories.has(category.id)}
              onChange={() => toggleCategory(category.id)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Зрелость">
        <div className="grid gap-0.5">
          {MATURITY_OPTIONS.map((item) => (
            <FilterCheck
              key={item.id}
              label={item.label}
              checked={activeMaturity.has(item.id)}
              onChange={() => toggleMaturity(item.id)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Цена, млн ₽">
        <div className="flex items-center gap-2">
          <Input
            value={priceMin}
            onChange={(event) => setPriceMin(event.target.value)}
            placeholder="от"
            inputMode="decimal"
            className="h-9 rounded-[10px] text-[13px]"
            aria-label="Цена от"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            value={priceMax}
            onChange={(event) => setPriceMax(event.target.value)}
            placeholder="до"
            inputMode="decimal"
            className="h-9 rounded-[10px] text-[13px]"
            aria-label="Цена до"
          />
        </div>
      </FilterSection>

      {activeFilterCount > 0 ? (
        <button
          type="button"
          onClick={resetFilters}
          className="mt-3 text-[13px] font-medium text-foreground hover:underline"
        >
          Сбросить фильтры
        </button>
      ) : null}
    </>
  );

  return (
    <AppShell>
      <div className={cn('mt-5', comparedIds.length > 0 && 'pb-20')}>
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          {/* Desktop filters */}
          <aside className="hidden lg:block">
            <div className="sticky top-[4.5rem] rounded-2xl border border-border bg-background px-4 py-1 shadow-soft">
              {filters}
            </div>
          </aside>

          {/* Results */}
          <div className="min-w-0">
            <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-soft">
              <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <Search className="size-[17px] flex-none text-muted-foreground" strokeWidth={2} aria-hidden />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Найти по названию, вендору или задаче"
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
                    aria-label="Поиск по каталогу"
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
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-canvas px-2.5 py-2 text-[12.5px] font-medium text-foreground lg:hidden"
                    onClick={() => setMobileFiltersOpen(true)}
                  >
                    <SlidersHorizontal className="size-3.5" strokeWidth={2} aria-hidden />
                    Фильтры
                    {activeFilterCount > 0 ? (
                      <span className="font-mono text-[11px] tabular text-meta-foreground">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>

                  {!isLoading ? (
                    <span className="hidden font-mono text-[12px] tabular text-meta-foreground sm:inline">
                      {sortedRows.length} из {rows.length}
                    </span>
                  ) : null}

                  <Select
                    aria-label="Сортировка"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortValue)}
                    options={[...SORT_OPTIONS]}
                    className="h-9 w-[168px] rounded-[10px] text-[12.5px]"
                  />
                </div>
              </div>

              {!isLoading ? (
                <div className="border-b border-hairline bg-canvas/40 px-4 py-2 text-[12.5px] text-muted-foreground sm:hidden">
                  {sortedRows.length} из {rows.length}
                </div>
              ) : null}

              {isLoading ? (
                <>
                  {[0, 1, 2, 3, 4].map((key) => (
                    <SolutionRowSkeleton key={key} />
                  ))}
                </>
              ) : rows.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <h2 className="font-heading text-[17px] font-semibold">Пока нет решений</h2>
                  <p className="mx-auto mt-2 max-w-[38ch] text-[13.5px] text-muted-foreground">
                    Для этого типа объекта в каталоге ещё нет позиций. Выберите другой тип слева.
                  </p>
                </div>
              ) : sortedRows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                  <h2 className="font-heading text-[17px] font-semibold">
                    {query ? `Ничего не нашлось по запросу «${query}»` : 'Ничего не подходит под фильтры'}
                  </h2>
                  <p className="max-w-[38ch] text-[13.5px] text-muted-foreground">
                    Ослабьте фильтры или сбросьте их.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      resetFilters();
                    }}
                  >
                    Сбросить всё
                  </Button>
                </div>
              ) : (
                sortedRows.map((solution) => (
                  <SolutionRow
                    key={solution.id}
                    solution={solution}
                    selected={comparedIds.includes(solution.id)}
                    onToggleCompare={() => toggleCompared(solution.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile filter sheet */}
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/30"
            aria-label="Закрыть фильтры"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(100%,320px)] flex-col bg-background shadow-lift">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <span className="font-heading text-[16px] font-semibold">Фильтры</span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-[10px] p-2 text-muted-foreground hover:bg-canvas hover:text-foreground"
                aria-label="Закрыть"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-1">{filters}</div>
            <div className="border-t border-hairline p-4">
              <Button className="w-full" onClick={() => setMobileFiltersOpen(false)}>
                Показать {sortedRows.length}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {comparedIds.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-[18px] pb-[18px]">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-border bg-background px-5 py-3 shadow-lift">
            <span className="text-[13.5px] font-medium">
              К сравнению: <span className="font-mono tabular">{comparedIds.length}</span>
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
