import { useMemo, useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { fleetKindOf } from '@domain/fleet';
import { SLOT_KINDS, SLOTS, TRANSPORT_SLOTS, type SlotId } from '@domain/warehouseEconomics';
import { useScenarioVariants } from '@/api/queries';
import type { Assignment, ScenarioVariant, SelectionItem, Solution } from '@/api/types';
import { useWizardStore } from '@/app/store';
import { areaOf, layoutParameters } from '@/features/objects/layout/warehouseLayout';
import { cn } from '@/lib/utils';

/**
 * Состав решения склада. Две вкладки:
 *  — «Готовые решения»: варианты генератора (POST /calculations/scenarios) с
 *    составом по этапам и экономикой, выбор — одной кнопкой;
 *  — «Собрать самому»: этапы по ходу груза (приёмка → отгрузка → отбор →
 *    сортировка → уборка), на каждом — свои роботы. На приёмке и отгрузке — до
 *    трёх транспортных роботов с долями потока и конвейер от ворот до стеллажей.
 */

interface Row {
  solution: Solution;
  item: SelectionItem | undefined;
}

const STAGE: Record<SlotId, { title: string; hint: string; fits: string; manual: string }> = {
  inbound: {
    title: 'Приёмка',
    hint: 'Паллеты от ворот выгрузки до стеллажей',
    fits: 'погрузчики, AMR, конвейер от ворот до стеллажей',
    manual: 'Сейчас — водители погрузчиков',
  },
  outbound: {
    title: 'Отгрузка',
    hint: 'Паллеты со стеллажей к воротам загрузки',
    fits: 'погрузчики, AMR, конвейер от стеллажей до ворот',
    manual: 'Сейчас — водители погрузчиков',
  },
  picking: {
    title: 'Отбор',
    hint: 'Сборка заказов по строкам',
    fits: 'манипуляторы и роботизированные ячейки',
    manual: 'Сейчас — отборщики',
  },
  sorting: {
    title: 'Сортировка',
    hint: 'Раскладка штук по направлениям',
    fits: 'сортировочные системы',
    manual: 'Сейчас — вручную',
  },
  cleaning: {
    title: 'Уборка',
    hint: 'Уборка рабочей зоны',
    fits: 'роботы-уборщики',
    manual: 'Сейчас — вручную',
  },
};

const MAX_CARRIERS = 3;

const fmt = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** Доли транспорта на связи: заданные — как есть, остальным — поровну. */
function carrierShares(list: Assignment[]): number[] {
  const fixed = list.reduce((sum, a) => sum + (a.share ?? 0), 0);
  const free = list.filter((a) => a.share === undefined).length;
  return list.map((a) => a.share ?? (free ? Math.max(0, 1 - fixed) / free : 0));
}

const sameComposition = (a: Assignment[], b: Assignment[]) => {
  const key = (list: Assignment[]) =>
    list
      .map((x) => `${x.slot}:${x.solutionId}`)
      .sort()
      .join('|');
  return a.length > 0 && key(a) === key(b);
};

type Tab = 'ready' | 'custom';

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
  const [tab, setTab] = useState<Tab>(assignments.length ? 'custom' : 'ready');
  const scenarioParams = useMemo(
    () => ({ ...parameters, ...layoutParameters(layout, areaOf(parameters)) }),
    [parameters, layout],
  );
  const variants = useScenarioVariants(scenarioParams, true);
  const byId = useMemo(() => new Map(rows.map((row) => [row.solution.id, row.solution])), [rows]);
  const kindOf = (id: string) => {
    const solution = byId.get(id);
    return solution ? fleetKindOf(solution) : null;
  };
  const inSlot = (slot: SlotId) => assignments.filter((a) => a.slot === slot && byId.has(a.solutionId));

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
    } else {
      // Отбор, сортировка, уборка — один робот на этап.
      next = next.filter((a) => a.slot !== slot);
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

  // ─── Выбор робота для этапа ────────────────────────────────────────────
  if (pickingSlot) {
    const stage = STAGE[pickingSlot];
    const kinds = SLOT_KINDS[pickingSlot];
    const candidates = rows.filter((row) => {
      const kind = fleetKindOf(row.solution);
      return kind !== null && kinds.includes(kind);
    });
    const suitable = candidates.filter((row) => row.item?.status !== 'excluded');
    const excluded = candidates.filter((row) => row.item?.status === 'excluded');
    const chosen = new Set(inSlot(pickingSlot).map((a) => a.solutionId));
    const rowView = ({ solution, item }: Row) => {
      const conveyor = fleetKindOf(solution) === 'conveyor';
      return (
        <div
          key={solution.id}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-[12px] border bg-white px-3 py-2.5',
            chosen.has(solution.id) ? 'border-foreground' : 'border-[#E5E5EA]',
          )}
        >
          <button
            type="button"
            onClick={() => {
              add(pickingSlot, solution.id);
              onPickSlot(null);
            }}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">
              {conveyor && !/конвейер/i.test(solution.name) ? 'Конвейер · ' : ''}
              {solution.name}
            </span>
            <span
              className={cn(
                'mt-0.5 block truncate text-[12px] leading-snug',
                item?.status === 'excluded' ? 'text-status-danger' : 'text-[#8E8E93]',
              )}
            >
              {item?.status === 'excluded'
                ? item.blockers[0]
                : `${solution.vendor} · ${solution.price} млн ₽${solution.perMeter ? ' за метр' : ''}`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPreview(solution.id)}
            className="flex-none text-[12px] font-medium text-[#2F86F0] hover:underline"
          >
            Подробнее
          </button>
        </div>
      );
    };
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onPickSlot(null)}
          className="mb-2 flex items-center gap-1 text-[12.5px] font-medium text-[#6E6E73] hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />К составу
        </button>
        <h3 className="text-[15px] font-semibold leading-tight text-foreground">{stage.title}: выберите робота</h3>
        <p className="mb-2.5 mt-0.5 text-[12px] leading-snug text-[#8E8E93]">
          {stage.hint}. Подходят {stage.fits}.
        </p>
        <div className="grid min-w-0 gap-2">{suitable.map(rowView)}</div>
        {!suitable.length ? (
          <p className="py-3 text-[12.5px] text-[#8E8E93]">Подходящих объекту роботов для этого этапа в каталоге нет.</p>
        ) : null}
        {excluded.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer py-1 text-[12.5px] font-medium text-[#6E6E73]">
              Не подходят для объекта · {excluded.length}
            </summary>
            <div className="mt-1.5 grid min-w-0 gap-2">{excluded.map(rowView)}</div>
          </details>
        ) : null}
      </div>
    );
  }

  // ─── Вкладки ──────────────────────────────────────────────────────────
  const tabs = (
    <div role="tablist" aria-label="Как подобрать роботов" className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#F2F2F4] p-1">
      {(
        [
          ['ready', 'Готовые решения'],
          ['custom', 'Собрать самому'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={cn(
            'h-8 rounded-[8px] text-[13px] font-medium transition-colors',
            tab === id ? 'bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[#6E6E73] hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const nameOf = (id: string) => {
    const solution = byId.get(id);
    if (!solution) return id;
    return fleetKindOf(solution) === 'conveyor' && !/конвейер/i.test(solution.name) ? `конвейер ${solution.name}` : solution.name;
  };
  const compositionLines = (list: Assignment[]) =>
    SLOTS.map((slot) => ({ slot, names: list.filter((a) => a.slot === slot).map((a) => nameOf(a.solutionId)) })).filter(
      (line) => line.names.length,
    );

  const variantCard = (variant: ScenarioVariant) => {
    const selected = sameComposition(assignments, variant.assignments);
    return (
      <div
        key={variant.id}
        className={cn(
          'min-w-0 rounded-[12px] border px-3 py-2.5',
          selected ? 'border-foreground' : variant.best ? 'border-status-operation' : 'border-[#E5E5EA]',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold leading-tight text-foreground">
              {variant.title}
              {variant.best ? (
                <span className="rounded-full bg-status-operation-tint px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-status-operation">
                  Выгоднее всего
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-[#8E8E93]">{variant.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setAssignments(variant.assignments)}
            aria-pressed={selected}
            className={cn(
              'flex h-7 flex-none items-center gap-1 rounded-[8px] px-2 text-[12px] font-medium',
              selected ? 'bg-foreground text-white' : 'border border-[#E5E5EA] text-foreground hover:border-[#C7C7CC]',
            )}
          >
            {selected ? <Check className="size-3.5" strokeWidth={2.2} aria-hidden /> : null}
            {selected ? 'Выбрано' : 'Выбрать'}
          </button>
        </div>
        <ul className="mt-2 grid gap-0.5 text-[11.5px] leading-snug">
          {compositionLines(variant.assignments).map((line) => (
            <li key={line.slot} className="min-w-0">
              <span className="text-[#8E8E93]">{STAGE[line.slot].title}: </span>
              <span className="text-foreground">{line.names.join(' + ')}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] tabular-nums text-[#6E6E73]">
          <span>CAPEX {fmt(variant.capexMln)} млн ₽</span>
          <span>окупаемость {variant.paybackYears === null ? '—' : `${fmt(variant.paybackYears)} г.`}</span>
          <span>TCO {fmt(variant.tcoMln)} млн ₽</span>
        </div>
      </div>
    );
  };

  if (tab === 'ready') {
    return (
      <div className="grid min-w-0 gap-3">
        {tabs}
        <p className="text-[12.5px] leading-snug text-[#6E6E73]">
          Собрали из роботов, которые подходят вашему складу, и посчитали каждый вариант. Выберите один — его можно
          поправить во вкладке «Собрать самому».
        </p>
        {variants.isLoading ? <div className="h-[120px] animate-pulse rounded-[12px] bg-[#F2F2F2]" /> : null}
        {variants.isError ? <p className="text-[12.5px] text-status-danger">Не удалось собрать варианты.</p> : null}
        {variants.data?.length === 0 ? (
          <p className="text-[12.5px] text-[#8E8E93]">
            Готовых вариантов нет: подходящих роботов мало. Соберите состав во вкладке «Собрать самому».
          </p>
        ) : null}
        <div className="grid min-w-0 gap-2">{variants.data?.map(variantCard)}</div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {tabs}
      <ol className="grid min-w-0 gap-2">
        {SLOTS.map((slot, index) => {
          const stage = STAGE[slot];
          const list = inSlot(slot);
          const carriers = list.filter((a) => kindOf(a.solutionId) !== 'conveyor');
          const shares = carrierShares(carriers);
          const transport = TRANSPORT_SLOTS.includes(slot);
          const canAdd = transport || list.length === 0;
          return (
            <li key={slot} className="min-w-0 rounded-[12px] border border-[#E5E5EA] px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-px grid size-5 flex-none place-items-center rounded-full text-[11px] font-semibold',
                    list.length ? 'bg-foreground text-white' : 'bg-[#F2F2F4] text-[#6E6E73]',
                  )}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-tight text-foreground">{stage.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-[#8E8E93]">
                    {list.length ? stage.hint : stage.manual}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPickSlot(slot)}
                  className="flex-none rounded-[8px] border border-[#E5E5EA] px-2 py-1 text-[12px] font-medium text-foreground hover:border-[#C7C7CC]"
                >
                  {!list.length ? 'Выбрать робота' : canAdd ? 'Добавить' : 'Заменить'}
                </button>
              </div>
              {list.length ? (
                <ul className="mt-2 flex min-w-0 flex-wrap gap-1.5 pl-[30px]">
                  {list.map((a) => {
                    const solution = byId.get(a.solutionId)!;
                    const conveyor = kindOf(a.solutionId) === 'conveyor';
                    const i = carriers.indexOf(a);
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
                          {conveyor && !/конвейер/i.test(solution.name) ? (
                            <span className="text-[#8E8E93]">Конвейер: </span>
                          ) : null}
                          <span className="font-medium text-foreground">{solution.name}</span>
                          {!conveyor && carriers.length > 1 ? (
                            <span className="text-[#8E8E93]"> · {Math.round((shares[i] ?? 0) * 100)}%</span>
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
                <label className="mt-2 grid gap-1 pl-[30px] text-[11.5px] text-[#6E6E73]">
                  <span>
                    Поток: {byId.get(carriers[0]!.solutionId)?.name} {Math.round((shares[0] ?? 0.5) * 100)}% ·{' '}
                    {byId.get(carriers[1]!.solutionId)?.name} {Math.round((shares[1] ?? 0.5) * 100)}%
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={10}
                    value={Math.round((shares[0] ?? 0.5) * 100)}
                    onChange={(event) => setSplit(slot, carriers[0]!, Number(event.target.value) / 100)}
                    className="min-w-0 accent-[#2F86F0]"
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
