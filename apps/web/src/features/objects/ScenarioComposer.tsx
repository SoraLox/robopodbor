import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Sparkles, X } from 'lucide-react';
import { fleetKindOf } from '@domain/fleet';
import { SLOT_KINDS, SLOT_LABEL, SLOTS, TRANSPORT_SLOTS, type SlotId } from '@domain/warehouseEconomics';
import { useScenarioVariants } from '@/api/queries';
import type { Assignment, SelectionItem, Solution } from '@/api/types';
import { useWizardStore } from '@/app/store';
import { areaOf, layoutParameters } from '@/features/objects/layout/warehouseLayout';
import { cn } from '@/lib/utils';

/**
 * Состав решения склада: слоты сценария (приёмка, отгрузка, отбор, сортировка,
 * уборка) и роботы в них. На связи приёмки и отгрузки — до трёх транспортных
 * роботов с долями потока и конвейер (инфраструктура связи). Варианты целиком
 * собирает генератор (POST /calculations/scenarios).
 */

interface Row {
  solution: Solution;
  item: SelectionItem | undefined;
}

const SLOT_HINT: Record<SlotId, string> = {
  inbound: 'Паллеты от ворот выгрузки до стеллажей',
  outbound: 'Паллеты со стеллажей к воротам загрузки',
  picking: 'Сборка заказов по строкам',
  sorting: 'Раскладка штук по направлениям',
  cleaning: 'Уборка рабочей зоны',
};

const MAX_CARRIERS = 3;

const fmt = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** Доли транспорта на связи: заданные — как есть, остальным — поровну. */
function carrierShares(list: Assignment[]): number[] {
  const fixed = list.reduce((sum, a) => sum + (a.share ?? 0), 0);
  const free = list.filter((a) => a.share === undefined).length;
  return list.map((a) => a.share ?? (free ? Math.max(0, 1 - fixed) / free : 0));
}

