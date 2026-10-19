import { ArrowRight } from 'lucide-react';
import type { CalculationResult } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Экономика коротко, без терминов: четыре шага «вкладываете → экономите в год →
 * деньги вернутся → итог за горизонт» и вывод одной фразой. Цифры — те же, что
 * в показателях ниже (finance расчёта).
 */

const mln = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const yearsWord = (n: number) => {
  // Дробное число лет — «года»: 0,4 года, 2,5 года.
  if (!Number.isInteger(Math.round(n * 10) / 10)) return 'года';
  const r = Math.round(n);
  return r % 10 === 1 && r % 100 !== 11 ? 'год' : r % 10 >= 2 && r % 10 <= 4 && (r % 100 < 12 || r % 100 > 14) ? 'года' : 'лет';
};

const robotsWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'робот' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'робота' : 'роботов';

export function EconomicsStory({ data }: { data: CalculationResult }) {
  const f = data.finance;
  if (!f) return null;
  const horizon = f.cashFlow.length - 1;
  const effect = f.cashFlow.find((row) => row.year === 1)?.effectMln ?? 0;
  const robots = (data.fleet ?? []).reduce((sum, g) => sum + g.count, 0) || data.robots.count;
  const pays = f.paybackYears !== null;
  const perRuble = f.roiPct === null ? null : 1 + f.roiPct / 100;

  const steps: Array<{ label: string; value: string; note: string; tone?: 'good' | 'bad' }> = [
    {
      label: 'Вкладываете',
      value: `${mln(f.totalInvestmentMln)} млн ₽`,
      note: `${robots} ${robotsWord(robots)}, внедрение и замена по сроку службы`,
    },
    {
      label: 'Экономите каждый год',
      value: `${mln(effect)} млн ₽`,
      note: 'зарплаты замещаемых сотрудников минус обслуживание, ПО и электричество',
      tone: effect > 0 ? 'good' : 'bad',
    },
    {
      label: 'Деньги вернутся через',
      value: pays ? `${mln(f.paybackYears!)} ${yearsWord(f.paybackYears!)}` : 'не вернутся',
      note: pays ? 'дальше проект приносит чистую выгоду' : `за ${horizon} ${yearsWord(horizon)} экономия не перекрывает вложения`,
      tone: pays ? 'good' : 'bad',
    },
    {
      label: `Итог за ${horizon} ${yearsWord(horizon)}`,
      value: `${f.netBenefitMln >= 0 ? '+' : ''}${mln(f.netBenefitMln)} млн ₽`,
      note: 'сверх вложений, с учётом стоимости роботов на конец срока',
      tone: f.netBenefitMln >= 0 ? 'good' : 'bad',
    },
  ];

  const verdict = pays
    ? `Выгодно: ${perRuble !== null ? `каждый вложенный рубль за ${horizon} ${yearsWord(horizon)} возвращает ${mln(perRuble)} ₽` : 'вложения окупаются в горизонте расчёта'}${f.npvMln >= 0 ? ', и проект выгоднее, чем держать деньги под процент' : ''}.`
    : `Пока невыгодно: роботы обходятся дороже работы, которую заменяют. Подсказки ниже — что снизить, чтобы проект окупился.`;

  return (
    <div className="rounded-[16px] border border-[#E5E5EA] bg-white p-4 sm:p-5">
      <div className="text-[12.5px] font-medium text-[#6E6E73]">Коротко, без терминов</div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        {steps.map((step, i) => (
          <li key={step.label} className="contents">
            <div className="min-w-0 rounded-[12px] bg-[#F7F7F8] p-3">
              <div className="text-[12px] font-medium text-[#6E6E73]">{step.label}</div>
              <div
                className={cn(
                  'mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]',
                  step.tone === 'bad' ? 'text-[#D03B3B]' : step.tone === 'good' ? 'text-[#1F7A4D]' : 'text-foreground',
                )}
              >
                {step.value}
              </div>
              <div className="mt-1 text-[11.5px] leading-snug text-[#8E8E93]">{step.note}</div>
            </div>
            {i < steps.length - 1 ? (
              <span className="hidden place-items-center text-[#C7C7CC] lg:grid" aria-hidden>
                <ArrowRight className="size-4" strokeWidth={2} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[13.5px] leading-snug text-foreground">{verdict}</p>
    </div>
  );
}
