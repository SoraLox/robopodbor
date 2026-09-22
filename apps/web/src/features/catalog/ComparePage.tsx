import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Maturity } from '@/api/types';

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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-h1">Сравнение решений</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            Отобрано позиций: {picked.length} · характеристики построчно
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild variant="outline">
            <Link to="/catalog">Вернуться в каталог</Link>
          </Button>
          <Button asChild>
            <Link to="/calculate/warehouse/results/demo">
              Добавить в расчёт
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          </Button>
        </div>
      </div>

      {picked.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-16 text-center">
          <h2 className="font-heading text-[17px] font-semibold">Ничего не выбрано</h2>
          <p className="max-w-[38ch] text-[13.5px] text-muted-foreground">
            Отметьте решения в каталоге — они появятся здесь для построчного сравнения.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <div
            className="min-w-[680px]"
            style={{
              display: 'grid',
              gridTemplateColumns: `180px repeat(${picked.length}, minmax(0, 1fr))`,
            }}
          >
            {/* Шапка: названия решений */}
            <div className="border-b border-border px-5 py-4" />
            {picked.map((solution) => (
              <div key={solution.id} className="border-b border-l border-hairline px-5 py-4">
                <div className="text-[13.5px] font-semibold">{solution.name}</div>
                <div className="mt-0.5 meta-label uppercase">{solution.vendor}</div>
              </div>
            ))}

            {/* Строки характеристик */}
            {ROWS.map((row, rowIndex) => (
              <div key={row.key} className="contents">
                <div
                  className={cn(
                    'px-5 py-3 text-[12px] font-medium text-muted-foreground',
                    rowIndex < ROWS.length - 1 && 'border-b border-hairline',
                  )}
                >
                  {row.label}
                </div>
                {picked.map((solution) => (
                  <div
                    key={solution.id + row.key}
                    className={cn(
                      'border-l border-hairline px-5 py-3 text-[13px]',
                      rowIndex < ROWS.length - 1 && 'border-b',
                    )}
                  >
                    {row.key === 'maturity' ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[12px] font-medium',
                          MATURITY_TEXT[solution.maturity],
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', MATURITY_DOT[solution.maturity])} aria-hidden />
                        {MATURITY_LABEL[solution.maturity]}
                      </span>
                    ) : row.key === 'confidence' ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[12px] font-medium',
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
                    ) : (
                      <span className="font-mono tabular">{solution[row.key]}</span>
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