function VariantCard({
  title,
  description,
  capexMln,
  paybackYears,
  tcoMln,
  robots,
  best,
  onTake,
}: {
  title: string;
  description: string;
  capexMln: number;
  paybackYears: number | null;
  tcoMln: number;
  robots: number;
  best?: boolean | undefined;
  onTake: () => void;
}) {
  return (
    <div className={cn('rounded-[12px] border px-3 py-2.5', best ? 'border-status-operation' : 'border-[#E5E5EA]')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight text-foreground">
            {title}
            {best ? (
              <span className="rounded-full bg-status-operation-tint px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-status-operation">
                Выгоднее по TCO
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-[#8E8E93]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onTake}
          className="flex-none rounded-[8px] border border-[#E5E5EA] px-2 py-1 text-[12px] font-medium text-foreground hover:border-[#C7C7CC]"
        >
          Взять
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] tabular-nums text-[#6E6E73]">
        <span>CAPEX {fmt(capexMln)} млн ₽</span>
        <span>окупаемость {paybackYears === null ? '—' : `${fmt(paybackYears)} г.`}</span>
        <span>TCO {fmt(tcoMln)}</span>
        <span>роботов {robots}</span>
      </div>
    </div>
  );
}

export function ScenarioComposer({
  rows,
  pickingSlot,
  onPickSlot,
  onPreview,
}: {
  rows: Row[];
  pickingSlot: SlotId | null;
  onPickSlot: (slot: SlotId | null) => void;
  onPreview: (id: string) => void;
}) {
  const assignments = useWizardStore((s) => s.assignments);
  const setAssignments = useWizardStore((s) => s.setAssignments);
  const parameters = useWizardStore((s) => s.parameters);
  const layout = useWizardStore((s) => s.layout);
  const [showVariants, setShowVariants] = useState(false);
  const scenarioParams = useMemo(
    () => ({ ...parameters, ...layoutParameters(layout, areaOf(parameters)) }),
    [parameters, layout],
  );
  const variants = useScenarioVariants(scenarioParams, showVariants);
  const byId = useMemo(() => new Map(rows.map((row) => [row.solution.id, row.solution])), [rows]);

  const inSlot = (slot: SlotId) => assignments.filter((a) => a.slot === slot && byId.has(a.solutionId));
  const kindOf = (id: string) => {
    const solution = byId.get(id);
    return solution ? fleetKindOf(solution) : null;
  };

  const add = (slot: SlotId, solutionId: string) => {
    const kind = kindOf(solutionId);
    let next = assignments.filter((a) => !(a.slot === slot && a.solutionId === solutionId));
    if (kind === 'conveyor') {
      // Конвейер на связи один — новый заменяет прежний.
      next = next.filter((a) => !(a.slot === slot && kindOf(a.solutionId) === 'conveyor'));
    } else if (TRANSPORT_SLOTS.includes(slot)) {
      const carriers = next.filter((a) => a.slot === slot && kindOf(a.solutionId) !== 'conveyor');
      if (carriers.length >= MAX_CARRIERS) next = next.filter((a) => a !== carriers[0]);
      // Новый робот — поровну с остальными.
      next = next.map((a) => (a.slot === slot ? { slot: a.slot, solutionId: a.solutionId } : a));
    }
    setAssignments([...next, { slot, solutionId }]);
  };

  const remove = (assignment: Assignment) => {
    setAssignments(
      assignments
        .filter((a) => a !== assignment)
        .map((a) => (a.slot === assignment.slot ? { slot: a.slot, solutionId: a.solutionId } : a)),
    );
  };

  // Доля первого из двух транспортных роботов; второй получает остаток.
  const setSplit = (slot: SlotId, first: Assignment, share: number) => {
    setAssignments(
      assignments.map((a) => {
        if (a.slot !== slot || kindOf(a.solutionId) === 'conveyor') return a;
        return a === first ? { ...a, share } : { ...a, share: Math.round((1 - share) * 100) / 100 };
      }),
    );
  };

  if (pickingSlot) {
    const kinds = SLOT_KINDS[pickingSlot];
    const candidates = rows.filter((row) => {
      const kind = fleetKindOf(row.solution);
      return kind !== null && kinds.includes(kind);
    });
    const suitable = candidates.filter((row) => row.item?.status !== 'excluded');
    const excluded = candidates.filter((row) => row.item?.status === 'excluded');
    const chosen = new Set(inSlot(pickingSlot).map((a) => a.solutionId));
    const rowView = ({ solution, item }: Row) => (
      <button
        key={solution.id}
        type="button"
        onClick={() => {
          add(pickingSlot, solution.id);
          onPreview(solution.id);
          onPickSlot(null);
        }}
        className={cn(
          'flex w-full min-w-0 items-center gap-3 rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors duration-100',
          chosen.has(solution.id) ? 'border-foreground' : 'border-[#E5E5EA] hover:border-[#C7C7CC]',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">{solution.name}</span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[12px] leading-snug',
              item?.status === 'excluded' ? 'text-status-danger' : 'text-[#8E8E93]',
            )}
          >
            {item?.status === 'excluded' ? item.blockers[0] : `${solution.vendor}${fleetKindOf(solution) === 'conveyor' ? ' · конвейер' : ''}`}
          </span>
        </span>
        <span className="flex-none text-[11px] tabular-nums text-[#8E8E93]">
          {solution.price} млн ₽{solution.perMeter ? '/м' : ''}
        </span>
      </button>
    );
    return (
      <div>
        <h3 className="mb-0.5 text-[15px] font-semibold leading-tight text-foreground">{SLOT_LABEL[pickingSlot]}</h3>
        <p className="mb-2 text-[12px] text-[#8E8E93]">{SLOT_HINT[pickingSlot]}</p>
        <div className="grid gap-2">{suitable.map(rowView)}</div>
        {!suitable.length ? (
          <p className="py-3 text-[12.5px] text-[#8E8E93]">Подходящих роботов для этого слота в каталоге нет.</p>
        ) : null}
        {excluded.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer py-1 text-[12.5px] font-medium text-[#6E6E73]">
              Не подходят для объекта · {excluded.length}
            </summary>
            <div className="mt-1.5 grid gap-2">{excluded.map(rowView)}</div>
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      <button
        type="button"
        onClick={() => setShowVariants((value) => !value)}
        aria-expanded={showVariants}
        className="flex items-center gap-2 rounded-[12px] border border-dashed border-[#C7C7CC] px-3 py-2.5 text-left text-[13px] font-medium text-foreground hover:border-foreground"
      >
        <Sparkles className="size-4 flex-none text-primary-bright" strokeWidth={1.8} aria-hidden />
        <span className="flex-1">Сгенерировать варианты</span>
        <ChevronRight className={cn('size-4 text-[#C7C7CC] transition-transform', showVariants && 'rotate-90')} aria-hidden />
      </button>

      {showVariants ? (
        <div className="grid min-w-0 gap-2">
          {variants.isLoading ? <div className="h-[84px] animate-pulse rounded-[12px] bg-[#F2F2F2]" /> : null}
          {variants.isError ? <p className="text-[12.5px] text-status-danger">Не удалось собрать варианты.</p> : null}
          {variants.data?.length === 0 ? (
            <p className="text-[12.5px] text-[#8E8E93]">Подходящих объекту роботов для готовых сценариев нет.</p>
          ) : null}
          {variants.data?.map((variant) => (
            <VariantCard
              key={variant.id}
              title={variant.title}
              description={variant.description}
              capexMln={variant.capexMln}
              paybackYears={variant.paybackYears}
              tcoMln={variant.tcoMln}
              robots={variant.robots}
              best={variant.best}
              onTake={() => {
                setAssignments(variant.assignments);
                setShowVariants(false);
              }}
            />
          ))}
        </div>
      ) : null}

      <p className="text-[13px] font-medium text-foreground">Состав решения</p>
      <ol className="grid min-w-0 gap-2">
        {SLOTS.map((slot) => {
          const list = inSlot(slot);
          const carriers = list.filter((a) => kindOf(a.solutionId) !== 'conveyor');
          const shares = carrierShares(carriers);
          const transport = TRANSPORT_SLOTS.includes(slot);
          return (
            <li key={slot} className="min-w-0 rounded-[12px] border border-[#E5E5EA] px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-tight text-foreground">{SLOT_LABEL[slot]}</div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-[#8E8E93]">
                    {list.length ? SLOT_HINT[slot] : transport ? 'Сейчас — люди на погрузчиках' : 'Сейчас — вручную'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPickSlot(slot)}
                  aria-label={`Добавить робота: ${SLOT_LABEL[slot]}`}
                  className="flex size-7 flex-none items-center justify-center rounded-full border border-[#E5E5EA] text-foreground hover:border-[#C7C7CC]"
                >
                  <Plus className="size-3.5" strokeWidth={2.2} aria-hidden />
                </button>
              </div>
              {list.length ? (
                <ul className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                  {list.map((a) => {
                    const solution = byId.get(a.solutionId)!;
                    const conveyor = kindOf(a.solutionId) === 'conveyor';
                    const index = carriers.indexOf(a);
                    return (
                      <li
                        key={`${a.slot}:${a.solutionId}`}
                        className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-[#E5E5EA] bg-[#F7F7F8] py-1 pl-2.5 pr-1 text-[12px] leading-none"
                      >
                        <button
                          type="button"
                          onClick={() => onPreview(a.solutionId)}
                          title={solution.name}
                          className="min-w-0 truncate text-left"
                        >
                          {conveyor ? <span className="text-[#8E8E93]">Конвейер: </span> : null}
                          <span className="font-medium text-foreground">{solution.name}</span>
                          {!conveyor && carriers.length > 1 ? (
                            <span className="text-[#8E8E93]"> · {Math.round((shares[index] ?? 0) * 100)}%</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          aria-label={`Убрать ${solution.name}`}
                          onClick={() => remove(a)}
                          className="flex size-5 flex-none items-center justify-center rounded-full text-[#8E8E93] hover:bg-[#E5E5EA] hover:text-foreground"
                        >
                          <X className="size-3" strokeWidth={2.2} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {transport && carriers.length === 2 ? (
                <label className="mt-2 flex items-center gap-2 text-[11.5px] text-[#6E6E73]">
                  <span className="flex-none">Доля потока</span>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={10}
                    value={Math.round((shares[0] ?? 0.5) * 100)}
                    onChange={(event) => setSplit(slot, carriers[0]!, Number(event.target.value) / 100)}
                    className="min-w-0 flex-1 accent-[#2F86F0]"
                    aria-label={`Доля потока: ${byId.get(carriers[0]!.solutionId)?.name}`}
                  />
                </label>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default ScenarioComposer;
