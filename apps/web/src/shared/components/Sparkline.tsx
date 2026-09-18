/**
 * Sparkline — мини-график на Recharts: линия цвета --primary, без осей,
 * сетки и подписей. Под графиком — процент изменения и служебная подпись.
 *
 * @example
 * <Sparkline
 *   label="Экономия OPEX по годам"
 *   data={[2.1, 4.4, 8.0, 12.6, 18.1, 24.0, 31.2]}
 *   percent="+24.8%"
 *   trend="up"
 *   meta="31.2 МЛН ₽/ГОД К 7-МУ"
 * />
 *
 * @example Падающая метрика
 * <Sparkline label="OPEX на паллету" data={[9, 8.4, 7.6, 7.1]} percent="−23.1%" trend="down" />
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

export interface SparklineProps {
  /** Микро-подпись над графиком. */
  label?: string;
  /** Последовательность значений; ось не рисуется, важна только форма. */
  data: number[];
  /** Готовая строка процента, например «+24.8%». */
  percent?: string;
  trend?: 'up' | 'down';
  /** Служебная mono-подпись справа от процента. */
  meta?: string;
  height?: number;
  className?: string;
}

export function Sparkline({
  label,
  data,
  percent,
  trend = 'up',
  meta,
  height = 32,
  className,
}: SparklineProps) {
  const points = data.map((value, index) => ({ index, value }));

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="micro-label mb-3 text-muted-foreground">{label}</div>
      ) : null}

      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {percent || meta ? (
        <div className="mt-3 flex items-baseline justify-between gap-3">
          {percent ? (
            <div className="flex items-center gap-1.5 font-heading text-[22px] font-bold tabular tracking-h1">
              {percent}
              {trend === 'up' ? (
                <ArrowUp className="size-3.5 text-primary" strokeWidth={2.5} aria-hidden />
              ) : (
                <ArrowDown className="size-3.5 text-primary" strokeWidth={2.5} aria-hidden />
              )}
            </div>
          ) : null}
          {meta ? <div className="meta-label">{meta}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
