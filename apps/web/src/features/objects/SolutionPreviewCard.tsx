import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Maturity, SelectionItem, Solution } from '@/api/types';
import { categorize } from '@/features/catalog/solutionCategory';
import { getFitTone } from '@/features/catalog/fitTone';
import { robotPhoto } from '@/features/objects/previewImages';
import { useWizardCompanion } from '@/features/objects/wizardCompanion';
import {
  wizardCardHeightPx,
  WIZARD_PREVIEW_EASE,
  WIZARD_PREVIEW_MS,
  WIZARD_WIDTH_PREVIEW,
} from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

const PREVIEW_MS = WIZARD_PREVIEW_MS;
const PREVIEW_EASE = WIZARD_PREVIEW_EASE;

/**
 * Вторая карточка мастера: тот же блок (высота, радиус, тень),
 * выезжает справа от списка — не fullscreen-drawer.
 */
export function SolutionPreviewCard({
  solution,
  selection,
  open,
  onClose,
}: {
  solution: Solution | null;
  /** Результат подбора под паспорт объекта: причины, ограничения, недостающие данные. */
  selection?: SelectionItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(wizardCardHeightPx);
  const score = selection && selection.status !== 'excluded' ? selection.score : solution?.score;
  const factors = selection?.factors ?? solution?.scoreFactors;
  const tone = score !== undefined ? getFitTone(score) : null;
  const category = solution ? categorize(solution) : null;
  const photo = solution ? robotPhoto(solution) : undefined;
  const { setCompanionOpen } = useWizardCompanion();

  useEffect(() => {
    setCompanionOpen(open);
    return () => setCompanionOpen(false);
  }, [open, setCompanionOpen]);

  useLayoutEffect(() => {
    const sync = () => setHeight(wizardCardHeightPx());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div aria-hidden={!open} inert={open ? undefined : true}>
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className="relative flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[20px] bg-white motion-reduce:!transition-none"
        style={{
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          width: WIZARD_WIDTH_PREVIEW,
          height,
          opacity: open ? 1 : 0,
          transform: open ? 'translateX(0)' : 'translateX(28px)',
          transition: `transform ${PREVIEW_MS}ms ${PREVIEW_EASE}, opacity ${Math.round(PREVIEW_MS * 0.75)}ms ${PREVIEW_EASE}`,
        }}
      >
        {solution ? (
          <>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-[#F2F2F2] text-foreground transition-colors hover:bg-[#E5E5EA]"
              aria-label="Закрыть"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5 [scrollbar-width:thin]">
              {photo ? (
                <div className="relative overflow-hidden rounded-[14px] border border-[#E5E5EA] bg-white">
                  {/* Фото производителя — предмет на фоне: вписываем целиком, а не обрезаем. */}
                  <img
                    src={photo}
                    alt={solution.name}
                    decoding="async"
                    className="aspect-[16/9] w-full object-contain object-center p-3"
                  />
                  {category ? (
                    <span className="absolute bottom-2.5 left-2.5 rounded-md bg-[#F2F2F2]/90 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
                      {category.label}
                    </span>
                  ) : null}
                </div>
              ) : category ? (
                // Без фото метка категории встаёт в строку с кнопкой закрытия.
                <span className="mr-10 inline-flex rounded-md bg-[#F2F2F2] px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {category.label}
                </span>
              ) : null}

              <div className={cn('flex items-center justify-between gap-3', photo || category ? 'mt-4' : 'mr-10')}>
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8E8E93]">
                  {solution.vendor}
                </span>
                <span className="text-[12px] font-medium text-[#8E8E93]">
                  {MATURITY_LABEL[solution.maturity]}
                </span>
              </div>

              <h2
                id={titleId}
                className="mt-1 text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground"
              >
                {solution.name}
              </h2>
              <p className="mt-1.5 text-[13px] leading-[1.4] text-[#6E6E73]">{solution.useCase}</p>

              {selection ? <SelectionVerdict item={selection} /> : null}

              {score !== undefined && selection?.status !== 'excluded' ? (
                <div className="mt-4 rounded-[12px] bg-[#F7F7F8] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-[#8E8E93]">Соответствие</span>
                    <span
                      className={cn(
                        'text-[20px] font-semibold tabular-nums leading-none',
                        tone?.text,
                      )}
                    >
                      {score}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E5EA]">
                    <div
                      className={cn('h-full rounded-full', tone?.bar)}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  {factors && factors.length > 0 ? (
                    <ul className="mt-3 grid gap-1.5" aria-label="Вклад критериев в балл">
                      {factors.map((factor) => (
                        <li
                          key={factor.label}
                          className="flex items-baseline justify-between gap-3 text-[12px]"
                        >
                          <span className="min-w-0 truncate text-[#6E6E73]">{factor.label}</span>
                          <span className="flex-none tabular-nums font-medium text-foreground">
                            {factor.weight}
                            {factor.max !== undefined ? (
                              <span className="font-normal text-[#8E8E93]"> / {factor.max}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <dl className="mt-4 grid grid-cols-2 gap-2">
                <Spec label="Цена" value={`${solution.price} млн ₽`} />
                <Spec label="Грузоподъёмность" value={solution.payload} />
                <Spec label="Скорость" value={solution.speed} />
                <Spec
                  label="Данные"
                  value={solution.confidence === 'confirmed' ? 'Подтверждены' : 'Проверить'}
                />
              </dl>

              {selection ? <SelectionDetails item={selection} /> : null}

              {solution.source ? (
                <p className="mt-4 text-[11px] leading-snug text-[#8E8E93]">
                  Источник: {solution.source}
                  {solution.sourceDate ? ` · ${solution.sourceDate}` : ''}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[#E5E5EA] px-2.5 py-2">
      <dt className="text-[10px] text-[#8E8E93]">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
        {value}
      </dd>
    </div>
  );
}

const VERDICT: Record<SelectionItem['status'], { label: string; className: string; note: string }> = {
  recommended: {
    label: 'Рекомендовано',
    className: 'bg-status-operation-tint text-status-operation',
    note: 'Ограничения решения проверены по паспорту объекта и выполняются.',
  },
  'needs-review': {
    label: 'Требует проверки',
    className: 'bg-status-piloting-tint text-status-piloting',
    note: 'Часть ограничений не проверить по имеющимся данным — уточните их у поставщика или при обследовании.',
  },
  excluded: {
    label: 'Не подходит',
    className: 'bg-status-danger-tint text-status-danger',
    note: 'Ключевое ограничение делает применение невозможным. Рассчитать можно, но результат будет недостоверным.',
  },
};

function SelectionVerdict({ item }: { item: SelectionItem }) {
  const verdict = VERDICT[item.status];
  return (
    <div className="mt-4">
      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold', verdict.className)}>
        {verdict.label}
      </span>
      <p className="mt-1.5 text-[12px] leading-snug text-[#6E6E73]">{verdict.note}</p>
    </div>
  );
}

function ReasonList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8E8E93]">{title}</h3>
      <ul className="mt-1.5 grid gap-1">
        {items.map((line) => (
          <li key={line} className="flex gap-2 text-[12.5px] leading-snug text-foreground">
            <span className={cn('mt-[7px] size-1.5 flex-none rounded-full', tone)} aria-hidden />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SelectionDetails({ item }: { item: SelectionItem }) {
  return (
    <div className="mt-1">
      <ReasonList title="Почему не подходит" items={item.blockers} tone="bg-status-danger" />
      <ReasonList title="Почему подходит" items={item.reasons} tone="bg-status-operation" />
      <ReasonList title="Ограничения" items={item.limitations} tone="bg-status-piloting" />
      <ReasonList title="Недостающие данные" items={item.missing} tone="bg-[#C7C7CC]" />
    </div>
  );
}
