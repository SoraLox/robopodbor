import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ObjectParameterGroup } from './objectParameters';

/**
 * Ключевые вводные видны сразу (карточки), весь остальной список параметров —
 * по клику «Показать все параметры», сгруппированный как в исходном
 * датасете.
 */
export function ObjectParametersList({ groups }: { groups: ObjectParameterGroup[] }) {
  const [expanded, setExpanded] = useState(false);

  const primaryItems = useMemo(
    () => groups.flatMap((group) => group.items.filter((item) => item.primary)),
    [groups],
  );
  const totalCount = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);

  return (
    <div className="mt-4">
      {primaryItems.length ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {primaryItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-background p-3">
              <div className="text-[11.5px] leading-snug text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-[16px] font-semibold tabular">
                {item.value}
                {item.unit ? <span className="ml-1 text-[12px] font-normal text-muted-foreground">{item.unit}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
      >
        {expanded ? 'Скрыть остальные вводные' : `Показать все вводные (${totalCount})`}
        <ChevronDown
          className={cn('size-3.5 transition-transform', expanded ? 'rotate-180' : '')}
          strokeWidth={2.2}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="mt-3 divide-y divide-hairline border-t border-hairline">
          {groups.map((group) => (
            <ParameterGroup key={group.title} group={group} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ParameterGroup({ group }: { group: ObjectParameterGroup }) {
  return (
    <div className="py-3">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {group.title}
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {group.items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-3 text-[13px]">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="whitespace-nowrap font-medium tabular">
              {item.value}
              {item.unit ? <span className="ml-1 font-normal text-muted-foreground">{item.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default ObjectParametersList;
