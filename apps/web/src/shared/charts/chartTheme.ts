/** Общие настройки графиков: одна палитра и одна сетка на все диаграммы. */
export const CHART = {
  series: ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'],
  grid: 'hsl(var(--hairline))',
  axis: 'hsl(var(--meta-foreground))',
  axisTick: { fontSize: 11, fill: 'hsl(var(--meta-foreground))' },
  tooltip: {
    contentStyle: {
      borderRadius: 10,
      border: '1px solid hsl(var(--border))',
      boxShadow: '0 4px 16px rgb(16 16 20 / 0.08)',
      fontSize: 12,
      padding: '8px 10px',
    },
    labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: 'hsl(var(--muted-foreground))' },
    cursor: { fill: 'hsl(var(--hairline))' },
  },
} as const;

/** Разделитель тысяч в русской локали — общий для осей и подписей. */
export const ru = (value: number) => value.toLocaleString('ru-RU');
