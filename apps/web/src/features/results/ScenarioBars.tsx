import type { ScenarioBar } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Три горизонтальные полосы сравнения сценариев. Рекомендуемый сценарий
 * выделен оранжевой заливкой и более высокой полосой.
 */
export function ScenarioBars({ scenarios }: { scenarios: ScenarioBar[] }) {
  return (
    <div className="grid gap-3">
      {scenarios.map((scenario) => {
        const isRecommended = Boolean(scenario.recommended);
        const isBase = scenario.share >= 1;

        return (
          <div
            key={scenario.id}
            className="grid items-center gap-3.5"
            style={{ gridTemplateColumns: '158px minmax(0, 1fr) 84px' }}
          >
            <div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'text-[13px]',
                    isRecommended ? 'font-bold' : 'font-semibold',
                  )}
                >
                  {scenario.title}
                </div>
                {isRecommended ? (
                  <div className="bg-primary px-1.5 py-0.5 text-[8px] font-bold tracking-[0.12em] text-primary-foreground">
                    РЕКОМЕНДУЕМ
                  </div>
                ) : null}
              </div>
              <div className="mt-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {scenario.subtitle}
              </div>
            </div>

            <div
              className={cn(
                'relative',
                isRecommended ? 'h-[42px] border-b border-hairline' : 'h-[30px]',
              )}
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-0 flex items-center px-3',
                  isRecommended && 'bg-primary',
                  !isRecommended && isBase && 'bg-border',
                  !isRecommended && !isBase && 'border-l-[3px] border-l-muted-foreground bg-hairline',
                )}
                style={{ width: `${Math.min(scenario.share, 1) * 100}%` }}
              >
                {isRecommended ? (
                  <span className="font-heading text-[17px] font-bold tabular tracking-[-0.02em] text-primary-foreground">
                    {scenario.tco.toFixed(1)}
                  </span>
                ) : (
                  <span className="truncate text-xs font-semibold tabular text-foreground/80">
                    {scenario.detail ?? scenario.tco.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            <div
              className={cn(
                'text-right tabular',
                isRecommended
                  ? 'font-heading text-base font-bold text-primary'
                  : isBase
                    ? 'meta-label'
                    : 'text-xs text-muted-foreground',
              )}
            >
              {scenario.delta}
            </div>
          </div>
        );
      })}
    </div>
  );
}
