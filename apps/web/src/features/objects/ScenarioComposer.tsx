import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { fleetKindOf, fleetModelOf } from '@domain/fleet';
import { isPassiveCarrier, SLOT_KINDS, SLOTS, TRANSPORT_SLOTS, type SlotId } from '@domain/warehouseEconomics';
import { useScenarioVariants } from '@/api/queries';
import type { Assignment, ScenarioVariant, SelectionItem, Solution } from '@/api/types';
import { useWizardStore } from '@/app/store';
import { areaOf, layoutParameters } from '@/features/objects/layout/warehouseLayout';
import { WizardHint } from '@/features/objects/WizardHint';
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
  previewOpen = false,
  active = true,
  assignRef,
}: {
  rows: Row[];
  pickingSlot: SlotId | null;
  onPickSlot: (slot: SlotId | null) => void;
  onPreview: (id: string) => void;
  /** Превью робота занимает правый слот — подсказку тогда не показываем. */
  previewOpen?: boolean;
  /** Шаг процессов активен: иначе подсказка не порталится на чужие экраны мастера. */
  active?: boolean;
  /** Добавить робота из превью в текущий этап выбора. */
  assignRef?: MutableRefObject<((solutionId: string) => void) | null>;
}) {
  const assignments = useWizardStore((s) => s.assignments);
  const setAssignments = useWizardStore((s) => s.setAssignments);
  const parameters = useWizardStore((s) => s.parameters);
  const layout = useWizardStore((s) => s.layout);
  const [tab, setTab] = useState<Tab>('ready');
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

  const passive = (id: string) => {
    const solution = byId.get(id);
    return solution ? isPassiveCarrier(solution as never) : false;
  };
  const add = (slot: SlotId, solutionId: string) => {
    // Неподходящих объекту в состав не берём — только просмотр в превью.
    const row = rows.find((item) => item.solution.id === solutionId);
    if (row?.item?.status === 'excluded') return;

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
    // Добавляется ровно тот робот, которого выбрали. Транспортировщику без погрузчика
    // этап сам подскажет и предложит подходящий погрузчик одной кнопкой.
    setAssignments([...next, { slot, solutionId }]);
  };

  useEffect(() => {
    if (!assignRef) return;
    assignRef.current = (solutionId: string) => {
      if (!pickingSlot) return;
      add(pickingSlot, solutionId);
      onPickSlot(null);
    };
    return () => {
      assignRef.current = null;
    };
  });

  // Транспортировщик без погрузчика: подходящий погрузчик — лучший по подбору.
  const lifterFor = (slot: SlotId) =>
    rows.find((row) => {
      const id = row.solution.id;
      return (
        row.item?.status !== 'excluded' &&
        kindOf(id) === 'loader' &&
        !passive(id) &&
        fleetModelOf(row.solution as never, 'loader') !== 'storagecube' &&
        !inSlot(slot).some((a) => a.solutionId === id)
      );
    })?.solution ?? null;

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
    const rowView = ({ solution, item }: Row, opts: { selectable: boolean }) => {
      const conveyor = fleetKindOf(solution) === 'conveyor';
      const excluded = item?.status === 'excluded';
      return (
        <div
          key={solution.id}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-[12px] border bg-white px-3 py-2.5',
            chosen.has(solution.id) ? 'border-foreground' : 'border-[#E5E5EA]',
            excluded && 'bg-[#FAFAFA]',
          )}
        >
          <button
            type="button"
            onClick={() => onPreview(solution.id)}
            className="min-w-0 flex-1 text-left"
          >
            <span
              className={cn(
                'block truncate text-[14px] font-semibold leading-tight',
                opts.selectable ? 'text-foreground' : 'text-[#6E6E73]',
              )}
            >
              {conveyor && !/конвейер/i.test(solution.name) ? 'Конвейер · ' : ''}
              {solution.name}
            </span>
            <span
              className={cn(
                'mt-0.5 block truncate text-[12px] leading-snug',
                opts.selectable ? 'text-[#8E8E93]' : 'text-status-danger',
              )}
            >
              {opts.selectable
                ? `${solution.vendor} · ${solution.price} млн ₽${solution.perMeter ? ' за метр' : ''}`
                : (item?.blockers[0] ?? 'Не подходит для объекта')}
            </span>
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
        <div className="grid min-w-0 gap-2">{suitable.map((row) => rowView(row, { selectable: true }))}</div>
        {!suitable.length ? (
          <p className="py-3 text-[12.5px] text-[#8E8E93]">Подходящих объекту роботов для этого этапа в каталоге нет.</p>
        ) : null}
        {excluded.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer py-1 text-[12.5px] font-medium text-[#6E6E73]">
              Не подходят для объекта · {excluded.length}
            </summary>
            <div className="mt-1.5 grid min-w-0 gap-2">
              {excluded.map((row) => rowView(row, { selectable: false }))}
            </div>
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
  /** Уникальные модели состава — те же чипы, что у этапов «Собрать самому». */
  const compositionChips = (list: Assignment[]) => {
    const counts = new Map<string, number>();
    for (const item of list) {
      const name = nameOf(item.solutionId);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  };

  const variantCard = (variant: ScenarioVariant, index: number) => {
    const selected = sameComposition(assignments, variant.assignments);
    const highlight = variant.highlights.find((text) => text !== 'Рекомендуем');
    const chips = compositionChips(variant.assignments);
    const payback = variant.paybackYears === null ? 'не окупается' : `окупаемость ${fmt(variant.paybackYears)} г.`;
    // Как подпись этапа в «Собрать самому»: одна короткая строка под заголовком.
    const meta = [highlight, `экономия ${fmt(variant.savingMln)} млн`, payback, `вложения ${fmt(variant.capexMln)} млн`]
      .filter(Boolean)
      .join(' · ');

    return (
      <div
        key={variant.id}
        className={cn(
          'relative min-w-0 rounded-[12px] border px-3 py-2.5',
          variant.recommended && 'mt-1.5',
          selected ? 'border-foreground' : variant.recommended ? 'border-status-operation' : 'border-[#E5E5EA]',
        )}
      >
        {variant.recommended ? (
          <span className="absolute -top-2 right-2.5 rounded-full bg-status-operation-tint px-2 py-0.5 text-[11px] font-semibold leading-none text-status-operation">
            Рекомендуем
          </span>
        ) : null}

        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-px grid size-5 flex-none place-items-center rounded-full text-[11px] font-semibold',
              selected ? 'bg-foreground text-white' : 'bg-[#F2F2F4] text-[#6E6E73]',
            )}
            aria-hidden
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold leading-tight text-foreground">{variant.title}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-[#8E8E93]">{meta}</div>
          </div>
          <button
            type="button"
            onClick={() => setAssignments(variant.assignments)}
            aria-pressed={selected}
            className={cn(
              'flex flex-none items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-medium',
              selected ? 'bg-foreground text-white' : 'border border-[#E5E5EA] text-foreground hover:border-[#C7C7CC]',
            )}
          >
            {selected ? <Check className="size-3.5" strokeWidth={2.2} aria-hidden /> : null}
            {selected ? 'Выбрано' : 'Выбрать'}
          </button>
        </div>

        {chips.length ? (
          <ul className="mt-2 flex min-w-0 flex-wrap gap-1.5 pl-[30px]">
            {chips.map(({ name, count }) => (
              <li
                key={name}
                className="flex min-w-0 max-w-full items-center rounded-full border border-[#E5E5EA] bg-[#F7F7F8] px-2.5 py-1 text-[12px] leading-none"
              >
                <span className="truncate font-medium text-foreground">{name}</span>
                {count > 1 ? <span className="text-[#8E8E93]"> · ×{count}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  if (tab === 'ready') {
    // Панели мастера остаются смонтированными — без active подсказка торчит на «Какой объект считаем».
    const hintOpen = active && !previewOpen && !pickingSlot;
    const hintTitle = 'Готовые решения';
    const hintBody =
      'Собрали из роботов, которые подходят вашему складу, и посчитали каждый вариант. Выберите один — его можно поправить во вкладке «Собрать самому».';
    return (
      <div className="grid min-w-0 gap-3">
        <WizardHint open={hintOpen} title={hintTitle}>
          {hintBody}
        </WizardHint>
        {tabs}
        {variants.isLoading ? <div className="h-[120px] animate-pulse rounded-[12px] bg-[#F2F2F2]" /> : null}
        {variants.isError ? <p className="text-[12.5px] text-status-danger">Не удалось собрать варианты.</p> : null}
        {variants.data?.length === 0 ? (
          <p className="text-[12.5px] text-[#8E8E93]">
            Готовых вариантов нет: подходящих роботов мало. Соберите состав во вкладке «Собрать самому».
          </p>
        ) : null}
        <div className="grid min-w-0 gap-2">{variants.data?.map((variant, index) => variantCard(variant, index))}</div>
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
                          {!conveyor && carriers.length > 1 && !carriers.some((c) => passive(c.solutionId)) ? (
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
              {transport && carriers.some((a) => passive(a.solutionId)) ? (
                carriers.some((a) => !passive(a.solutionId)) ? (
                  <p className="mt-2 pl-[30px] text-[11.5px] leading-snug text-[#6E6E73]">
                    Транспортировщик везёт паллеты, погрузчик ставит их на него и снимает в стеллаж.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-1.5 pl-[30px]">
                    <p className="text-[11.5px] leading-snug text-status-danger">
                      Транспортировщик сам груз не берёт — нужен погрузчик, иначе перегрузку считаем за операторами.
                    </p>
                    {lifterFor(slot) ? (
                      <button
                        type="button"
                        onClick={() => add(slot, lifterFor(slot)!.id)}
                        className="justify-self-start rounded-[8px] bg-foreground px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
                      >
                        Добавить погрузчик: {lifterFor(slot)!.name}
                      </button>
                    ) : null}
                  </div>
                )
              ) : null}
              {transport && carriers.length === 2 && !carriers.some((a) => passive(a.solutionId)) ? (
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
