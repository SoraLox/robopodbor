/**
 * KpiBlock — плашка с крупным числом, подписью и стрелкой-иконкой.
 *
 * `variant="filled"` (оранжевая заливка) — для главной метрики экрана,
 * `variant="outline"` — для вторичных. Стрелка ставится в правом верхнем
 * углу: ArrowDownRight для метрик, где «меньше — лучше» (срок окупаемости),
 * ArrowUpRight для растущих (ROI).
 *
 * @example Главная метрика результата
 * <KpiBlock
 *   variant="filled"
 *   label="Срок окупаемости"
 *   value="3.2"
 *   unit="года"
 *   trend="down"
 *   note="Рекомендуемый сценарий — покупка с господдержкой."
 * />
 *
 * @example Вторичная метрика в сетке
 * <KpiBlock label="ROI, 5 лет" value="148%" trend="up" note="NPV 71.4 млн ₽" />
 */
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiBlockProps {
  label: string;
  value: string;
  /** Единица измерения, набирается рядом с числом по базовой линии. */
  unit?: string;
  /** Направление стрелки; `none` — стрелку не рисовать. */
  trend?: 'up' | 'down' | 'none';
  /** Пояснение под числом, отделяется тонкой линией. */
  note?: string;
  variant?: 'filled' | 'outline';
  /** Размер числа: 74px для героя экрана, 30px для плитки в сетке. */
  size?: 'lg' | 'sm';
  className?: string;
}

export function KpiBlock({
  label,
  value,
  unit,
  trend = 'none',
  note,
  variant = 'outline',
  size = 'lg',
  className,
}: KpiBlockProps) {
  const filled = variant === 'filled';
  const Arrow = trend === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <div
      className={cn(
        'p-4 md:p-5',
        filled
          ? 'bg-primary text-primary-foreground'
          : 'bg-background text-foreground',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div
          className={cn(
            'micro-label',
            filled ? 'text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </div>
        {trend !== 'none' ? (
          <Arrow
            className={cn(
              'flex-none',
              size === 'lg' ? 'size-5' : 'size-3.5',
              filled ? 'text-primary-foreground' : 'text-primary',
            )}
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>

      <div className={cn('flex items-baseline gap-2', size === 'lg' ? 'mt-4' : 'mt-2')}>
        <div
          className={cn(
            'font-heading font-bold tabular tracking-display',
            size === 'lg' ? 'text-[56px] leading-[0.82] md:text-[74px]' : 'text-[30px] leading-none',
          )}
        >
          {value}
        </div>
        {unit ? (
          <div className={cn('font-semibold', size === 'lg' ? 'text-sm' : 'text-xs')}>
            {unit}
          </div>
        ) : null}
      </div>

      {note ? (
        <div
          className={cn(
            'mt-4 border-t pt-3 text-[11.5px] leading-[1.5]',
            filled
              ? 'border-primary-foreground/40 text-primary-foreground'
              : 'border-hairline text-muted-foreground',
          )}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
