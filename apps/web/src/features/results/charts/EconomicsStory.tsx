import type { CalculationResult } from '@/api/types';
import { cn } from '@/lib/utils';
import { mlnText } from './chartKit';

/**
 * Слой 1 экономики: восемь цифр в одинаковых плашках (операционные + финансы).
 * Пояснения — в title (tooltip), не в сетке.
 */

const yearsWord = (n: number) => {
  if (!Number.isInteger(Math.round(n * 10) / 10)) return 'года';
  const r = Math.round(n);
  return r % 10 === 1 && r % 100 !== 11 ? 'год' : r % 10 >= 2 && r % 10 <= 4 && (r % 100 < 12 || r % 100 > 14) ? 'года' : 'лет';
};

const robotsWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'робот' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'робота' : 'роботов';

/** Парк: fleet → robots.count → сумма «N × …» в CAPEX-строках. */
function robotCount(data: CalculationResult): number {
  const fromFleet = (data.fleet ?? []).reduce((sum, g) => sum + g.count, 0);
  if (fromFleet > 0) return fromFleet;
  if (data.robots?.count && data.robots.count > 0) return data.robots.count;
  const fromLines = (data.costGroups ?? [])
    .flatMap((g) => g.lines)
    .reduce((sum, line) => {
      const m = /^(\d+)\s*×/.exec(line.title);
      return sum + (m ? Number(m[1]) : 0);
    }, 0);
  return fromLines;
}

type Tile = { label: string; value: string; tip: string; tone?: 'good' | 'bad'; badge?: string };

function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <li key={tile.label} title={tile.tip} className="min-w-0 rounded-[12px] bg-[#F7F7F8] px-3 py-3">
          <div className="truncate text-[12px] font-medium text-[#6E6E73]">
            {tile.label}
            {tile.badge ? <span className="font-normal"> {tile.badge}</span> : null}
          </div>
          <div
            className={cn(
              'mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums',
              tile.tone === 'bad' ? 'text-[#D03B3B]' : tile.tone === 'good' ? 'text-[#1F7A4D]' : 'text-foreground',
            )}
          >
            {tile.value}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EconomicsStory({ data }: { data: CalculationResult }) {
  const f = data.finance;
  if (!f) return null;

  const horizon = f.cashFlow.length - 1;
  const effect = f.cashFlow.find((row) => row.year === 1)?.effectMln ?? 0;
  const robots = robotCount(data);
  const pays = f.paybackYears !== null;

  const ops: Tile[] = [
    {
      label: 'Вкладываете',
      value: `${mlnText(f.totalInvestmentMln)} млн ₽`,
      tip:
        robots > 0
          ? `${robots} ${robotsWord(robots)}, внедрение и замена по сроку службы`
          : 'Покупка, внедрение и замена по сроку службы',
    },
    {
      label: 'Экономите в год',
      value: `${mlnText(effect)} млн ₽`,
      tip: 'Экономия ФОТ минус обслуживание, ПО и электричество',
      tone: effect > 0 ? 'good' : 'bad',
    },
    {
      label: 'Окупаемость',
      value: pays ? `${mlnText(f.paybackYears!)} ${yearsWord(f.paybackYears!)}` : 'не окупится',
      tip: pays
        ? f.discountedPaybackYears === null
          ? 'Простая окупаемость; с дисконтом: за горизонтом'
          : `С учётом стоимости денег: ${mlnText(f.discountedPaybackYears)} ${yearsWord(f.discountedPaybackYears)}`
        : `За ${horizon} ${yearsWord(horizon)} экономия не перекрывает вложения`,
      tone: pays ? 'good' : 'bad',
    },
    {
      label: `Выгода за ${horizon} ${yearsWord(horizon)}`,
      value: `${f.netBenefitMln >= 0 ? '+' : ''}${mlnText(f.netBenefitMln)} млн ₽`,
      tip: 'Сверх вложений, с учётом остаточной стоимости парка',
      tone: f.netBenefitMln >= 0 ? 'good' : 'bad',
    },
  ];

  const finance: Tile[] = [
    {
      label: 'NPV',
      value: `${mlnText(f.npvMln)} млн ₽`,
      badge: `за ${horizon} ${yearsWord(horizon)}`,
      tip: `Сумма дисконтированных потоков за ${horizon} ${yearsWord(horizon)}, в сегодняшних деньгах (ставка ${mlnText(f.discountRatePct)}% годовых)`,
      tone: f.npvMln >= 0 ? 'good' : 'bad',
    },
    {
      label: 'IRR',
      value: f.irrPct === null ? '-' : `${Math.round(f.irrPct)}%`,
      badge: '/ год',
      tip: 'Внутренняя доходность проекта в процентах годовых',
    },
    {
      label: 'Дисконт',
      value: `${mlnText(f.discountRatePct)}%`,
      badge: '/ год',
      tip: 'Годовая ставка, которой дисконтируются будущие потоки',
    },
    {
      label: 'ROI',
      value: f.roiPct === null ? '-' : `${f.roiPct}%`,
      badge: '/ год −CAPEX',
      tip: `Чистая прибыль за вычетом CAPEX, усреднённая на год (горизонт ${horizon} ${yearsWord(horizon)})`,
      tone: f.roiPct === null ? undefined : f.roiPct >= 0 ? 'good' : 'bad',
    },
  ];

  return (
    <div className="grid gap-2 rounded-[16px] border border-[#E5E5EA] bg-white p-4 sm:p-5">
      <TileGrid tiles={ops} />
      <TileGrid tiles={finance} />
    </div>
  );
}
