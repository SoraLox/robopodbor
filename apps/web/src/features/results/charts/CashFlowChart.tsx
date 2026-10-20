import { useLayoutEffect, useRef, useState } from 'react';
import type { CalculationResult } from '@/api/types';
import { ChartCard, DataTable, Legend, LegendItem, TooltipCard, VIZ, mlnText, niceTicks } from './chartKit';

type Finance = NonNullable<CalculationResult['finance']>;

const HEIGHT = 260;
const PAD = { top: 28, right: 12, bottom: 28, left: 44 };
const BAR_MAX = 24;
const GAP = 2;
const R = 4;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, el.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Столбик со скруглением только на конце (у оси — прямой угол).
function barPath(x: number, y0: number, y1: number, w: number, roundTop: boolean) {
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const h = bottom - top;
  if (h <= 0) return '';
  const r = Math.min(R, h, w / 2);
  if (roundTop) {
    return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
  }
  return `M${x},${top} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${x + w - r} Q${x + w},${bottom} ${x + w},${bottom - r} V${top} Z`;
}

const yearLabel = (year: number) => (year === 0 ? 'Старт' : `${year}-й год`);

export function CashFlowChart({ finance }: { finance: Finance }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const flows = finance.cashFlow;
  const n = flows.length;

  // Стопки года: вверх — эффект и остаточная; вниз — вложения (и отрицательный эффект).
  const ups = flows.map((f) => Math.max(0, f.effectMln) + f.salvageMln);
  const downs = flows.map((f) => f.investmentMln + Math.max(0, -f.effectMln));
  const ticks = niceTicks(
    Math.min(...downs.map((d) => -d), ...flows.map((f) => f.cumulativeMln)),
    Math.max(...ups, ...flows.map((f) => f.cumulativeMln)),
  );
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const band = plotW / n;
  const cx = (i: number) => PAD.left + band * (i + 0.5);
  const bw = Math.min(BAR_MAX, band * 0.5);
  const zero = y(0);

  const payback = finance.paybackYears;
  const paybackX = payback !== null && payback <= n - 1 ? cx(0) + payback * band : null;
  const line = flows.map((f, i) => `${i ? 'L' : 'M'}${cx(i)},${y(f.cumulativeMln)}`).join(' ');

  const hovered = hover === null ? null : flows[hover]!;
  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(cx(hover) + 14, 0), width - 200);

  const chart = (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Денежный поток по годам; окупаемость ${payback === null ? 'за горизонтом' : `${mlnText(payback)} г.`}`}
        className="block select-none"
        onMouseLeave={() => setHover(null)}
      >
        {/* Сетка и шкала — тонкие, приглушённые. */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={VIZ.inkMuted} className="tabular-nums">
              {mlnText(t)}
            </text>
          </g>
        ))}

        {/* Перекрестие года под курсором. */}
        {hover !== null ? <rect x={cx(hover) - band / 2} y={PAD.top} width={band} height={plotH} fill="#F5F5F7" /> : null}

        {flows.map((f, i) => {
          const x = cx(i) - bw / 2;
          const effectUp = Math.max(0, f.effectMln);
          const effectTop = y(effectUp);
          const salvageTop = y(effectUp + f.salvageMln);
          const investBottom = y(-(f.investmentMln + Math.max(0, -f.effectMln)));
          const negEffectBottom = y(-Math.max(0, -f.effectMln));
          return (
            <g key={f.year}>
              {effectUp > 0 ? (
                <path d={barPath(x, zero, f.salvageMln > 0 ? effectTop : effectTop, bw, f.salvageMln <= 0)} fill={VIZ.blue} />
              ) : null}
              {f.salvageMln > 0 ? <path d={barPath(x, effectTop - GAP, salvageTop, bw, true)} fill={VIZ.aqua} /> : null}
              {f.effectMln < 0 ? <path d={barPath(x, zero, negEffectBottom, bw, false)} fill={VIZ.blue} /> : null}
              {f.investmentMln > 0 ? (
                <path d={barPath(x, f.effectMln < 0 ? negEffectBottom + GAP : zero, investBottom, bw, false)} fill={VIZ.orange} />
              ) : null}
              <text x={cx(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill={VIZ.inkMuted}>
                {f.year === 0 ? 'Старт' : f.year}
              </text>
            </g>
          );
        })}

        {/* Накопленный итог — на той же шкале (те же млн ₽). */}
        <path d={line} fill="none" stroke={VIZ.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {flows.map((f, i) => (
          <circle key={f.year} cx={cx(i)} cy={y(f.cumulativeMln)} r={hover === i ? 5 : 4} fill={VIZ.ink} stroke={VIZ.surface} strokeWidth={2} />
        ))}
        {/* Подпись конца линии — итог за горизонт. */}
        <text
          x={cx(n - 1)}
          y={y(flows[n - 1]!.cumulativeMln) - 12}
          textAnchor="end"
          fontSize={11.5}
          fontWeight={600}
          fill={VIZ.ink}
        >
          {mlnText(flows[n - 1]!.cumulativeMln)} млн ₽
        </text>

        {/* Точка окупаемости. */}
        {paybackX !== null ? (
          <g>
            <line x1={paybackX} x2={paybackX} y1={PAD.top - 6} y2={zero} stroke={VIZ.ink} strokeWidth={1} />
            <circle cx={paybackX} cy={zero} r={4} fill={VIZ.surface} stroke={VIZ.ink} strokeWidth={2} />
            <text x={paybackX + 6} y={PAD.top - 10} fontSize={11.5} fontWeight={600} fill={VIZ.ink}>
              Окупаемость: {mlnText(payback!)} г.
            </text>
          </g>
        ) : null}

        {/* Зоны наведения — весь год, не только столбик. */}
        {flows.map((f, i) => (
          <rect
            key={f.year}
            x={cx(i) - band / 2}
            y={PAD.top}
            width={band}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${yearLabel(f.year)}: итог ${mlnText(f.netMln)} млн ₽, накопленным итогом ${mlnText(f.cumulativeMln)} млн ₽`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="outline-none"
          />
        ))}
      </svg>
      {hovered ? (
        <TooltipCard
          title={yearLabel(hovered.year)}
          style={{ left: tooltipLeft, top: 8 }}
          rows={[
            ...(hovered.effectMln ? [{ color: VIZ.blue, label: 'Эффект', value: `${mlnText(hovered.effectMln)} млн ₽` }] : []),
            ...(hovered.investmentMln ? [{ color: VIZ.orange, label: 'Вложения', value: `−${mlnText(hovered.investmentMln)} млн ₽` }] : []),
            ...(hovered.salvageMln ? [{ color: VIZ.aqua, label: 'Остаточная стоимость', value: `${mlnText(hovered.salvageMln)} млн ₽` }] : []),
            { color: VIZ.grayDark, label: 'Итог года', value: `${mlnText(hovered.netMln)} млн ₽` },
            { color: VIZ.ink, label: 'Накопленным итогом', value: `${mlnText(hovered.cumulativeMln)} млн ₽`, strong: true },
          ]}
        />
      ) : null}
    </div>
  );

  return (
    <ChartCard
      title="Денежный поток"
      legend={
        <Legend>
          <LegendItem color={VIZ.blue} label="Эффект" />
          <LegendItem color={VIZ.orange} label="Вложения" />
          {finance.salvageMln > 0 ? <LegendItem color={VIZ.aqua} label="Остаточная" /> : null}
          <LegendItem color={VIZ.ink} label="Накопительным итогом" kind="line" />
        </Legend>
      }
      chart={chart}
      table={
        <DataTable
          head={['Год', 'Эффект', 'Вложения', 'Остаточная', 'Итог года', 'Накопленным итогом']}
          rows={flows.map((f) => [
            yearLabel(f.year),
            mlnText(f.effectMln),
            f.investmentMln ? `−${mlnText(f.investmentMln)}` : '-',
            f.salvageMln ? mlnText(f.salvageMln) : '-',
            mlnText(f.netMln),
            mlnText(f.cumulativeMln),
          ])}
        />
      }
    />
  );
}
