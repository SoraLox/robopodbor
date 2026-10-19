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
  const tiles: Array<{ label: string; value: string; note: string; tone?: 'good' | 'bad' }> = [
    {
      label: 'NPV',
      value: `${mlnText(finance.npvMln)} млн ₽`,
      note: `Сколько проект заработает в сегодняшних деньгах: будущие рубли пересчитаны по ставке ${mlnText(finance.discountRatePct)}%`,
      tone: finance.npvMln >= 0 ? 'good' : 'bad',
    },
    {
      label: 'IRR',
      value: finance.irrPct === null ? '—' : `${Math.round(finance.irrPct)}%`,
      note: 'Доходность проекта в % годовых — сравните со ставкой кредита или вклада',
    },
    {
      label: `ROI за ${horizon} ${yearsWord(horizon)}`,
      value: finance.roiPct === null ? '—' : `${finance.roiPct}%`,
      note: 'Чистая прибыль на каждый вложенный рубль, с учётом стоимости роботов на конец срока',
      tone: (finance.roiPct ?? 0) >= 0 ? 'good' : 'bad',
    },
    {
      label: 'Вложения',
      value: `${mlnText(finance.totalInvestmentMln)} млн ₽`,
      note: 'Покупка и внедрение роботов (CAPEX) плюс замена по сроку службы',
    },
    {
      label: 'Остаточная стоимость',
      value: `${mlnText(finance.salvageMln)} млн ₽`,
      note: `Сколько будут стоить роботы на конец ${horizon}-го года: их можно продать или работать дальше`,
    },
  ];
  const payback = finance.paybackYears;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
      <div className="flex flex-col justify-between rounded-[16px] border border-[#E5E5EA] bg-white p-4 sm:p-5">
        <div className="text-[12.5px] font-medium text-[#6E6E73]">Окупаемость</div>
        <div className="mt-2 text-[48px] font-semibold leading-none tracking-[-0.03em] text-foreground">
          {payback === null ? '—' : mlnText(payback)}
          {payback !== null ? (
            <span className="ml-1.5 text-[18px] font-medium tracking-normal text-[#6E6E73]">{yearsWord(payback)}</span>
          ) : null}
        </div>
        <div className="mt-2 text-[12px] leading-snug text-[#8E8E93]">
          {payback === null
            ? 'За горизонт расчёта не окупается'
            : `Через столько лет вложения вернутся из экономии. С учётом стоимости денег — ${finance.discountedPaybackYears === null ? 'за горизонтом расчёта' : `${mlnText(finance.discountedPaybackYears)} ${yearsWord(finance.discountedPaybackYears)}`}`}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0 rounded-[16px] border border-[#E5E5EA] bg-white p-3.5">
            <div className="truncate text-[12px] font-medium text-[#6E6E73]">{tile.label}</div>
            <div
              className={cn(
                'mt-1.5 text-[20px] font-semibold leading-tight tracking-[-0.02em]',
                tile.tone === 'bad' ? 'text-[#D03B3B]' : 'text-foreground',
              )}
            >
              {tile.value}
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-[#8E8E93]">{tile.note}</div>
          </div>
        ))}
      </div>
    </div>
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
export function TcoCompareChart({ scenarios, horizon }: { scenarios: ScenarioBar[]; horizon: number }) {
  const max = Math.max(...scenarios.map((s) => s.tco), 1);
  const base = scenarios.find((s) => s.id === 'as-is');
  return (
    <ChartCard
      title="Стоимость владения за горизонт"
      subtitle={`Млн ₽ за ${horizon} ${yearsWord(horizon)}: «как есть» — ФОТ замещаемых ролей; покупка и RaaS — вложения, OPEX и оставшийся ФОТ.`}
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
            note: base && s.id !== 'as-is' ? `${s.delta} млн ₽ к «как есть»` : s.subtitle,
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

export function CostStructureChart({ groups, total }: { groups: CostGroup[]; total: number }) {
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
      title="Из чего складывается стоимость владения"
      subtitle={`Всего ${mlnText(total)} млн ₽ за горизонт${credit.length ? ` с учётом остаточной стоимости ${mlnText(credit.reduce((s, l) => s + l.amount, 0))} млн ₽` : ''}.`}
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
export function OpexLeversChart({ levers }: { levers: Levers }) {
  const max = Math.max(...levers.levers.map((l) => l.savingMln), 1);
  const total = levers.levers.reduce((s, l) => s + l.savingMln, 0);
  return (
    <ChartCard
      title="Что снизит операционные затраты"
      subtitle={`OPEX после роботизации — ${mlnText(levers.opexYearMln)} млн ₽ в год. Рычаги — из структуры затрат этого расчёта; «оценка» — по допущению, оно названо в описании.`}
      legend={
        <Legend>
          {levers.parts.map((p, i) => (
            <LegendItem key={p.id} color={[VIZ.grayDark, VIZ.blue, VIZ.orange][i] ?? VIZ.gray} label={`${p.label} · ${mlnText(p.amountMln)} млн ₽`} />
          ))}
        </Legend>
      }
      chart={
        <div>
          <div className="flex h-3 w-full gap-[2px]" role="img" aria-label="Состав OPEX в год">
            {levers.parts
              .filter((p) => p.amountMln > 0)
              .map((p, i, arr) => (
                <div
                  key={p.id}
                  className={cn('h-full', i === 0 && 'rounded-l-[4px]', i === arr.length - 1 && 'rounded-r-[4px]')}
                  style={{
                    width: `${(p.amountMln / (levers.opexYearMln || 1)) * 100}%`,
                    background: [VIZ.grayDark, VIZ.blue, VIZ.orange][levers.parts.indexOf(p)] ?? VIZ.gray,
                  }}
                />
              ))}
          </div>
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-medium text-[#6E6E73]">Рычаги, экономия в год</span>
            <span className="text-[12.5px] text-[#8E8E93]">до {mlnText(total)} млн ₽ в год вместе</span>
          </div>
          <ul className="mt-2 grid gap-3">
            {levers.levers.map((l) => (
              <li key={l.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <span className="truncate">{l.title}</span>
                    <span
                      className={cn(
                        'flex-none rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none',
                        l.basis === 'calculated' ? 'bg-[#EAF3FE] text-[#1C5CAB]' : 'bg-[#F2F2F4] text-[#6E6E73]',
                      )}
                    >
                      {l.basis === 'calculated' ? 'расчёт' : 'оценка'}
                    </span>
                  </span>
                  <span className="flex-none text-[13px] font-semibold tabular-nums text-foreground">−{mlnText(l.savingMln)} млн ₽</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{ width: `${(l.savingMln / max) * 100}%`, background: l.basis === 'calculated' ? VIZ.blue : VIZ.gray }}
                  />
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-[#8E8E93]">{l.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      }
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

export function SensitivityTornado({ factors, basePayback }: { factors: SensitivityFactor[]; basePayback: number }) {
  const rows = factors.map((f) => {
    const a = yearsOf(f.low) ?? basePayback;
    const b = yearsOf(f.high) ?? basePayback;
    return { ...f, fast: Math.min(a, b), slow: Math.max(a, b) };
  });
  const spread = Math.max(...rows.map((r) => Math.max(basePayback - r.fast, r.slow - basePayback)), 0.05);
  const pos = (v: number) => 50 + ((v - basePayback) / spread) * 46;
  return (
    <ChartCard
      title="Что сильнее всего двигает окупаемость"
      subtitle={`Каждый фактор ±20%. Центр — расчётные ${mlnText(basePayback)} ${yearsWord(basePayback)}; полоса влево — окупится быстрее, вправо — дольше.`}
      legend={
        <Legend>
          <LegendItem color={VIZ.blue} label="Быстрее" />
          <LegendItem color={VIZ.orange} label="Дольше" />
        </Legend>
      }
      chart={
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="text-[12.5px] font-medium text-foreground">{r.label}</div>
              <div className="relative mt-1.5 h-4">
                <div className="absolute inset-y-0 w-px bg-[#D1D1D6]" style={{ left: '50%' }} aria-hidden />
                <div
                  className="absolute inset-y-0.5 rounded-l-[4px]"
                  style={{ left: `${pos(r.fast)}%`, width: `${50 - pos(r.fast)}%`, background: VIZ.blue }}
                />
                <div
                  className="absolute inset-y-0.5 rounded-r-[4px]"
                  style={{ left: 'calc(50% + 2px)', width: `calc(${pos(r.slow) - 50}% - 2px)`, background: VIZ.orange }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11.5px] tabular-nums text-[#8E8E93]">
                <span>{r.low ?? '—'}</span>
                <span>{r.high ?? '—'}</span>
              </div>
            </li>
          ))}
        </ul>
      }
      table={
        <DataTable
          head={['Фактор ±20%', 'Оптимистично', 'Осторожно', 'Влияние']}
          rows={rows.map((r) => [r.label, r.low ?? '—', r.high ?? '—', `±${Math.round(r.impact * 100)}%`])}
        />
      }
    />
  );
}
