import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Общие детали графиков экономики (методика dataviz): роли цветов, подсказка,
 * легенда, переключатель «График / Таблица». Цвет — у метки, текст — в цветах
 * текста; у каждого графика есть табличный вид (подсказка не единственный путь
 * к числу).
 */

// Палитра проверена validate_palette.js (светлая тема): синий — эффект и
// «наш» вариант, оранжевый — вложения, бирюзовый — остаточная стоимость.
export const VIZ = {
  surface: '#FFFFFF',
  grid: '#EDEDEF',
  axis: '#D1D1D6',
  ink: '#1D1D1F',
  inkSecondary: '#6E6E73',
  inkMuted: '#8E8E93',
  blue: '#2F86F0',
  orange: '#EB6834',
  aqua: '#1BAF7A',
  gray: '#C7C7CC',
  grayDark: '#8E8E93',
} as const;

/** Короткая подпись числа в млн ₽: 1 234,5 → «1 235»; 12,3 → «12,3». */
export function mlnText(value: number) {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 1;
  return `${value < 0 ? '−' : ''}${abs.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
}

/** Круглые деления шкалы: 3–6 значений с шагом 1/2/5 × 10^n, ноль всегда входит. */
export function niceTicks(min: number, max: number, target = 5) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= target + 1) ?? 10 * pow;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export function LegendItem({ color, label, kind = 'rect' }: { color: string; label: string; kind?: 'rect' | 'line' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6E6E73]">
      {kind === 'rect' ? (
        <span className="size-2.5 flex-none rounded-[3px]" style={{ background: color }} aria-hidden />
      ) : (
        <span className="h-[2px] w-3.5 flex-none rounded-full" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>;
}

/** Подсказка: значение — главное (жирное), подпись серии — вторичная; ключ серии — короткий штрих. */
export function TooltipCard({
  title,
  rows,
  style,
}: {
  title: string;
  rows: Array<{ color: string; label: string; value: string; strong?: boolean }>;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[180px] rounded-[10px] border border-[#E5E5EA] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      style={style}
    >
      <div className="mb-1 text-[11.5px] font-medium text-[#8E8E93]">{title}</div>
      <div className="grid gap-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-[#6E6E73]">
              <span className="h-[2px] w-3 rounded-full" style={{ background: row.color }} aria-hidden />
              {row.label}
            </span>
            <span className={cn('tabular-nums text-foreground', row.strong ? 'font-semibold' : 'font-medium')}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Карточка графика: заголовок, подзаголовок, переключатель «График / Таблица».
 *  `plain` — без рамки и паддингов (для панели отчёта справа). */
export function ChartCard({
  title,
  subtitle,
  legend,
  chart,
  table,
  className,
  plain = false,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
  plain?: boolean;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section
      className={cn(
        'min-w-0',
        plain ? 'bg-transparent p-0' : 'rounded-[16px] border border-[#E5E5EA] bg-white p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[12.5px] leading-snug text-[#8E8E93]">{subtitle}</p> : null}
        </div>
        <div role="tablist" aria-label={`${title}: вид`} className="flex rounded-[8px] bg-[#F2F2F4] p-0.5">
          {(
            [
              ['chart', 'График'],
              ['table', 'Таблица'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                'h-6 rounded-[6px] px-2 text-[11.5px] font-medium',
                view === id ? 'bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[#6E6E73]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'chart' ? (
        <>
          {legend ? <div className="mt-3">{legend}</div> : null}
          <div className="mt-3">{chart}</div>
        </>
      ) : (
        <div className="mt-3 overflow-x-auto">{table}</div>
      )}
    </section>
  );
}

/** Табличный вид: числа выровнены по разрядам. */
export function DataTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={cn('border-b border-[#E5E5EA] pb-1.5 font-medium text-[#8E8E93]', i === 0 ? 'text-left' : 'text-right')}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  'border-b border-[#F2F2F4] py-1.5 text-foreground',
                  i === 0 ? 'text-left' : 'text-right tabular-nums',
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
