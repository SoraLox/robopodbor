/**
 * MiniTrend — спарклайн для KPI-карточки: только форма ряда, без осей.
 *
 * @example
 * <MiniTrend data={[12, 18, 15, 24, 28, 31]} tone="up" />
 */
import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export interface MiniTrendProps {
  data: number[];
  /** Растущий ряд рисуем акцентом, падающий — нейтрально-серым. */
  tone?: 'up' | 'down';
  width?: number;
  height?: number;
}

export function MiniTrend({ data, tone = 'up', width = 96, height = 36 }: MiniTrendProps) {
  const points = data.map((value, index) => ({ index, value }));
  const color = tone === 'up' ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-2))';
  // useId: три плитки с одним tone давали три одинаковых DOM-id
  const gradientId = `mini-${useId().replace(/:/g, '')}`;

  return (
    <div style={{ width, height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
