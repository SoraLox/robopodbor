import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useWizardCompanion, useWizardEnter } from '@/features/objects/wizardCompanion';
import {
  WIZARD_COMPANION_ID,
  WIZARD_COMPANION_SHADOW,
  WIZARD_PREVIEW_EASE,
  WIZARD_PREVIEW_MS,
} from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

/** Ширина развёрнутой плашки-подсказки справа от карточки мастера. */
export const WIZARD_HINT_WIDTH = 288;
/** Диаметр свёрнутого кружка с «?». */
const HINT_FAB_SIZE = 40;
const HINT_MORPH_MS = 420;
const HINT_MORPH_EASE = WIZARD_PREVIEW_EASE;

export type WizardHintTone = 'info' | 'danger';

/**
 * Подсказка мастера: белая плашка как у companion-блоков.
 * Клик по иконке плавно сворачивает в кружок / разворачивает обратно.
 */
function WizardHintCard({
  title,
  children,
  className,
  expanded,
  onToggle,
  tone = 'info',
}: {
  title: string;
  children: ReactNode;
  className?: string;
  expanded: boolean;
  onToggle: () => void;
  tone?: WizardHintTone;
}) {
  const danger = tone === 'danger';
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <aside
      className={cn(
        'pointer-events-auto overflow-hidden border bg-white motion-reduce:!transition-none',
        danger ? 'border-status-danger/25' : 'border-[#E5E5EA]',
        className,
      )}
      style={{
        boxShadow: WIZARD_COMPANION_SHADOW,
        width: expanded ? WIZARD_HINT_WIDTH : HINT_FAB_SIZE,
        borderRadius: expanded ? 20 : HINT_FAB_SIZE,
        transition: `width ${HINT_MORPH_MS}ms ${HINT_MORPH_EASE}, border-radius ${HINT_MORPH_MS}ms ${HINT_MORPH_EASE}`,
      }}
      aria-label={title}
    >
      <div
        className="flex items-start motion-reduce:!transition-none"
        style={{
          gap: expanded ? 12 : 0,
          padding: expanded ? 16 : 0,
          transition: `gap ${HINT_MORPH_MS}ms ${HINT_MORPH_EASE}, padding ${HINT_MORPH_MS}ms ${HINT_MORPH_EASE}`,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть подсказку' : 'Показать подсказку'}
          title={expanded ? 'Свернуть' : title}
          className={cn(
            'grid flex-none place-items-center rounded-full',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
            expanded ? 'mt-0.5 size-8' : 'size-10',
            danger
              ? 'bg-status-danger/10 text-status-danger hover:bg-status-danger/15'
              : 'bg-[#F2F2F4] text-foreground hover:bg-[#E5E5EA]',
            'transition-colors',
          )}
        >
          <Icon className="size-4" strokeWidth={2} aria-hidden />
        </button>
        <div
          className="min-w-0 overflow-hidden motion-reduce:!transition-none"
          style={{
            flex: expanded ? 1 : '0 0 0px',
            opacity: expanded ? 1 : 0,
            maxHeight: expanded ? 280 : 0,
            transition: `opacity ${HINT_MORPH_MS}ms ${HINT_MORPH_EASE}, max-height ${HINT_MORPH_MS}ms ${HINT_MORPH_EASE}`,
          }}
          aria-hidden={!expanded}
        >
          <h2
            className={cn(
              'text-[15px] font-semibold leading-tight',
              danger ? 'text-status-danger' : 'text-foreground',
            )}
          >
            {title}
          </h2>
          <div
            className={cn(
              'mt-1 text-[12px] leading-snug',
              danger ? 'text-status-danger/90' : 'text-[#6E6E73]',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </aside>
  );
}

function WizardHintRail({
  open,
  title,
  children,
  expanded,
  onToggle,
  tone,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  tone: WizardHintTone;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { setCompanionOpen, setCompanionWidth, setCompanionRecenter, companionFits } =
    useWizardCompanion();
  const hintWidth = expanded ? WIZARD_HINT_WIDTH : HINT_FAB_SIZE;

  useLayoutEffect(() => {
    setSlot(document.getElementById(WIZARD_COMPANION_ID));
  }, []);
  useLayoutEffect(() => {
    if (open) {
      setCompanionWidth(hintWidth);
      setCompanionRecenter(false);
    } else {
      setCompanionRecenter(true);
    }
  }, [open, hintWidth, setCompanionWidth, setCompanionRecenter]);
  const entered = useWizardEnter(open && companionFits, setCompanionOpen);

  if (!open || !companionFits || !slot) return null;

  return createPortal(
    <div className="pointer-events-none absolute left-0 top-0">
      <div
        className="motion-reduce:!transition-none"
        style={{
          opacity: entered ? 1 : 0,
          transform: entered ? 'translate3d(0,0,0)' : 'translate3d(24px,0,0)',
          transition: `transform ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}, opacity ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}`,
        }}
      >
        <WizardHintCard title={title} expanded={expanded} onToggle={onToggle} tone={tone}>
          {children}
        </WizardHintCard>
      </div>
    </div>,
    slot,
  );
}

function WizardHintInline({
  open,
  title,
  children,
  expanded,
  onToggle,
  tone,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  tone: WizardHintTone;
}) {
  const { companionFits } = useWizardCompanion();
  if (!open || companionFits) return null;
  return (
    <WizardHintCard title={title} expanded={expanded} onToggle={onToggle} tone={tone}>
      {children}
    </WizardHintCard>
  );
}

/** Подсказка: справа от карточки или в потоке; иконка сворачивает в кружок. */
export function WizardHint({
  open,
  title,
  children,
  tone = 'info',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  tone?: WizardHintTone;
}) {
  const [expanded, setExpanded] = useState(true);
  const toggle = () => setExpanded((value) => !value);

  return (
    <>
      <WizardHintRail open={open} title={title} expanded={expanded} onToggle={toggle} tone={tone}>
        {children}
      </WizardHintRail>
      <WizardHintInline open={open} title={title} expanded={expanded} onToggle={toggle} tone={tone}>
        {children}
      </WizardHintInline>
    </>
  );
}
