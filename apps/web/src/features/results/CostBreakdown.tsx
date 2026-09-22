import { ChevronDown, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { CostGroup } from '@/api/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn, fmt } from '@/lib/utils';

const GROUP_COLOR = ['bg-primary', 'bg-chart-2', 'bg-chart-3'];

export type CostZone = 'vacuum' | 'arm' | 'all';

/**
 * Демо-сцена рядом моделирует два условных процесса (транспорт/уборка и
 * сортировка), а статьи затрат в расчёте — конкретное железо. Прямого
 * соответствия нет (см. WarehouseSimulation.tsx), поэтому наводимся по
 * смыслу: подвижная техника подсвечивает зону уборки, сортировка — зону
 * роборук, системные/трудовые статьи — площадку целиком.
 */
function guessZone(title: string): CostZone {
  const normalized = title.toLowerCase();
  if (/сортиров|роборук|манипулятор/.test(normalized)) return 'arm';
  if (/amr|паллетовоз|wcs|заряд|вилочн|транспорт/.test(normalized)) return 'vacuum';
  return 'all';
}

/**
 * Из чего складывается сумма: сверху одна полоса-пропорция (сколько это —
 * видно сразу, без чтения чисел), ниже — раскрывающиеся группы со статьями.
 * Группы открыты по умолчанию: ничего не прячем, пока не спросили.
 *
 * `onHoverLine` — наведение на статью зажигает прожектор над нужной зоной
 * в симуляции рядом (см. ResultsPage.tsx).
 */
export function CostBreakdown({
  groups,
  total,
  onHoverLine,
}: {
  groups: CostGroup[];
  total: number;
  onHoverLine?: (zone: CostZone | null) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-hairline" role="presentation">
        {groups.map((group, index) => (
          <div
            key={group.id}
            className={GROUP_COLOR[index % GROUP_COLOR.length]}
            style={{ width: `${group.share}%` }}
          />
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1.5">
        {groups.map((group, index) => (
          <div key={group.id} className="flex items-center gap-2 text-[13px]">
            <span
              className={cn('size-2.5 rounded-full', GROUP_COLOR[index % GROUP_COLOR.length])}
              aria-hidden
            />
            <span className="text-muted-foreground">{group.title}</span>
            <span className="font-semibold tabular">{group.share}%</span>
          </div>
        ))}
      </div>

      <Accordion
        type="multiple"
        defaultValue={groups.map((group) => group.id)}
        className="grid gap-2.5"
      >
        {groups.map((group) => (
          <AccordionItem
            key={group.id}
            value={group.id}
            className="overflow-hidden rounded-xl border border-border"
          >
            <AccordionTrigger className="group">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <ChevronDown
                  className="size-4 flex-none text-meta-foreground transition-transform group-data-[state=open]:rotate-180"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-[14px] font-semibold">{group.title}</span>
                <span className="ml-auto text-[15px] font-semibold tabular">
                  {fmt(group.amount)} млн ₽
                </span>
              </div>
            </AccordionTrigger>

            <AccordionContent>
              <div className="divide-y divide-hairline border-t border-hairline">
                {group.lines.map((line) => {
                  const confirmed = line.confidence === 'confirmed';
                  return (
                    <div
                      key={line.title}
                      onMouseEnter={() => onHoverLine?.(guessZone(line.title))}
                      onMouseLeave={() => onHoverLine?.(null)}
                      className={cn(
                        'grid gap-1.5 py-3 pl-11 pr-4 text-[13px] sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5',
                        onHoverLine ? 'transition-colors hover:bg-accent-tint/60' : '',
                      )}
                    >
                      <span className="min-w-0 text-foreground/85 sm:flex-1">{line.title}</span>
                      <div className="flex items-center justify-between gap-3 sm:contents">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[11.5px] font-medium sm:order-3',
                            confirmed ? 'text-status-confirmed' : 'text-status-piloting',
                          )}
                        >
                          {confirmed ? (
                            <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden />
                          ) : (
                            <TriangleAlert className="size-3.5" strokeWidth={2} aria-hidden />
                          )}
                          {line.source}
                        </span>
                        <span className="tabular font-medium sm:order-1">
                          {fmt(line.amount)} млн ₽
                          <span className="ml-1.5 text-muted-foreground sm:ml-0 sm:hidden">
                            · {line.share}%
                          </span>
                        </span>
                        <span className="hidden w-9 text-right tabular text-muted-foreground sm:order-2 sm:inline">
                          {line.share}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-accent-tint px-4 py-3.5">
        <span className="text-[13px] font-medium text-primary">Итого за 7 лет</span>
        <span className="text-[20px] font-bold tabular text-primary">{fmt(total)} млн ₽</span>
      </div>
    </div>
  );
}
