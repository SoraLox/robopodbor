import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SensitivityFactor } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Что сильнее всего может изменить срок окупаемости. Ранжировано по силе
 * влияния — самый важный параметр всегда сверху и залит акцентом.
 *
 * `onHoverFactor` — наведение на строку сообщает наружу силу влияния
 * (0..1): симуляция рядом на неё пропорционально «дышит» (см. ResultsPage).
 */
export function SensitivityPanel({
  factors,
  onHoverFactor,
}: {
  factors: SensitivityFactor[];
  onHoverFactor?: (impact: number | null) => void;
}) {
  const max = Math.max(...factors.map((factor) => factor.impact), 0.01);

  return (
    <ul className="grid gap-4">
      {factors.map((factor, index) => {
        const Icon = factor.direction === 'up' ? ArrowUp : ArrowDown;
        return (
          <li
            key={factor.id}
            className="grid gap-2 rounded-lg p-1.5 transition-colors"
            onMouseEnter={() => onHoverFactor?.(factor.impact)}
            onMouseLeave={() => onHoverFactor?.(null)}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[14px] font-medium">{factor.label}</span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium tabular text-muted-foreground">
                <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                меняет срок на {Math.round(factor.impact * 100)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-hairline">
              <div
                className={cn('h-full rounded-full', index === 0 ? 'bg-primary' : 'bg-chart-2')}
                style={{ width: `${(factor.impact / max) * 100}%` }}
              />
            </div>
            {factor.low && factor.high ? (
              <div className="flex justify-between text-[12px] text-meta-foreground">
                <span>Оптимистично: {factor.low}</span>
                <span>Осторожно: {factor.high}</span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
