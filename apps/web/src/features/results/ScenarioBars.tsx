import type { ComponentType } from 'react';
import { CircleCheck, PackageSearch, Repeat, ShoppingBag } from 'lucide-react';
import type { ScenarioBar } from '@/api/types';
import { cn, fmt } from '@/lib/utils';

const ICON: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  'as-is': PackageSearch,
  purchase: ShoppingBag,
  raas: Repeat,
};

/**
 * Сравнение: одна шкала на всех — длиннее полоса = дороже.
 * Рекомендуемый вариант — синий акцент (рамка, бейдж, полоса).
 */
export function ScenarioBars({
  scenarios,
  onHoverScenario,
}: {
  scenarios: ScenarioBar[];
  onHoverScenario?: (id: string | null) => void;
}) {
  const max = Math.max(...scenarios.map((scenario) => scenario.tco), 1);

  return (
    <ul className="grid gap-1">
      {scenarios.map((scenario) => {
        const isRecommended = Boolean(scenario.recommended);
        const isBase = scenario.delta === 'база';
        const Icon = ICON[scenario.id] ?? PackageSearch;

        return (
          <li
            key={scenario.id}
            onMouseEnter={() => onHoverScenario?.(scenario.id)}
            onMouseLeave={() => onHoverScenario?.(null)}
            className={cn(
              'rounded-[12px] border px-2.5 py-2.5 transition-colors duration-100',
              isRecommended
                ? 'border-[#2F86F0]/60 bg-[#F5F9FF]'
                : 'border-transparent hover:border-[#E5E5EA] hover:bg-[#FAFAFA]',
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 grid size-7 flex-none place-items-center rounded-[8px]',
                  isRecommended ? 'bg-[#2F86F0] text-white' : 'bg-[#F2F2F2] text-foreground',
                )}
                aria-hidden
              >
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-foreground">{scenario.title}</span>
                  {isRecommended ? (
                    <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#2F86F0]/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#2F86F0]">
                      <CircleCheck className="size-3" strokeWidth={2.25} aria-hidden />
                      Рекомендуем
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-[#8E8E93]">
                  {scenario.subtitle}
                  {scenario.detail ? ` · ${scenario.detail}` : ''}
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#F2F2F2]">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        isRecommended ? 'bg-[#2F86F0]' : 'bg-[#C7C7CC]',
                      )}
                      style={{ width: `${(scenario.tco / max) * 100}%` }}
                    />
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[15px] font-semibold tabular-nums leading-none text-foreground">
                      {fmt(scenario.tco)}
                      <span className="ml-1 text-[11.5px] font-medium text-[#8E8E93]">млн ₽</span>
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 text-[11px]',
                        isRecommended && !isBase ? 'font-medium text-[#2F86F0]' : 'text-[#8E8E93]',
                      )}
                    >
                      {isBase ? 'точка отсчёта' : `экономия ${scenario.delta.replace('−', '')}`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
