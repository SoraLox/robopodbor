import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SensitivityFactor } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Анализ чувствительности: параметры, ранжированные по влиянию на срок
 * окупаемости. Длина полосы — доля влияния, подписи по краям — результат
 * на нижней и верхней границе параметра.
 */
export function SensitivityPanel({ factors }: { factors: SensitivityFactor[] }) {
  const max = Math.max(...factors.map((f) => f.impact), 0.01);

  return (
    <ul className="grid gap-3">
      {factors.map((factor, index) => {
        const Icon = factor.direction === 'up' ? ArrowUp : ArrowDown;
        return (
          <li key={factor.id} className="grid gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px]">{factor.label}</span>
              <span className="ml-auto flex items-center gap-1 text-[12px] font-medium tabular">
                <Icon className="size-3 text-muted-foreground" strokeWidth={2} aria-hidden />
                {Math.round(factor.impact * 100)} %
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-hairline">
              <div
                className={cn('h-full rounded-full', index === 0 ? 'bg-primary' : 'bg-chart-2')}
                style={{ width: `${(factor.impact / max) * 100}%` }}
              />
            </div>
            {factor.low && factor.high ? (
              <div className="flex justify-between text-[11px] text-meta-foreground">
                <span>{factor.low}</span>
                <span>{factor.high}</span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
