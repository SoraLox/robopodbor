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
 * Три варианта один под другим: одинаковая шкала (100% — самый дорогой),
 * поэтому «кто дороже» видно по длине полосы без чтения чисел.
 * Рекомендуемый вариант выделен рамкой, заливкой и словом «Рекомендуем».
 *
 * `onHoverScenario` — для «живого спутника» отчёта: наведение на строку
 * сообщает наружу id сценария, симуляция рядом отражает разницу физически.
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
    <div className="grid gap-3">
      {scenarios.map((scenario) => {
        const isRecommended = Boolean(scenario.recommended);
        const isBase = scenario.delta === 'база';
        const Icon = ICON[scenario.id] ?? PackageSearch;

        return (
          <div
            key={scenario.id}
            onMouseEnter={() => onHoverScenario?.(scenario.id)}
            onMouseLeave={() => onHoverScenario?.(null)}
            className={cn(
              'grid gap-3 rounded-xl border p-4 transition-shadow sm:grid-cols-[minmax(0,232px)_minmax(0,1fr)_128px] sm:items-center sm:gap-5',
              isRecommended ? 'border-primary/70 bg-accent-tint/50' : 'border-border',
              onHoverScenario ? 'hover:shadow-soft' : '',
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'grid size-9 flex-none place-items-center rounded-lg',
                  isRecommended ? 'bg-primary text-primary-foreground' : 'bg-canvas text-muted-foreground',
                )}
                aria-hidden
              >
                <Icon className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[14px] font-semibold">{scenario.title}</span>
                  {isRecommended ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary-foreground">
                      <CircleCheck className="size-3" strokeWidth={2.5} aria-hidden />
                      Рекомендуем
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">{scenario.subtitle}</div>
                {scenario.detail ? (
                  <div className="mt-1 text-[11.5px] leading-snug text-meta-foreground">
                    {scenario.detail}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="relative h-2.5 overflow-hidden rounded-full bg-hairline">
              <div
                className={cn('h-full rounded-full', isRecommended ? 'bg-primary' : 'bg-border')}
                style={{ width: `${(scenario.tco / max) * 100}%` }}
              />
            </div>

            <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-end sm:justify-start sm:gap-0.5">
              <span
                className={cn(
                  'font-heading text-[19px] font-bold tabular',
                  isRecommended ? 'text-primary' : 'text-foreground',
                )}
              >
                {fmt(scenario.tco)}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {isBase ? 'млн ₽ · точка отсчёта' : `экономия ${scenario.delta.replace('−', '')} млн ₽`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
