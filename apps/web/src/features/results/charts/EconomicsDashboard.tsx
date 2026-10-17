import type { CalculationResult } from '@/api/types';
import { CashFlowChart } from './CashFlowChart';
import { CostStructureChart, FinanceKpis, OpexLeversChart, SensitivityTornado, TcoCompareChart } from './EconomicsCharts';

/**
 * Экономика проекта — открыта сразу под сценой, без кликов по категориям:
 * главный показатель и плитки, денежный поток по годам, сравнение сценариев,
 * структура стоимости владения, рычаги OPEX и чувствительность.
 */
export function EconomicsDashboard({ data }: { data: CalculationResult }) {
  const finance = data.finance;
  const horizon = finance ? finance.cashFlow.length - 1 : Number(/\d+/.exec(data.roi.label)?.[0] ?? 5);
  const basePayback = finance?.paybackYears ?? null;
  return (
    <section aria-labelledby="economics-title" className="mb-12 grid gap-3 sm:mb-16">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="economics-title" className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Экономика проекта
        </h2>
        <span className="text-[12.5px] text-[#8E8E93]">{data.meta}</span>
      </div>
      {finance ? <FinanceKpis finance={finance} horizon={horizon} /> : null}
      {finance ? <CashFlowChart finance={finance} /> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <TcoCompareChart scenarios={data.scenarios} horizon={horizon} />
        <CostStructureChart groups={data.costGroups} total={data.totalTco} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.opexLevers?.levers.length ? <OpexLeversChart levers={data.opexLevers} /> : null}
        {data.sensitivity?.length && basePayback !== null ? (
          <SensitivityTornado factors={data.sensitivity} basePayback={basePayback} />
        ) : null}
      </div>
    </section>
  );
}
