import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { SlotId } from '@domain/warehouseEconomics';
import { ScenarioComposer } from '@/features/objects/ScenarioComposer';
import { useSelection, useSolutions } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import type { SelectionItem, Solution } from '@/api/types';
import { getFitTone } from '@/features/catalog/fitTone';
import { predecodePreviewImages } from '@/features/objects/previewImages';
import { groupByProcess, robotsCount, type RobotGroup } from '@/features/objects/processGroups';
import { SolutionPreviewCard } from '@/features/objects/SolutionPreviewCard';
import { WizardHint } from '@/features/objects/WizardHint';
import { useWizardCompanion, useWizardEnter } from '@/features/objects/wizardCompanion';
import {
  wizardCardHeightPx,
  WIZARD_COMPANION_ID,
  WIZARD_COMPANION_SHADOW,
  WIZARD_PREVIEW_EASE,
  WIZARD_PREVIEW_MS,
  WIZARD_RAIL_ID,
  WIZARD_WIDTH_RAIL,
} from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

/**
 * Контент шага 3 внутри WizardCard (без собственной оболочки).
 * Рейка категорий и превью порталятся в слоты рядом с карточкой.
 */
function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

interface Row {
  solution: Solution;
  item: SelectionItem | undefined;
}

/** Узкая серая карточка категорий — слот слева раскрывает её из края основной. */
function CategoryRail({
  open,
  groups,
  activeId,
  onSelect,
}: {
  open: boolean;
  groups: RobotGroup<Row>[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [height, setHeight] = useState(wizardCardHeightPx);
  const { setRailOpen, setRailWidth } = useWizardCompanion();
  const entered = useWizardEnter(open, setRailOpen);
  useLayoutEffect(() => {
    if (open) setRailWidth(WIZARD_WIDTH_RAIL);
  }, [open, setRailWidth]);

  useLayoutEffect(() => {
    const sync = () => setHeight(wizardCardHeightPx());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  return (
    <div aria-hidden={!open} inert={open ? undefined : true} className="pointer-events-none absolute right-0 top-0">
      <aside
        aria-label="Категории автоматизации"
        className="pointer-events-auto relative flex flex-col overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white motion-reduce:!transition-none"
        style={{
          boxShadow: WIZARD_COMPANION_SHADOW,
          width: WIZARD_WIDTH_RAIL,
          height,
          opacity: entered ? 1 : 0,
          transform: entered ? 'translate3d(0,0,0)' : 'translate3d(24px,0,0)',
          transition: `transform ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}, opacity ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}`,
        }}
      >
        <nav
          className="category-rail-scroll flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto p-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {groups.map((entry) => {
            const Icon = entry.icon;
            const active = entry.id === activeId;
            return (
              <button
                key={entry.id}
                type="button"
                title={entry.title}
                aria-label={entry.title}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(entry.id)}
                className={cn(
                  // 48 + padding 8×2 = 64 — ровно по ширине рейки, без перекоса.
                  'flex size-12 flex-none items-center justify-center rounded-[10px] border transition-colors duration-150',
                  active
                    ? 'border-primary-bright bg-primary-bright/[0.08] text-primary-bright'
                    : 'border-transparent text-[#8E8E93] hover:bg-[#F2F2F2] hover:text-foreground',
                )}
              >
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

function SolutionRow({
  solution,
  item,
  selected,
  onSelect,
}: {
  solution: Solution;
  item: SelectionItem | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const excluded = item?.status === 'excluded';
  const score = excluded ? undefined : (item?.score ?? solution.score);
  const tone = score !== undefined ? getFitTone(score) : null;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors duration-100',
        selected ? 'border-foreground' : 'border-[#E5E5EA] hover:border-[#C7C7CC]',
        excluded && !selected && 'bg-[#FAFAFA]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[14px] font-semibold leading-tight',
            excluded ? 'text-[#6E6E73]' : 'text-foreground',
          )}
        >
          {solution.name}
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-[12px] leading-snug',
            excluded ? 'text-status-danger' : item?.status === 'needs-review' ? 'text-status-piloting' : 'text-[#8E8E93]',
          )}
        >
          {excluded
            ? item?.blockers[0]
            : item?.status === 'needs-review'
              ? `Требует проверки · ${solution.vendor}`
              : solution.vendor}
        </span>
      </span>

      <span className="flex flex-none flex-col items-end gap-0.5">
        {score !== undefined ? (
          <span className={cn('text-[15px] font-semibold tabular-nums leading-none', tone?.text)}>
            {score}
          </span>
        ) : null}
        <span className="text-[11px] tabular-nums leading-none text-[#8E8E93]">
          {solution.price} млн ₽
        </span>
      </span>
    </button>
  );
}

function GroupRow({
  icon: Icon,
  title,
  hint,
  rows,
  onOpen,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  rows: Row[];
  onOpen: () => void;
}) {
  const suitable = rows.filter((row) => row.item?.status === 'recommended').length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 items-center gap-3 rounded-[12px] border border-[#E5E5EA] bg-white px-3 py-2.5 text-left transition-colors duration-100 hover:border-[#C7C7CC]"
    >
      {Icon ? (
        <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-[#F2F2F2] text-foreground">
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] leading-snug text-[#8E8E93]">
          {hint ? `${hint} · ` : ''}
          {robotsCount(rows.length)}
          {suitable ? ` · подходят ${suitable}` : ''}
        </span>
      </span>
      <ChevronRight className="size-4 flex-none text-[#C7C7CC]" strokeWidth={2} aria-hidden />
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-2 text-[15px] font-semibold leading-tight text-foreground">{children}</h3>;
}

function RowSkeleton() {
  return <div className="h-[52px] animate-pulse rounded-[12px] bg-[#F2F2F2]" />;
}

export function ProcessesPage({
  active = true,
  backRef,
}: {
  active?: boolean;
  /** true — назад обработан внутри шага; false — уходим на форму. */
  backRef?: MutableRefObject<(() => boolean) | null>;
} = {}) {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const { data: solutions, isLoading: solutionsLoading } = useSolutions(objectType);
  const parameters = useWizardStore((s) => s.parameters);
  const { data: selection, isLoading: selectionLoading } = useSelection(objectType, parameters);
  const isLoading = solutionsLoading || selectionLoading;
  const setSolutionId = useWizardStore((s) => s.setSolutionId);
  // Склад считает набор роботов — по одному на флот; другие объекты — одного робота.
  const isWarehouse = objectType === 'warehouse';
  const assignments = useWizardStore((s) => s.assignments);
  const [pickingSlot, setPickingSlot] = useState<SlotId | null>(null);
  const assignRef = useRef<((solutionId: string) => void) | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  // Путь выбора: процесс → подкатегория (если их несколько) → робот.
  const [groupId, setGroupId] = useState<string | null>(null);
  const [subgroupId, setSubgroupId] = useState<string | null>(null);
  /** Робот для расчёта (не склад). Превью — отдельно, чтобы «Подробнее» у excluded не выбирало его. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [companion, setCompanion] = useState<HTMLElement | null>(null);
  const [railSlot, setRailSlot] = useState<HTMLElement | null>(null);

  const ordered = useMemo(() => {
    const byId = new Map((solutions ?? []).map((solution) => [solution.id, solution]));
    return selection
      ? selection.items.flatMap((item): Row[] => {
          const solution = byId.get(item.solutionId);
          return solution ? [{ solution, item }] : [];
        })
      : [...byId.values()]
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .map((solution): Row => ({ solution, item: undefined }));
  }, [solutions, selection]);
  const groups = useMemo(() => groupByProcess(objectType, ordered), [objectType, ordered]);
  const group = groups.find((entry) => entry.id === groupId) ?? null;
  const hasSubgroups = (group?.subgroups.length ?? 0) > 1;
  const subgroup = group?.subgroups.find((entry) => entry.id === subgroupId) ?? null;
  // Роботы видны, когда выбран процесс без подкатегорий или конкретная подкатегория.
  const visibleRows = group ? (hasSubgroups ? (subgroup?.rows ?? null) : group.rows) : null;
  const suitable = (visibleRows ?? []).filter((row) => row.item?.status !== 'excluded');
  const excluded = (visibleRows ?? []).filter((row) => row.item?.status === 'excluded');
  const rows = useMemo(() => ordered.map((row) => row.solution), [ordered]);
  const menuOpen = Boolean(group) && active;

  useEffect(() => {
    setGroupId(null);
    setSubgroupId(null);
  }, [objectType]);

  const openGroup = (id: string) => {
    if (id !== groupId) {
      setSelectedId(null);
      setPreviewId(null);
      setPreviewOpen(false);
    }
    setGroupId(id);
    setSubgroupId(null);
    setShowExcluded(false);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewId(null);
  };

  // Один «Назад» в шапке карточки: превью → подкатегория → категория → форма.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (!active) return false;
      if (previewOpen) {
        closePreview();
        return true;
      }
      if (pickingSlot) {
        setPickingSlot(null);
        closePreview();
        return true;
      }
      if (subgroupId) {
        setSubgroupId(null);
        setShowExcluded(false);
        return true;
      }
      if (groupId) {
        setGroupId(null);
        setSelectedId(null);
        setShowExcluded(false);
        return true;
      }
      return false;
    };
    return () => {
      backRef.current = null;
    };
  }, [active, backRef, previewOpen, subgroupId, groupId, pickingSlot]);

  useLayoutEffect(() => {
    setCompanion(document.getElementById(WIZARD_COMPANION_ID));
    setRailSlot(document.getElementById(WIZARD_RAIL_ID));
  }, []);

  useEffect(() => {
    if (!active) {
      closePreview();
      setSelectedId(null);
    }
  }, [active]);

  useEffect(() => {
    if (active) predecodePreviewImages(rows);
  }, [active, rows]);

  const selectedItem = selection?.items.find((item) => item.solutionId === selectedId) ?? null;
  const previewSolution = rows.find((row) => row.id === previewId) ?? null;
  const previewItem = selection?.items.find((item) => item.solutionId === previewId) ?? null;

  /** Превью; select — выбрать для расчёта (не для excluded и не для склада-состава). */
  const openPreview = (id: string, opts: { select?: boolean } = {}) => {
    if (previewOpen && previewId === id) {
      closePreview();
      return;
    }
    setPreviewId(id);
    setPreviewOpen(true);
    if (opts.select === false || isWarehouse) return;
    const item = selection?.items.find((entry) => entry.solutionId === id);
    if (item?.status === 'excluded') return;
    setSelectedId(id);
  };

  const excludedInSelection = useMemo(() => {
    if (isWarehouse) {
      for (const assignment of assignments) {
        const item = selection?.items.find((entry) => entry.solutionId === assignment.solutionId);
        if (item?.status === 'excluded') return item;
      }
      return null;
    }
    return selectedItem?.status === 'excluded' ? selectedItem : null;
  }, [isWarehouse, assignments, selection, selectedItem]);

  const canCalculate = isWarehouse ? assignments.length > 0 : Boolean(selectedId);
  const goCalculate = () => {
    if (isWarehouse) {
      if (!assignments.length) return;
    } else {
      if (!selectedId) return;
      setSolutionId(selectedId);
    }
    closePreview();
    navigate(`/calculate/${objectType}/calculating`);
  };

  const rail =
    railSlot &&
    createPortal(
      <CategoryRail open={menuOpen} groups={groups} activeId={groupId} onSelect={openGroup} />,
      railSlot,
    );

  const alreadyInSlot =
    Boolean(pickingSlot && previewId) &&
    assignments.some((a) => a.slot === pickingSlot && a.solutionId === previewId);
  const canAssignFromPreview =
    Boolean(pickingSlot && previewId) && previewItem?.status !== 'excluded' && !alreadyInSlot;

  // Монтируем превью только когда открыто — иначе useWizardEnter(false) гасит
  // правый слот и прячет подсказки (WizardHintRail).
  const preview =
    companion &&
    active &&
    previewOpen &&
    previewSolution &&
    createPortal(
      <SolutionPreviewCard
        solution={previewSolution}
        selection={previewItem}
        open
        onClose={closePreview}
        action={
          pickingSlot && previewId
            ? {
                label: alreadyInSlot
                  ? 'Уже в составе'
                  : previewItem?.status === 'excluded'
                    ? 'Нельзя добавить'
                    : 'Добавить в состав',
                disabled: !canAssignFromPreview,
                onClick: () => {
                  assignRef.current?.(previewId);
                  closePreview();
                },
              }
            : null
        }
      />,
      companion,
    );

  const listBody = isLoading ? (
    <div className="grid gap-2">
      {[0, 1, 2, 3].map((key) => (
        <RowSkeleton key={key} />
      ))}
    </div>
  ) : rows.length === 0 ? (
    <p className="py-6 text-center text-[13px] text-[#8E8E93]">
      Для этого типа объекта в каталоге пока нет решений.
    </p>
  ) : isWarehouse ? (
    <ScenarioComposer
      rows={ordered}
      pickingSlot={pickingSlot}
      onPickSlot={setPickingSlot}
      previewOpen={previewOpen}
      onPreview={(id) => openPreview(id, { select: false })}
      active={active}
      assignRef={assignRef}
    />
  ) : !group ? (
    <>
      {selection ? (
        <p className="mb-2 text-[12px] leading-snug text-[#8E8E93]">
          По паспорту объекта: подходит {selection.summary.recommended}, требует проверки{' '}
          {selection.summary.needsReview}, не подходит {selection.summary.excluded}
        </p>
      ) : null}
      <p className="mb-2 text-[13px] font-medium text-foreground">Что автоматизируем?</p>
      <div className="grid gap-2">
        {groups.map((entry) => (
          <GroupRow
            key={entry.id}
            icon={entry.icon}
            title={entry.title}
            rows={entry.rows}
            onOpen={() => openGroup(entry.id)}
          />
        ))}
      </div>
    </>
  ) : !visibleRows ? (
    <>
      <SectionTitle>{group.title}</SectionTitle>
      <div className="grid gap-2">
        {group.subgroups.map((entry) => (
          <GroupRow
            key={entry.id}
            title={entry.label}
            rows={entry.rows}
            onOpen={() => {
              setSubgroupId(entry.id);
              setShowExcluded(false);
            }}
          />
        ))}
      </div>
    </>
  ) : (
    <>
      <SectionTitle>{subgroup ? subgroup.label : group.title}</SectionTitle>
      <div className="grid gap-2" role="radiogroup" aria-label="Робот для расчёта">
        {suitable.map(({ solution, item }) => (
          <SolutionRow
            key={solution.id}
            solution={solution}
            item={item}
            selected={solution.id === selectedId}
            onSelect={() => openPreview(solution.id)}
          />
        ))}
      </div>
      {suitable.length === 0 ? (
        <p className="py-3 text-[12.5px] text-[#8E8E93]">По паспорту объекта ни один робот этой группы не подходит.</p>
      ) : null}
      {excluded.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowExcluded((value) => !value)}
            aria-expanded={showExcluded}
            className="flex items-center gap-1 py-1 text-[12.5px] font-medium text-[#6E6E73] hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform duration-150', showExcluded && 'rotate-90')}
              strokeWidth={2}
              aria-hidden
            />
            Не подходят для объекта · {excluded.length}
          </button>
          {showExcluded ? (
            <div className="mt-1.5 grid gap-2">
              {excluded.map(({ solution, item }) => (
                <SolutionRow
                  key={solution.id}
                  solution={solution}
                  item={item}
                  selected={false}
                  onSelect={() => openPreview(solution.id, { select: false })}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const contentKey = isLoading
    ? 'loading'
    : isWarehouse
      ? `composer:${pickingSlot ?? 'root'}`
      : !group
      ? 'root'
      : hasSubgroups && !subgroup
        ? `${group.id}:subs`
        : `${group.id}:${subgroup?.id ?? 'robots'}`;

  // Новый экран списка — с начала, а не с позиции прокрутки прошлого.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [contentKey]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 [scrollbar-width:thin]">
          <div key={contentKey} className="wizard-drill-enter">
            {listBody}
          </div>
        </div>

        <button
          type="button"
          disabled={!canCalculate}
          onClick={goCalculate}
          className="mt-auto flex h-11 w-full flex-none items-center justify-center rounded-[10px] bg-primary-bright text-[14px] font-semibold text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 disabled:bg-[#E5E5EA] disabled:text-[#8E8E93] disabled:opacity-100"
        >
          {isWarehouse && assignments.length ? `Рассчитать состав · ${new Set(assignments.map((a) => a.solutionId)).size}` : 'Рассчитать'}
        </button>
      </div>

      {/* Только если неподходящий реально попал в состав / выбор для расчёта — не при «Подробнее». */}
      <WizardHint
        open={Boolean(active && excludedInSelection && !previewOpen)}
        title="Не прошло подбор"
        tone="danger"
      >
        Решение выбрано вручную и не прошло подбор:{' '}
        {lowerFirst(excludedInSelection?.blockers[0] ?? 'есть ограничения')}. Расчёт покажет ориентир, но на него
        нельзя опираться без обследования.
      </WizardHint>

      {rail}
      {preview}
    </>
  );
}

export default ProcessesPage;
