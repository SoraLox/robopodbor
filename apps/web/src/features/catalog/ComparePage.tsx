import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useSelection, useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Maturity, SelectionItem } from '@/api/types';
import { OBJECT_LABEL } from '@domain/catalog';
import { provenanceTag, specGroups } from './solutionSpecs';

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

const SELECTION_LABEL: Record<SelectionItem['status'], { label: string; className: string }> = {
  recommended: { label: 'Подходит', className: 'text-status-operation' },
  'needs-review': { label: 'Требует проверки', className: 'text-status-piloting' },
  excluded: { label: 'Не подходит', className: 'text-status-danger' },
};

export function ComparePage() {
  const { data: solutions } = useSolutions();
  const { comparedIds, objectType, parameters } = useWizardStore();
  const { data: selection } = useSelection(objectType, parameters);

  const picked = (solutions ?? []).filter((solution) => comparedIds.includes(solution.id));
  const specs = picked.map((solution) => specGroups(solution));
  const verdicts = picked.map((solution) => selection?.items.find((item) => item.solutionId === solution.id));
  const columns = `200px repeat(${picked.length}, minmax(0, 1fr))`;

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
              gridTemplateColumns: columns,
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

            {objectType && selection ? (
              <>
                <GroupTitle title={`Подбор для объекта «${OBJECT_LABEL[objectType] ?? objectType}»`} />
                <div className="border-b border-hairline px-5 py-3 text-[12px] font-medium text-muted-foreground">
                  Результат
                </div>
                {verdicts.map((item, index) => (
                  <div key={picked[index]!.id} className="border-b border-l border-hairline px-5 py-3 text-[12.5px]">
                    {item ? (
                      <>
                        <span className={cn('font-semibold', SELECTION_LABEL[item.status].className)}>
                          {SELECTION_LABEL[item.status].label}
                          {item.status !== 'excluded' ? ` · ${item.score}` : ''}
                        </span>
                        {item.blockers.length > 0 ? (
                          <p className="mt-1 leading-snug text-muted-foreground">{item.blockers.join('; ')}</p>
                        ) : item.missing.length > 0 ? (
                          <p className="mt-1 leading-snug text-muted-foreground">{item.missing.join('; ')}</p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">не для этого типа объекта</span>
                    )}
                  </div>
                ))}
              </>
            ) : null}

            {specs[0]?.map((group, groupIndex) => (
              <div key={group.title} className="contents">
                <GroupTitle title={group.title} />
                {group.rows.map((row, rowIndex) => (
                  <div key={row.label} className="contents">
                    <div className="border-b border-hairline px-5 py-2.5 text-[12px] font-medium text-muted-foreground">
                      {row.label}
                    </div>
                    {picked.map((solution, index) => {
                      const cell = specs[index]?.[groupIndex]?.rows[rowIndex];
                      return (
                        <div key={solution.id} className="border-b border-l border-hairline px-5 py-2.5 text-[13px]">
                          {cell?.value ?? <span className="text-muted-foreground">нет данных</span>}
                          {cell && (provenanceTag(cell.provenance) ?? (cell.assumption ? 'допущение' : undefined)) ? (
                            <span
                              className="ml-1.5 rounded-sm bg-status-piloting-tint px-1 py-px text-[10.5px] font-medium text-status-piloting"
                              title={cell.provenance?.note}
                            >
                              {provenanceTag(cell.provenance) ?? 'допущение'}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {groupIndex === 0 ? (
                  <div className="contents">
                    <div className="border-b border-hairline px-5 py-2.5 text-[12px] font-medium text-muted-foreground">
                      Зрелость
                    </div>
                    {picked.map((solution) => (
                      <div key={solution.id} className="border-b border-l border-hairline px-5 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[12px] font-medium',
                            MATURITY_TEXT[solution.maturity],
                          )}
                        >
                          <span className={cn('size-1.5 rounded-full', MATURITY_DOT[solution.maturity])} aria-hidden />
                          {MATURITY_LABEL[solution.maturity]}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function GroupTitle({ title }: { title: string }) {
  return (
    <div className="col-span-full border-b border-hairline bg-[#FAFAFA] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {title}
    </div>
  );
}

export default ComparePage;
