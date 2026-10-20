import type { CalculationResult } from '@/api/types';
import { CashFlowChart } from './CashFlowChart';
import { EconomicsStory } from './EconomicsStory';
import { TcoCompareChart } from './EconomicsCharts';

/**
 * Экономика под симуляцией: заголовок + цифры + два главных графика.
 */
export function EconomicsDashboard({ data }: { data: CalculationResult }) {
  const finance = data.finance;
  const horizon = finance ? finance.cashFlow.length - 1 : Number(/\d+/.exec(data.roi.label)?.[0] ?? 5);
  const recommended =
    data.scenarios.find((s) => s.recommended) ?? data.scenarios.find((s) => s.id === 'purchase');
  const schemeLabel =
    recommended?.id === 'raas' ? 'Аренда' : recommended?.id === 'purchase' ? 'Покупка' : recommended?.title;

  return (
    <section aria-labelledby="economics-title" className="mb-12 grid gap-4 sm:mb-16">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id="economics-title" className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Экономика проекта
        </h2>
        {schemeLabel ? (
          <span className="rounded-[8px] bg-[#E8F5EE] px-2.5 py-1 text-[14px] font-semibold leading-none text-[#1F7A4D]">
            {schemeLabel}
          </span>
        ) : null}
      </div>

      <EconomicsStory data={data} />

      {finance || data.scenarios.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <TcoCompareChart scenarios={data.scenarios} horizon={horizon} />
          {finance ? <CashFlowChart finance={finance} /> : null}
        </div>
      ) : null}
    </section>
  );
}
