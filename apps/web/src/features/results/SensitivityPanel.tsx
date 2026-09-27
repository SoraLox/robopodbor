import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SensitivityFactor } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Чувствительность: ранжированный список.
 * Длина полосы = сила влияния на срок окупаемости.
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
    <ul className="grid gap-1">
      {factors.map((factor, index) => {
        const Icon = factor.direction === 'up' ? ArrowUp : ArrowDown;
        return (
          <li
            key={factor.id}
            onMouseEnter={() => onHoverFactor?.(factor.impact)}
            onMouseLeave={() => onHoverFactor?.(null)}
            className="rounded-[12px] border border-transparent px-2.5 py-2 transition-colors duration-100 hover:border-[#E5E5EA] hover:bg-[#FAFAFA]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-[13px] font-medium text-foreground">{factor.label}</span>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums text-[#8E8E93]">
                <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                ±{Math.round(factor.impact * 100)}% к сроку
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F2F2F2]">
              <div
                className={cn('h-full rounded-full', index === 0 ? 'bg-foreground' : 'bg-[#C7C7CC]')}
                style={{ width: `${(factor.impact / max) * 100}%` }}
              />
            </div>
            {factor.low && factor.high ? (
              <div className="mt-1.5 flex justify-between text-[11.5px] text-[#8E8E93]">
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
