import { useState } from 'react';
import type { CalculationResult, CostGroup, ScenarioBar, SensitivityFactor } from '@/api/types';
import { cn } from '@/lib/utils';
import { ChartCard, DataTable, Legend, LegendItem, VIZ, mlnText } from './chartKit';

type Finance = NonNullable<CalculationResult['finance']>;
type Levers = NonNullable<CalculationResult['opexLevers']>;

const yearsWord = (n: number) => {
  const r = Math.round(n * 10) / 10;
  if (!Number.isInteger(r)) return 'года';
  return r % 10 === 1 && r % 100 !== 11 ? 'год' : r % 10 >= 2 && r % 10 <= 4 && (r % 100 < 12 || r % 100 > 14) ? 'года' : 'лет';
};

// ─── Ряд показателей ──────────────────────────────────────────────────────
// Один главный показатель (окупаемость — крупно), остальные — плитки.
export function FinanceKpis({ finance, horizon }: { finance: Finance; horizon: number }) {
  const tiles: Array<{ label: string; value: string; tone?: 'good' | 'bad'; badge?: string }> = [
    {
      label: 'Окупаемость',
      value:
        finance.paybackYears === null
          ? '-'
          : `${mlnText(finance.paybackYears)} ${yearsWord(finance.paybackYears)}`,
      tone: finance.paybackYears !== null ? 'good' : 'bad',
    },
    {
      label: 'NPV',
      value: `${mlnText(finance.npvMln)}`,
      tone: finance.npvMln >= 0 ? 'good' : 'bad',
      badge: `за ${horizon} ${yearsWord(horizon)}`,
    },
    {
      label: 'IRR',
      value: finance.irrPct === null ? '-' : `${Math.round(finance.irrPct)}%`,
      badge: '/ год',
    },
    {
      label: 'ROI',
      value: finance.roiPct === null ? '-' : `${finance.roiPct}%`,
      tone: (finance.roiPct ?? 0) >= 0 ? 'good' : 'bad',
      badge: '/ год −CAPEX',
    },
    {
      label: 'Вложения',
      value: mlnText(finance.totalInvestmentMln),
    },
    {
      label: 'Остаточная',
      value: mlnText(finance.salvageMln),
    },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map((tile) => (
        <li key={tile.label} className="rounded-[10px] bg-[#F7F7F8] px-2.5 py-2.5">
          <div className="truncate text-[11px] font-medium text-[#8E8E93]">
            {tile.label}
            {tile.badge ? <span className="font-normal"> {tile.badge}</span> : null}
          </div>
          <div
            className={cn(
              'mt-0.5 text-[16px] font-semibold tabular-nums tracking-[-0.02em]',
              tile.tone === 'bad' ? 'text-[#D03B3B]' : tile.tone === 'good' ? 'text-[#1F7A4D]' : 'text-foreground',
            )}
          >
            {tile.value}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Горизонтальные полосы с подписью на конце ─────────────────────────────
function HBars({
  rows,
  max,
  unit,
}: {
  rows: Array<{ id: string; label: ReactLabel; value: number; color: string; note?: string; badge?: string }>;
  max: number;
  unit: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ul className="grid gap-2.5">
      {rows.map((row) => (
        <li
          key={row.id}
          tabIndex={0}
          onMouseEnter={() => setHover(row.id)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(row.id)}
          onBlur={() => setHover(null)}
          className="outline-none"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
              <span className="truncate">{row.label}</span>
              {row.badge ? (
                <span className="flex-none rounded-full bg-status-operation-tint px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-status-operation">
                  {row.badge}
                </span>
              ) : null}
            </span>
            <span className="flex-none text-[13px] font-semibold tabular-nums text-foreground">
              {mlnText(row.value)} {unit}
            </span>
          </div>
          <div className="mt-1.5 h-3 w-full">
            <div
              className="h-full rounded-r-[4px] transition-[filter] duration-100"
              style={{
                width: `${Math.max(0.5, (Math.max(0, row.value) / (max || 1)) * 100)}%`,
                background: row.color,
                filter: hover === row.id ? 'brightness(1.08)' : undefined,
              }}
            />
          </div>
          {row.note ? <div className="mt-1 text-[11.5px] leading-snug text-[#8E8E93]">{row.note}</div> : null}
        </li>
      ))}
    </ul>
  );
}
type ReactLabel = string;

// ─── Сравнение сценариев по стоимости владения ─────────────────────────────
// Форма «акцент»: выбранный (рекомендуемый) — синий, остальные — серые.
export function TcoCompareChart({ scenarios, horizon: _horizon }: { scenarios: ScenarioBar[]; horizon: number }) {
  const max = Math.max(...scenarios.map((s) => s.tco), 1);
  const base = scenarios.find((s) => s.id === 'as-is');
  return (
    <ChartCard
      title="Стоимость владения за горизонт"
      chart={
        <HBars
          unit="млн ₽"
          max={max}
          rows={scenarios.map((s) => ({
            id: s.id,
            label: s.title,
            value: s.tco,
            color: s.recommended ? VIZ.blue : s.id === 'as-is' ? VIZ.grayDark : VIZ.gray,
            badge: s.recommended ? 'Рекомендуем' : undefined,
            note: base && s.id !== 'as-is' ? `${s.delta} млн ₽` : s.subtitle,
          }))}
        />
      }
      table={
        <DataTable
          head={['Сценарий', 'TCO, млн ₽', 'К «как есть»']}
          rows={scenarios.map((s) => [s.title, mlnText(s.tco), s.delta])}
        />
      }
    />
  );
}

// ─── Структура стоимости владения: одна полоса 100% + легенда со значениями ─
const PART_COLORS = [VIZ.blue, VIZ.orange, VIZ.aqua, '#EDA100', '#E87BA4', '#6250D6'];

export function CostStructureChart({
  groups,
  total,
  plain = false,
}: {
  groups: CostGroup[];
  total: number;
  plain?: boolean;
}) {
  // Строки всех групп; остаточная стоимость — отрицательная, показываем отдельно.
  const lines = groups.flatMap((g) => g.lines.map((l) => ({ ...l, group: g.title })));
  const positive = lines.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  const credit = lines.filter((l) => l.amount < 0);
  // Не больше 6 частей: хвост — в «Прочее».
  const head = positive.slice(0, 5);
  const tail = positive.slice(5);
  const parts = [
    ...head.map((l) => ({ label: l.title, amount: l.amount })),
    ...(tail.length ? [{ label: 'Прочее', amount: tail.reduce((s, l) => s + l.amount, 0) }] : []),
  ];
  const sum = parts.reduce((s, p) => s + p.amount, 0) || 1;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <ChartCard
      plain={plain}
      title="Из чего складывается стоимость владения"
      subtitle={`Всего ${mlnText(total)} млн ₽${credit.length ? ` · остаточная ${mlnText(credit.reduce((s, l) => s + l.amount, 0))} млн ₽` : ''}.`}
      chart={
        <div>
          <div className="flex h-5 w-full gap-[2px]" role="img" aria-label="Доли статей в стоимости владения">
            {parts.map((p, i) => (
              <div
                key={p.label}
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={cn('h-full outline-none', i === 0 && 'rounded-l-[4px]', i === parts.length - 1 && 'rounded-r-[4px]')}
                style={{
                  width: `${(p.amount / sum) * 100}%`,
                  background: PART_COLORS[i],
                  opacity: hover === null || hover === i ? 1 : 0.45,
                }}
                title={`${p.label}: ${mlnText(p.amount)} млн ₽`}
              />
            ))}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {parts.map((p, i) => (
              <li
                key={p.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={cn('flex min-w-0 items-baseline justify-between gap-3 rounded-[6px] px-1 py-0.5', hover === i && 'bg-[#F5F5F7]')}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-[#6E6E73]">
                  <span className="size-2.5 flex-none rounded-[3px]" style={{ background: PART_COLORS[i] }} aria-hidden />
                  <span className="truncate">{p.label}</span>
                </span>
                <span className="flex-none text-[12.5px] tabular-nums text-foreground">
                  {mlnText(p.amount)} <span className="text-[#8E8E93]">· {Math.round((p.amount / sum) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      }
      table={
        <DataTable
          head={['Статья', 'Группа', 'Млн ₽']}
          rows={lines.map((l) => [l.title, l.group, mlnText(l.amount)])}
        />
      }
    />
  );
}

// ─── Что снизит OPEX ──────────────────────────────────────────────────────
export function OpexLeversChart({ levers, plain = false }: { levers: Levers; plain?: boolean }) {
  const max = Math.max(...levers.levers.map((l) => l.savingMln), 1);
  const bars = (
    <ul className="grid gap-2">
      {levers.levers.map((l) => (
        <li key={l.id}>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate font-medium text-foreground" title={l.title}>
              {l.title}
            </span>
            <span className="flex-none font-semibold tabular-nums">−{mlnText(l.savingMln)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-r-[3px] bg-[#F2F2F4]">
            <div
              className="h-full rounded-r-[3px]"
              style={{
                width: `${(l.savingMln / max) * 100}%`,
                background: l.basis === 'calculated' ? VIZ.blue : VIZ.gray,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );

  if (plain) return bars;

  return (
    <ChartCard
      title="Что снизит операционные затраты"
      subtitle={`OPEX: ${mlnText(levers.opexYearMln)} млн ₽/год`}
      chart={bars}
      table={
        <DataTable
          head={['Рычаг', 'Основание', 'Экономия, млн ₽ в год']}
          rows={levers.levers.map((l) => [l.title, l.basis === 'calculated' ? 'расчёт' : 'оценка', mlnText(l.savingMln)])}
        />
      }
    />
  );
}

// ─── Чувствительность: «торнадо» вокруг базовой окупаемости ───────────────
// Расходящаяся форма: влево — быстрее (синий), вправо — дольше (оранжевый), центр — база.
const yearsOf = (text: string | undefined) => {
  if (!text) return null;
  const m = /(\d+(?:[,.]\d+)?)/.exec(text);
  return m ? Number(m[1]!.replace(',', '.')) : null;
};

export function SensitivityTornado({
  factors,
  basePayback,
  plain = false,
}: {
  factors: SensitivityFactor[];
  basePayback: number;
  plain?: boolean;
}) {
  const rows = factors.map((f) => {
    const a = yearsOf(f.low) ?? basePayback;
    const b = yearsOf(f.high) ?? basePayback;
    return { ...f, fast: Math.min(a, b), slow: Math.max(a, b) };
  });
  const spread = Math.max(...rows.map((r) => Math.max(basePayback - r.fast, r.slow - basePayback)), 0.05);
  const pos = (v: number) => 50 + ((v - basePayback) / spread) * 46;
  const chart = (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate font-medium text-foreground">{r.label}</span>
            <span className="flex-none tabular-nums text-[#8E8E93]">
              {r.low ?? '-'} / {r.high ?? '-'}
            </span>
          </div>
          <div className="relative mt-1 h-3">
            <div className="absolute inset-y-0 w-px bg-[#D1D1D6]" style={{ left: '50%' }} aria-hidden />
            <div
              className="absolute inset-y-0.5 rounded-l-[3px]"
              style={{ left: `${pos(r.fast)}%`, width: `${50 - pos(r.fast)}%`, background: VIZ.blue }}
            />
            <div
              className="absolute inset-y-0.5 rounded-r-[3px]"
              style={{ left: 'calc(50% + 1px)', width: `calc(${pos(r.slow) - 50}% - 1px)`, background: VIZ.orange }}
            />
          </div>
        </li>
      ))}
    </ul>
  );

  if (plain) return chart;

  return (
    <ChartCard
      title="Что сильнее всего двигает окупаемость"
      subtitle={`±20%. Центр: ${mlnText(basePayback)} ${yearsWord(basePayback)}`}
      legend={
        <Legend>
          <LegendItem color={VIZ.blue} label="Быстрее" />
          <LegendItem color={VIZ.orange} label="Дольше" />
        </Legend>
      }
      chart={chart}
      table={
        <DataTable
          head={['Фактор ±20%', 'Оптимистично', 'Осторожно', 'Влияние']}
          rows={rows.map((r) => [r.label, r.low ?? '-', r.high ?? '-', `±${Math.round(r.impact * 100)}%`])}
        />
      }
    />
  );
}
