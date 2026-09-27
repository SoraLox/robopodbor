import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Maturity, Solution } from '@/api/types';
import { CatalogPreview, catalogPanelClass } from './CatalogPreview';
import { categorize } from './solutionCategory';
import {
  buildFilterTree,
  isSameSelection,
  matchesTreeSelection,
  toSelection,
  type FilterTreeNode,
  type TreeSelection,
} from './catalogFilterTree';

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
  { value: 'completeness-desc', label: 'По полноте данных' },
] as const;

const AVAILABILITY_OPTIONS: { id: Availability; label: string }[] = [
  { id: 'available', label: 'В наличии' },
  { id: 'on-order', label: 'Под заказ' },
  { id: 'pilot', label: 'Только пилот' },
];

type Availability = NonNullable<Solution['availability']>;
type OriginFilter = 'all' | 'ru' | 'foreign';
type DataFilter = 'all' | 'confirmed' | 'needs-review';
type SortValue = (typeof SORT_OPTIONS)[number]['value'];

function matchesQuery(solution: Solution, query: string): boolean {
  const haystack = [
    solution.name,
    solution.vendor,
    solution.useCase,
    categorize(solution).label,
    solution.navigation,
    solution.country,
    ...(solution.limitations ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
  return haystack.includes(query);
}

function parsePrice(value: string): number {
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
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

function TreeNodeRow({
  node,
  depth,
  selection,
  expanded,
  onToggleExpand,
  onSelect,
}: {
  node: FilterTreeNode;
  depth: number;
  selection: TreeSelection | null;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (node: FilterTreeNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const selected = isSameSelection(selection, toSelection(node));
  const onPath =
    selection?.objectType === node.objectType &&
    (!node.process || selection.process === node.process) &&
    (!node.category || selection.category === node.category);

  return (
    <li>
      <div
        className={cn(
          'group flex min-h-[32px] items-center gap-0.5 rounded-[10px] pr-1.5 transition-colors',
          selected ? 'bg-[#F2F2F2]' : 'hover:bg-[#FAFAFA]',
        )}
        style={{ paddingLeft: `${4 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.id)}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Свернуть «${node.label}»` : `Развернуть «${node.label}»`}
            className="flex size-6 shrink-0 items-center justify-center rounded-[8px] text-[#8E8E93] hover:bg-white hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform duration-150', isOpen && 'rotate-90')}
              strokeWidth={2}
            />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          onClick={() => onSelect(node)}
          aria-pressed={selected}
          className={cn(
            'flex min-w-0 flex-1 items-baseline gap-2 py-1 text-left text-[13.5px] leading-snug',
            selected || onPath ? 'font-semibold text-foreground' : 'font-medium text-[#3A3A3C]',
          )}
        >
          <span className="min-w-0 truncate">{node.label}</span>
          <span className="shrink-0 text-[11px] font-medium tabular text-[#8E8E93]">{node.count}</span>
        </button>
      </div>

      {hasChildren && isOpen ? (
        <ul>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CatalogFilterTree({
  tree,
  selection,
  onSelect,
}: {
  tree: FilterTreeNode[];
  selection: TreeSelection | null;
  onSelect: (next: TreeSelection | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((node) => node.id)));

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const node of tree) next.add(node.id);
      return next;
    });
  }, [tree]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSelect = (node: FilterTreeNode) => {
    const next = toSelection(node);
    if (isSameSelection(selection, next)) {
      // Повторный клик поднимает на уровень выше — как в каталоге одежды.
      if (node.category) onSelect({ objectType: node.objectType, process: node.process });
      else if (node.process) onSelect({ objectType: node.objectType });
      else onSelect(null);
      return;
    }
    onSelect(next);
    if (node.children.length > 0) {
      setExpanded((prev) => new Set(prev).add(node.id));
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selection === null}
        className={cn(
          'flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors',
          selection === null
            ? 'bg-[#F2F2F2] font-semibold text-foreground'
            : 'font-medium text-[#3A3A3C] hover:bg-[#FAFAFA]',
        )}
      >
        Все решения
      </button>
      <ul className="mt-0.5">
        {tree.map((node) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={0}
            selection={selection}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onSelect={handleSelect}
          />
        ))}
      </ul>
    </div>
  );
}

function DetailedFilters({
  open,
  onToggle,
  children,
  activeCount,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  activeCount: number;
}) {
  return (
    <section className="border-t border-[#E5E5EA] pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] px-1 py-1 text-left hover:bg-[#FAFAFA]"
      >
        <span className="text-[13.5px] font-semibold text-foreground">Подробные фильтры</span>
        <span className="flex items-center gap-1.5">
          {activeCount > 0 ? (
            <span className="tabular text-[11px] font-medium text-[#8E8E93]">{activeCount}</span>
          ) : null}
          <ChevronDown
            className={cn(
              'size-4 text-[#8E8E93] transition-transform duration-150',
              open && 'rotate-180',
            )}
            strokeWidth={2}
          />
        </span>
      </button>
      {open ? <div className="mt-1 space-y-3.5 px-1 pb-1">{children}</div> : null}
    </section>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#8E8E93]">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function SolutionRow({
  solution,
  selected,
  previewed,
  onOpenPreview,
  onToggleCompare,
}: {
  solution: Solution;
  selected: boolean;
  previewed: boolean;
  onOpenPreview: () => void;
  onToggleCompare: () => void;
}) {
  const category = categorize(solution);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenPreview}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenPreview();
        }
      }}
      className={cn(
        'cursor-pointer border-b border-[#E5E5EA] px-4 py-3.5 transition-colors last:border-b-0 sm:px-4',
        previewed ? 'bg-[#F2F2F2]' : selected ? 'bg-[#FAFAFA]' : 'hover:bg-[#FAFAFA]',
      )}
      aria-pressed={previewed}
    >
      <div className="flex gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleCompare}
          onClick={(event) => event.stopPropagation()}
          className="mt-1 size-[18px] shrink-0"
          aria-label={
            selected ? `Убрать ${solution.name} из сравнения` : `Добавить ${solution.name} в сравнение`
          }
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-meta-foreground">
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
              <span className="font-medium tabular text-foreground">{solution.payload}</span>
              <span className="ml-1">груз</span>
            </span>
            <span className="text-border" aria-hidden>
              |
            </span>
            <span>
              <span className="font-medium tabular text-foreground">{solution.speed}</span>
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
            {solution.completeness !== undefined ? (
              <>
                <span className="text-border" aria-hidden>
                  |
                </span>
                <span>
                  <span className="font-medium tabular text-foreground">{solution.completeness}%</span>
                  <span className="ml-1">полнота</span>
                </span>
              </>
            ) : null}
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
  const { data: solutions, isLoading } = useSolutions();
  const { comparedIds, toggleCompared } = useWizardStore();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortValue>('name');
  const [treeSelection, setTreeSelection] = useState<TreeSelection | null>(null);
  const [activeMaturity, setActiveMaturity] = useState<Set<Maturity>>(new Set(ALL_MATURITY));
  const [activeAvailability, setActiveAvailability] = useState<Set<Availability>>(new Set());
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [dataFilter, setDataFilter] = useState<DataFilter>('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const rows = useMemo(() => solutions ?? [], [solutions]);
  const filterTree = useMemo(() => buildFilterTree(rows), [rows]);

  const toggleMaturity = (id: Maturity) =>
    setActiveMaturity((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAvailability = (id: Availability) =>
    setActiveAvailability((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const resetFilters = () => {
    setTreeSelection(null);
    setActiveMaturity(new Set(ALL_MATURITY));
    setActiveAvailability(new Set());
    setOrigin('all');
    setDataFilter('all');
    setPriceMin('');
    setPriceMax('');
  };

  const detailedFilterCount =
    (ALL_MATURITY.length - activeMaturity.size) +
    activeAvailability.size +
    (origin !== 'all' ? 1 : 0) +
    (dataFilter !== 'all' ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0);

  const activeFilterCount = (treeSelection ? 1 : 0) + detailedFilterCount;

  const normalizedQuery = query.trim().toLocaleLowerCase('ru');

  const filteredRows = useMemo(() => {
    const min = priceMin ? parsePrice(priceMin) : undefined;
    const max = priceMax ? parsePrice(priceMax) : undefined;

    return rows.filter((solution) => {
      if (normalizedQuery && !matchesQuery(solution, normalizedQuery)) return false;
      if (!matchesTreeSelection(solution, treeSelection)) return false;
      if (!activeMaturity.has(solution.maturity)) return false;
      if (activeAvailability.size > 0 && !(solution.availability && activeAvailability.has(solution.availability))) {
        return false;
      }
      if (origin === 'ru' && solution.country !== 'Россия') return false;
      if (origin === 'foreign' && (!solution.country || solution.country === 'Россия')) return false;
      if (dataFilter !== 'all' && solution.confidence !== dataFilter) return false;
      const price = parsePrice(solution.price);
      if (min !== undefined && price < min) return false;
      if (max !== undefined && price > max) return false;
      return true;
    });
  }, [
    rows,
    normalizedQuery,
    treeSelection,
    activeMaturity,
    activeAvailability,
    origin,
    dataFilter,
    priceMin,
    priceMax,
  ]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    switch (sort) {
      case 'price-asc':
        return copy.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      case 'price-desc':
        return copy.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
      case 'payload-desc':
        return copy.sort(
          (a, b) =>
            (b.payloadKg ?? parseFloat(b.payload) ?? 0) - (a.payloadKg ?? parseFloat(a.payload) ?? 0),
        );
      case 'completeness-desc':
        return copy.sort((a, b) => (b.completeness ?? 0) - (a.completeness ?? 0));
      case 'name':
      default:
        return copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
  }, [filteredRows, sort]);

  const previewSolution = sortedRows.find((row) => row.id === previewId) ?? null;

  const openPreview = (id: string) => {
    setPreviewId((current) => (current === id ? null : id));
  };

  const filters = (
    <>
      <div className="py-3">
        <h2 className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-[0.04em] text-[#8E8E93]">
          Категории
        </h2>
        {filterTree.length > 0 ? (
          <CatalogFilterTree tree={filterTree} selection={treeSelection} onSelect={setTreeSelection} />
        ) : (
          <p className="px-1 text-[13px] text-muted-foreground">Категории появятся после загрузки</p>
        )}
      </div>

      <DetailedFilters
        open={detailedOpen}
        onToggle={() => setDetailedOpen((value) => !value)}
        activeCount={detailedFilterCount}
      >
        <DetailBlock title="Зрелость">
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
        </DetailBlock>

        <DetailBlock title="Доступность">
          <div className="grid gap-0.5">
            {AVAILABILITY_OPTIONS.map((item) => (
              <FilterCheck
                key={item.id}
                label={item.label}
                checked={activeAvailability.has(item.id)}
                onChange={() => toggleAvailability(item.id)}
              />
            ))}
          </div>
        </DetailBlock>

        <DetailBlock title="Страна происхождения">
          <Select
            aria-label="Страна происхождения"
            value={origin}
            onChange={(event) => setOrigin(event.target.value as OriginFilter)}
            options={[
              { value: 'all', label: 'Любая' },
              { value: 'ru', label: 'Россия' },
              { value: 'foreign', label: 'Зарубежные' },
            ]}
            className="h-9 rounded-[12px] text-[13px]"
          />
        </DetailBlock>

        <DetailBlock title="Данные">
          <Select
            aria-label="Подтверждённость данных"
            value={dataFilter}
            onChange={(event) => setDataFilter(event.target.value as DataFilter)}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'confirmed', label: 'Подтверждены' },
              { value: 'needs-review', label: 'Требуют проверки' },
            ]}
            className="h-9 rounded-[12px] text-[13px]"
          />
        </DetailBlock>

        <DetailBlock title="Цена, млн ₽">
          <div className="flex items-center gap-2">
            <Input
              value={priceMin}
              onChange={(event) => setPriceMin(event.target.value)}
              placeholder="от"
              inputMode="decimal"
              className="h-9 rounded-[12px] text-[13px]"
              aria-label="Цена от"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              value={priceMax}
              onChange={(event) => setPriceMax(event.target.value)}
              placeholder="до"
              inputMode="decimal"
              className="h-9 rounded-[12px] text-[13px]"
              aria-label="Цена до"
            />
          </div>
        </DetailBlock>
      </DetailedFilters>

      {activeFilterCount > 0 ? (
        <button
          type="button"
          onClick={resetFilters}
          className="mt-3 px-1 text-[13px] font-medium text-foreground hover:underline"
        >
          Сбросить фильтры
        </button>
      ) : null}
    </>
  );

  return (
    <AppShell>
      <h1 className="sr-only">Каталог решений</h1>
      <div className={cn('mt-5', comparedIds.length > 0 && 'pb-20')}>
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_auto] lg:gap-5 xl:grid-cols-[260px_minmax(0,1fr)_auto]">
          <aside className="hidden lg:block">
            <div className={cn(catalogPanelClass, 'sticky top-[4.5rem] px-3 py-1')}>{filters}</div>
          </aside>

          <div className="min-w-0">
            <div className={cn(catalogPanelClass, 'overflow-hidden')}>
              <div className="flex flex-col gap-3 border-b border-[#E5E5EA] px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
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
                    className="inline-flex items-center gap-1.5 rounded-[12px] border border-transparent px-2.5 py-1.5 text-[12.5px] font-medium text-foreground hover:border-[#E5E5EA] hover:bg-[#FAFAFA] lg:hidden"
                    onClick={() => setMobileFiltersOpen(true)}
                  >
                    <SlidersHorizontal className="size-3.5" strokeWidth={2} aria-hidden />
                    Фильтры
                    {activeFilterCount > 0 ? (
                      <span className="tabular text-[11px] text-meta-foreground">{activeFilterCount}</span>
                    ) : null}
                  </button>

                  {!isLoading ? (
                    <span className="hidden tabular text-[12px] text-meta-foreground sm:inline">
                      {sortedRows.length} из {rows.length}
                    </span>
                  ) : null}

                  <Select
                    aria-label="Сортировка"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortValue)}
                    options={[...SORT_OPTIONS]}
                    className="h-9 w-[168px] rounded-[12px] text-[12.5px]"
                  />
                </div>
              </div>

              {!isLoading ? (
                <div className="border-b border-[#E5E5EA] bg-[#FAFAFA] px-4 py-2 text-[12.5px] text-muted-foreground sm:hidden">
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
                    Для выбранных фильтров в каталоге пока нет позиций.
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
                    previewed={previewId === solution.id}
                    onOpenPreview={() => openPreview(solution.id)}
                    onToggleCompare={() => toggleCompared(solution.id)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="hidden min-w-0 lg:block">
            <CatalogPreview
              solution={previewSolution}
              open={Boolean(previewId)}
              compared={previewId ? comparedIds.includes(previewId) : false}
              onClose={() => setPreviewId(null)}
              onToggleCompare={() => {
                if (previewId) toggleCompared(previewId);
              }}
            />
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <div
          className={cn(
            'fixed bottom-3 right-3 top-[calc(3.5rem+0.75rem)] z-40 w-[min(100vw-1.5rem,360px)] transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
            previewId
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-[calc(100%+0.75rem)] opacity-0',
          )}
        >
          <CatalogPreview
            solution={previewSolution}
            open={Boolean(previewId)}
            compared={previewId ? comparedIds.includes(previewId) : false}
            onClose={() => setPreviewId(null)}
            onToggleCompare={() => {
              if (previewId) toggleCompared(previewId);
            }}
            embedded
          />
        </div>
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/30"
            aria-label="Закрыть фильтры"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div
            className={cn(
              catalogPanelClass,
              'absolute inset-y-3 left-3 flex w-[min(100%-1.5rem,320px)] flex-col overflow-hidden',
            )}
          >
            <div className="flex items-center justify-between border-b border-[#E5E5EA] px-3.5 py-3">
              <span className="font-heading text-[16px] font-semibold">Фильтры</span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-[12px] p-2 text-muted-foreground hover:bg-[#F2F2F2] hover:text-foreground"
                aria-label="Закрыть"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-1">{filters}</div>
            <div className="border-t border-[#E5E5EA] p-3.5">
              <Button className="w-full rounded-[12px]" onClick={() => setMobileFiltersOpen(false)}>
                Показать {sortedRows.length}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {comparedIds.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-[18px] pb-[18px]">
          <div className={cn(catalogPanelClass, 'pointer-events-auto flex items-center gap-4 px-5 py-3')}>
            <span className="text-[13.5px] font-medium">
              К сравнению: <span className="tabular">{comparedIds.length}</span>
            </span>
            <Button asChild size="sm" className="rounded-[12px]">
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
