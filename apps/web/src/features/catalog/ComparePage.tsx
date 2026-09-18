import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { SectionHeading, StatusBadge } from '@/shared/components';
import type { Maturity } from '@/api/types';

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

/** Построчные характеристики: таблица разворачивается по колонке на решение. */
const ROWS = [
  { key: 'vendor', label: 'Вендор' },
  { key: 'useCase', label: 'Применение' },
  { key: 'price', label: 'Цена, млн ₽' },
  { key: 'payload', label: 'Грузоподъёмность' },
  { key: 'speed', label: 'Скорость' },
  { key: 'maturity', label: 'Зрелость' },
  { key: 'confidence', label: 'Данные' },
] as const;

export function ComparePage() {
  const { data: solutions } = useSolutions();
  const { comparedIds } = useWizardStore();

  const picked = (solutions ?? []).filter((solution) => comparedIds.includes(solution.id));

  return (
    <AppShell>
      <div className="flex flex-wrap items-stretch border-b border-border">
        <div className="flex flex-col justify-center px-5 py-3.5">
          <h1 className="font-heading text-[22px] font-bold uppercase leading-none tracking-h1">
            Сравнение решений
          </h1>
          <div className="mt-1.5 meta-label">
            ОТОБРАНО ПОЗИЦИЙ: {picked.length} · ХАРАКТЕРИСТИКИ ПОСТРОЧНО
          </div>
        </div>
        <div className="ml-auto flex items-stretch">
          <Button asChild variant="ghost" className="border-l border-border px-5 py-3.5">
            <Link to="/catalog">Вернуться в каталог</Link>
          </Button>
          <Button asChild className="px-5 py-3.5">
            <Link to="/calculate/warehouse/results/demo">
              Добавить в расчёт
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          </Button>
        </div>
      </div>

      {picked.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <SectionHeading size="h2" className="justify-center">
            Ничего не выбрано
          </SectionHeading>
          <p className="mt-3 text-xs text-muted-foreground">
            Отметьте решения чекбоксами в каталоге — они появятся здесь.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="min-w-[680px]"
            style={{
              display: 'grid',
              gridTemplateColumns: `180px repeat(${picked.length}, minmax(0, 1fr))`,
            }}
          >
            {/* Шапка: названия решений */}
            <div className="border-b border-border px-4 py-3" />
            {picked.map((solution) => (
              <div
                key={solution.id}
                className="border-b border-l border-border px-4 py-3"
              >
                <div className="text-[13px] font-semibold">{solution.name}</div>
              </div>
            ))}

            {/* Строки характеристик */}
            {ROWS.map((row) => (
              <div key={row.key} className="contents">
                <div className="border-b border-hairline px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {row.label}
                </div>
                {picked.map((solution) => (
                  <div
                    key={solution.id + row.key}
                    className="border-b border-l border-hairline px-4 py-2.5 text-xs"
                  >
                    {row.key === 'maturity' ? (
                      <StatusBadge variant={solution.maturity}>
                        {MATURITY_LABEL[solution.maturity]}
                      </StatusBadge>
                    ) : row.key === 'confidence' ? (
                      <StatusBadge
                        variant={
                          solution.confidence === 'confirmed' ? 'confirmed' : 'needs-review'
                        }
                      />
                    ) : (
                      <span className="tabular">{solution[row.key]}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ComparePage;
