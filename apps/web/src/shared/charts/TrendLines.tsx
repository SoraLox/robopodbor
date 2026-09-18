/**
 * TrendLines — линейный график сравнения нескольких рядов с точками.
 *
 * @example
 * <TrendLines
 *   data={[{ label: '1 сен', warehouse: 1180, airport: 620 }]}
 *   series={[
 *     { key: 'warehouse', name: 'Склады' },
 *     { key: 'airport', name: 'Аэропорты' },
 *   ]}
 * />
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, ru } from './chartTheme';

export interface TrendSeries {
  key: string;
  name: string;
}

export interface TrendLinesProps {
  data: Array<Record<string, string | number>>;
  series: TrendSeries[];
  labelKey?: string;
  height?: number;
}

export function TrendLines({
  data,
  series,
  labelKey = 'label',
  height = 200,
}: TrendLinesProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
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
          width={52}
        />
        <Tooltip {...CHART.tooltip} cursor={{ stroke: CHART.grid }} formatter={(v) => ru(Number(v))} />
        {series.map((item, index) => {
          const color = CHART.series[index] ?? CHART.series[1];
          return (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.name}
              stroke={color}
              strokeWidth={1.75}
              dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
