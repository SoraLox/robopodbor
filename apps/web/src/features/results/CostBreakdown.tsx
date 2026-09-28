import { ShieldCheck, TriangleAlert } from 'lucide-react';
import type { CostGroup } from '@/api/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn, fmt } from '@/lib/utils';

const GROUP_COLOR = ['bg-[#2F86F0]', 'bg-[#8E8E93]', 'bg-[#C7C7CC]'];
const GROUP_DOT = ['bg-[#2F86F0]', 'bg-[#8E8E93]', 'bg-[#C7C7CC]'];

export type CostZone = 'vacuum' | 'arm' | 'all';

function guessZone(title: string): CostZone {
  const normalized = title.toLowerCase();
  if (/сортиров|роборук|манипулятор/.test(normalized)) return 'arm';
  if (/amr|паллетовоз|wcs|заряд|вилочн|транспорт/.test(normalized)) return 'vacuum';
  return 'all';
}

/**
 * Структура затрат: сверху пропорция (видно без чисел), ниже группы.
 * Внутри — строки label | сумма | источник. Без вложенных карточек.
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
      <div className="flex h-2 overflow-hidden rounded-full bg-[#F2F2F2]" role="presentation">
        {groups.map((group, index) => (
          <div
            key={group.id}
            className={GROUP_COLOR[index % GROUP_COLOR.length]}
            style={{ width: `${group.share}%` }}
            title={`${group.title}: ${group.share}%`}
          />
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {groups.map((group, index) => (
          <div key={group.id} className="flex items-center gap-1.5 text-[12px]">
            <span
              className={cn('size-2 rounded-full', GROUP_DOT[index % GROUP_DOT.length])}
              aria-hidden
            />
            <span className="text-[#8E8E93]">{group.title}</span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                index === 0 ? 'text-[#2F86F0]' : 'text-foreground',
              )}
            >
              {group.share}%
            </span>
          </div>
        ))}
      </div>

      <Accordion
        type="multiple"
        defaultValue={groups.map((group) => group.id)}
        className="mt-3 grid gap-1"
      >
        {groups.map((group) => (
          <AccordionItem key={group.id} value={group.id} className="border-0">
            <AccordionTrigger className="group rounded-[12px] border border-transparent px-2.5 py-2 transition-colors duration-100 hover:border-[#E5E5EA] hover:bg-[#FAFAFA]">
              <div className="flex w-full items-baseline gap-3">
                <span className="min-w-0 flex-1 text-left text-[13px] font-medium text-foreground">
                  {group.title}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {fmt(group.amount)} млн ₽
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="mx-1 mb-1 divide-y divide-[#F2F2F2]">
                {group.lines.map((line) => {
                  const confirmed = line.confidence === 'confirmed';
                  return (
                    <li
                      key={line.title}
                      onMouseEnter={() => onHoverLine?.(guessZone(line.title))}
                      onMouseLeave={() => onHoverLine?.(null)}
                      className={cn(
                        'flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-[13px]',
                        onHoverLine ? 'rounded-[8px] px-1.5 hover:bg-[#FAFAFA]' : 'px-1.5',
                      )}
                    >
                      <span className="min-w-0 flex-1 text-foreground/90">{line.title}</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {fmt(line.amount)}
                        <span className="ml-1 font-normal text-[#8E8E93]">· {line.share}%</span>
                      </span>
                      <span
                        className={cn(
                          'inline-flex w-full items-center gap-1 text-[11.5px] font-medium sm:w-auto',
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
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-2 flex items-baseline justify-between rounded-[12px] bg-[#F5F9FF] px-2.5 py-2.5">
        <span className="text-[12.5px] font-medium text-[#5B8FCE]">Итого за 7 лет</span>
        <span className="text-[16px] font-semibold tabular-nums text-[#2F86F0]">
          {fmt(total)} млн ₽
        </span>
      </div>
    </div>
  );
}
