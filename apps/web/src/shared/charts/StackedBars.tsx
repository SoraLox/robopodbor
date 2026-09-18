/**
 * StackedBars — накопительная столбчатая диаграмма динамики.
 *
 * @example
 * <StackedBars
 *   data={[{ label: '1 сен', done: 820, active: 180, rejected: 90 }]}
 *   series={[
 *     { key: 'done', name: 'Обработано' },
 *     { key: 'active', name: 'В работе' },
 *     { key: 'rejected', name: 'Отклонено' },
 *   ]}
 * />
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, ru } from './chartTheme';

export interface StackedSeries {
  key: string;
  name: string;
}

export interface StackedBarsProps {
  data: Array<Record<string, string | number>>;
  series: StackedSeries[];
  /** Ключ поля с подписью по оси X. */
  labelKey?: string;
  height?: number;
}

export function StackedBars({
  data,
  series,
  labelKey = 'label',
  height = 260,
}: StackedBarsProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey={labelKey}
          tickLine={false}
          axisLine={false}
          tick={CHART.axisTick}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={CHART.axisTick}
          tickFormatter={ru}
          width={54}
        />
        <Tooltip {...CHART.tooltip} formatter={(value) => ru(Number(value))} />
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.name}
            stackId="total"
            fill={CHART.series[index] ?? CHART.series[2]}
            radius={index === series.length - 1 ? [3, 3, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
