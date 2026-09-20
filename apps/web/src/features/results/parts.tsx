import type { ComponentType, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Метрика в правой колонке результата: иконка-категория, число и короткое
 * пояснение простыми словами. Три штуки стоят рядом с главным числом —
 * дают контекст, не отвлекая от него.
 */
export function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  note,
  trend = 'none',
  children,
  className,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  unit?: string;
  note?: string;
  trend?: 'up' | 'down' | 'none';
  children?: ReactNode;
  className?: string;
}) {
  const TrendIcon = trend === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <div className={cn('rounded-xl border border-border bg-background p-4', className)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-lg bg-accent-tint">
          <Icon className="size-4 text-primary" strokeWidth={1.8} />
        </span>
        <span className="text-[13px] text-muted-foreground">{label}</span>
        {trend !== 'none' ? (
          <TrendIcon
            className="ml-auto size-4 text-status-operation"
            strokeWidth={1.8}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none tabular">{value}</span>
        {unit ? <span className="text-[13px] text-muted-foreground">{unit}</span> : null}
      </div>

      {note ? (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{note}</p>
      ) : null}

      {children}
    </div>
  );
}
