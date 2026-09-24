import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WIZARD_STEPS } from '@/features/objects/wizardSteps';
import { cn } from '@/lib/utils';

/** Sync with ObjectWizardLayout fade→width→reveal staging. */
export const WIZARD_EXPAND_MS = 520;
const EXPAND_MS = WIZARD_EXPAND_MS;
const EXPAND_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const WIZARD_WIDTH_SELECT = 380;
/** Ширина формы параметров (единственный широкий шаг) — 3 колонки полей. */
export const WIZARD_WIDTH_FORM = 900;
/** Ширина карточки превью робота рядом со списком. */
export const WIZARD_WIDTH_PREVIEW = 440;

const WIDTH_SELECT = WIZARD_WIDTH_SELECT;
const WIDTH_FORM = WIZARD_WIDTH_FORM;

const HEADER_PX = 56;
const SHELL_PAD_PX = 40;

/** Общая высота карточек мастера — список и превью роботов совпадают. */
export function wizardCardHeightPx(): number {
  if (typeof window === 'undefined') return 560;
  const available = window.innerHeight - HEADER_PX - SHELL_PAD_PX;
  return Math.max(280, Math.min(640, available));
}

export const WIZARD_COMPANION_ID = 'wizard-companion';

/** Подзаголовок с плавным сжатием высоты — разделитель не прыгает. */
function WizardSubtitle({ subtitle }: { subtitle?: ReactNode }) {
  const open = Boolean(subtitle);
  const [held, setHeld] = useState(subtitle);

  useLayoutEffect(() => {
    if (subtitle) setHeld(subtitle);
  }, [subtitle]);

  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: `grid-template-rows ${EXPAND_MS}ms ${EXPAND_EASE}`,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {held ? (
          <div
            className="mt-1"
            style={{
              opacity: open ? 1 : 0,
              transition: `opacity ${EXPAND_MS}ms ${EXPAND_EASE}`,
            }}
            aria-hidden={!open}
          >
            {held}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Оболочка мастера: фиксированная высота во вьюпорте, ширина через CSS-transition.
 * Слот #wizard-companion — для второй карточки (превью) справа от основной.
 */
export function WizardCard({
  activeStep,
  onBack,
  children,
  className,
  bodyClassName,
  expanded = false,
  title,
  subtitle,
}: {
  activeStep: number;
  onBack?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  expanded?: boolean;
  title?: string;
  subtitle?: ReactNode;
}) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const sync = () => {
      const card = cardRef.current;
      if (!card) return;
      card.style.height = `${wizardCardHeightPx()}px`;
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useLayoutEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  const height = wizardCardHeightPx();
  const width = expanded ? WIDTH_FORM : WIDTH_SELECT;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center overflow-hidden bg-[#F2F2F2] px-4 py-5">
      <div className="flex w-full max-w-full items-stretch justify-center">
        <div
          ref={cardRef}
          className={cn('flex max-h-full flex-col overflow-hidden rounded-[20px] bg-white', className)}
          style={{
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            width,
            maxWidth: '100%',
            height,
            transition: `width ${EXPAND_MS}ms ${EXPAND_EASE}`,
          }}
        >
          <div className="flex flex-none items-center justify-between px-7 pt-5">
            <button
              type="button"
              onClick={onBack ?? (() => navigate(-1))}
              className="text-[13px] font-medium text-[#8E8E93] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            >
              Назад
            </button>

            <div
              className="flex items-center gap-1"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={WIZARD_STEPS.length}
              aria-valuenow={activeStep + 1}
              aria-label={`Шаг ${activeStep + 1} из ${WIZARD_STEPS.length}`}
            >
              {WIZARD_STEPS.map((step, index) => (
                <span
                  key={step.id}
                  className={cn(
                    'h-[2.5px] w-6 rounded-full transition-colors duration-300',
                    index === activeStep ? 'bg-foreground' : 'bg-[#E5E5EA]',
                  )}
                />
              ))}
            </div>
          </div>

          <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden px-7 pb-3 pt-3', bodyClassName)}>
            {title ? (
              <header className="flex flex-none items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
                    {title}
                  </h1>
                  <WizardSubtitle subtitle={subtitle} />
                </div>
                <div
                  id="wizard-title-action"
                  className="flex h-7 flex-none items-center justify-center overflow-hidden"
                  style={{
                    width: expanded ? 28 : 0,
                    transition: `width ${EXPAND_MS}ms ${EXPAND_EASE}`,
                  }}
                />
              </header>
            ) : null}

            {/* Одна линия на все шаги — иначе у select/form/processes свои и они «съезжают». */}
            {title ? <div className="mt-3.5 flex-none border-t border-accent-tint" /> : null}

            <div className="relative mt-3.5 min-h-0 flex-1">{children}</div>
          </div>
        </div>

        {/* Превью робота порталится сюда — рядом с основной карточкой */}
        <div id={WIZARD_COMPANION_ID} className="flex items-stretch" />
      </div>
    </div>
  );
}
