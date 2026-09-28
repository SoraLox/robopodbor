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
import { matchesSearch } from './catalogSearch';
import { RobotCard, RobotCardSkeleton } from './RobotCard';
import {
  buildFilterTree,
  isSameSelection,
  matchesTreeSelection,
  toSelection,
  WHOLE_CATALOG,
  type FilterTreeNode,
  type TreeSelection,
} from './catalogFilterTree';

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
  // Объекты раскрыты сразу; «весь каталог» — 29 категорий — свёрнут, чтобы не растягивать колонку.
  const openByDefault = (nodes: FilterTreeNode[]) =>
    nodes.filter((node) => node.id !== WHOLE_CATALOG).map((node) => node.id);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(openByDefault(tree)));

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of openByDefault(tree)) next.add(id);
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

  // Фильтр показываем, только если в каталоге есть что различать: иначе любой
  // выбор либо ничего не меняет, либо прячет весь каталог.
  const hasAvailability = rows.some((solution) => solution.availability);
  const confidenceVaries = new Set(rows.map((solution) => solution.confidence)).size > 1;

  const filteredRows = useMemo(() => {
    const min = priceMin ? parsePrice(priceMin) : undefined;
    const max = priceMax ? parsePrice(priceMax) : undefined;

    return rows.filter((solution) => {
      if (!matchesSearch(solution, query)) return false;
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
    query,
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

        {hasAvailability ? (
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
        ) : null}

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

        {confidenceVaries ? (
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
        ) : null}

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
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className={cn(catalogPanelClass, 'sticky top-[4.5rem] px-3 py-1')}>{filters}</div>
          </aside>

          <div className="min-w-0">
            <div className={cn(catalogPanelClass, 'overflow-hidden')}>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <Search className="size-[17px] flex-none text-muted-foreground" strokeWidth={2} aria-hidden />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Название, вендор или задача"
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
            </div>

            {!isLoading ? (
              <div className="mt-3 text-[12.5px] text-muted-foreground sm:hidden">
                {sortedRows.length} из {rows.length}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <RobotCardSkeleton key={key} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className={cn(catalogPanelClass, 'mt-4 px-5 py-16 text-center')}>
                <h2 className="font-heading text-[17px] font-semibold">Пока нет решений</h2>
                <p className="mx-auto mt-2 max-w-[38ch] text-[13.5px] text-muted-foreground">
                  Для выбранных фильтров в каталоге пока нет позиций.
                </p>
              </div>
            ) : sortedRows.length === 0 ? (
              <div className={cn(catalogPanelClass, 'mt-4 flex flex-col items-center gap-3 px-5 py-16 text-center')}>
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
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sortedRows.map((solution) => (
                  <RobotCard
                    key={solution.id}
                    solution={solution}
                    selected={comparedIds.includes(solution.id)}
                    previewed={previewId === solution.id}
                    onOpenPreview={() => openPreview(solution.id)}
                    onToggleCompare={() => toggleCompared(solution.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CatalogPreview
        solution={previewSolution}
        open={Boolean(previewId)}
        compared={previewId ? comparedIds.includes(previewId) : false}
        onClose={() => setPreviewId(null)}
        onToggleCompare={() => {
          if (previewId) toggleCompared(previewId);
        }}
      />

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
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-5 pb-5 sm:px-8">
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
