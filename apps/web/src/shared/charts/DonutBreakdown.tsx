/**
 * DonutBreakdown — кольцевая диаграмма с крупным итогом в центре.
 *
 * @example
 * <DonutBreakdown
 *   total="12 482"
 *   totalLabel="Всего расчётов"
 *   data={[{ name: 'Склад', value: 32 }, { name: 'Аэропорт', value: 21 }]}
 * />
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART } from './chartTheme';

export interface DonutSlice {
  name: string;
  value: number;
  /** Цвет сегмента; по умолчанию берётся из палитры с затуханием. */
  color?: string;
}

export interface DonutBreakdownProps {
  data: DonutSlice[];
  total: string;
  totalLabel: string;
  height?: number;
}

/** Затухание от акцента к светло-серому: первый сегмент главный. */
const FALLBACK = [
  'hsl(var(--chart-1))',
  'hsl(20 90% 68%)',
  'hsl(240 6% 72%)',
  'hsl(240 8% 80%)',
  'hsl(240 10% 86%)',
  'hsl(240 12% 91%)',
];

export function DonutBreakdown({
  data,
  total,
  totalLabel,
  height = 220,
}: DonutBreakdownProps) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="66%"
            outerRadius="100%"
            paddingAngle={1}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((slice, index) => (
              <Cell key={slice.name} fill={slice.color ?? FALLBACK[index] ?? FALLBACK[5]} />
            ))}
          </Pie>
          <Tooltip {...CHART.tooltip} formatter={(value) => `${value} %`} />
        </PieChart>
      </ResponsiveContainer>

      {/* Итог в центре кольца */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[22px] font-semibold tabular text-foreground">{total}</div>
        <div className="mt-0.5 text-[11px] text-meta-foreground">{totalLabel}</div>
      </div>
    </div>
  );
}
