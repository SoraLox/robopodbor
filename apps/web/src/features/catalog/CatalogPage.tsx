import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Info } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  ComparisonTable,
  StatusBadge,
  type ComparisonColumn,
  type ComparisonRow,
} from '@/shared/components';
import type { Maturity } from '@/api/types';
import { CatalogFilters } from './CatalogFilters';

const COLUMNS: ComparisonColumn[] = [
  { key: 'check', header: '', width: '26px' },
  { key: 'rank', header: 'Ранг', width: '92px' },
  { key: 'name', header: 'Решение', width: 'minmax(0, 1.4fr)' },
  { key: 'use', header: 'Применение', width: 'minmax(0, 1.3fr)' },
  { key: 'price', header: 'Цена', width: '76px', align: 'right' },
  { key: 'payload', header: 'Грузопод.', width: '84px', align: 'right' },
  { key: 'speed', header: 'Скор.', width: '66px', align: 'right' },
  { key: 'source', header: 'Источник', width: '168px', align: 'right' },
];

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

const OBJECT_LABEL: Record<string, string> = {
  warehouse: 'склада',
  airport: 'аэропорта',
  clinic: 'медучреждения',
};

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const objectType = searchParams.get('objectType') ?? 'warehouse';
  const { data: solutions, isLoading } = useSolutions(objectType);
  const { comparedIds, toggleCompared } = useWizardStore();

  const rows: ComparisonRow[] = (solutions ?? []).map((solution) => {
    const checked = comparedIds.includes(solution.id);

    return {
      id: solution.id,
      selected: checked,
      onClick: () => toggleCompared(solution.id),
      cells: {
        rank: (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5">
              <span className="text-[13px] font-semibold tabular">{solution.score ?? '—'}</span>
              <Info className="size-3 text-muted-foreground group-open:text-primary" strokeWidth={1.8} />
            </summary>
            <ul className="mt-1.5 grid gap-1">
              {solution.scoreFactors?.map((factor) => (
                <li key={factor.label} className="text-[10px] leading-tight text-muted-foreground">
                  {factor.label} · +{factor.weight}
                </li>
              ))}
            </ul>
          </details>
        ),
        check: (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggleCompared(solution.id)}
              aria-label={`Сравнить ${solution.name}`}
            />
          </div>
        ),
        name: (
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Фото-заглушка 38×28, штриховка как в макете */}
            <div
              className="h-7 w-[38px] flex-none border border-border"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, #F4F4F2 0 4px, #EBEBE8 4px 8px)',
              }}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{solution.name}</div>
              <div className="mt-[3px] font-mono text-[9px] uppercase text-meta-foreground">
                {solution.vendor}
              </div>
            </div>
          </div>
        ),
        use: (
          <div className="min-w-0">
            <div className="truncate text-[11.5px] text-muted-foreground">
              {solution.useCase}
            </div>
            <div className="mt-[5px]">
              <StatusBadge variant={solution.maturity}>
                {MATURITY_LABEL[solution.maturity]}
              </StatusBadge>
            </div>
          </div>
        ),
        price: <span className="text-[13px] font-semibold tabular">{solution.price}</span>,
        payload: <span className="text-xs tabular text-foreground/80">{solution.payload}</span>,
        speed: <span className="text-xs tabular text-foreground/80">{solution.speed}</span>,
        source: (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge
              variant={solution.confidence === 'confirmed' ? 'confirmed' : 'needs-review'}
            />
            <span className="text-[10px] leading-tight text-meta-foreground">
              {solution.source ?? '—'}
              {solution.sourceDate ? ` · ${solution.sourceDate}` : ''}
            </span>
          </div>
        ),
      },
    };
  });

  return (
    <AppShell>
      <div className="flex flex-wrap items-stretch border-b border-border">
        <div className="flex flex-col justify-center px-5 py-3.5">
          <h1 className="font-heading text-[22px] font-bold uppercase leading-none tracking-h1">
            Каталог решений
          </h1>
          <div className="mt-1.5 meta-label">
            Подходит для {OBJECT_LABEL[objectType] ?? 'объекта'} · отобрано {rows.length} ·
            сортировка по баллу ранжирования
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(OBJECT_LABEL).map(([slug, label]) => (
              <button
                key={slug}
                type="button"
                onClick={() => setSearchParams({ objectType: slug })}
                className={
                  slug === objectType
                    ? 'rounded-md border border-primary bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-primary-hover'
                    : 'rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-foreground'
                }
              >
                Для {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-stretch">
          <div className="flex min-w-[190px] items-center border-l border-border px-4">
            <Input
              placeholder="Поиск по модели или вендору"
              className="border-0 px-0 text-[11px] focus-visible:ring-0"
            />
          </div>
          <Button asChild className="px-5 py-3.5">
            <Link to="/catalog/compare">
              Сравнить ({comparedIds.length})
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[196px_minmax(0,1fr)]">
        <CatalogFilters />

        <div>
          {isLoading ? (
            <div className="p-5">
              <div className="h-[280px] animate-pulse rounded-lg bg-muted" />
            </div>
          ) : (
            <ComparisonTable columns={COLUMNS} rows={rows} />
          )}

          <div className="flex flex-wrap items-stretch border-t border-border">
            <div className="flex flex-col justify-center px-4 py-3.5">
              <div className="micro-label">
                Выбрано для сравнения: {comparedIds.length}
              </div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Сравнение покажет TCO, окупаемость и требования к инфраструктуре построчно
              </div>
            </div>
            <div className="ml-auto flex items-stretch">
              <Button variant="ghost" className="border-l border-border px-[18px] py-3.5">
                Добавить в расчёт
              </Button>
              <Button asChild className="px-5 py-3.5">
                <Link to="/catalog/compare">
                  Открыть сравнение
                  <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default CatalogPage;
