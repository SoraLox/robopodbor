import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardCompanionContext } from '@/features/objects/wizardCompanion';
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
/** Узкая «менюшка» категорий слева от списка. */
export const WIZARD_WIDTH_RAIL = 64;
const COMPANION_GAP_PX = 12;
/** Компактная тень спутников — без широкого ореола, как у основной карточки. */
export const WIZARD_COMPANION_SHADOW = '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)';
/** Тот же easing, что у разъезда карточки — чуть дольше, чтобы выезд превью читался мягче. */
export const WIZARD_PREVIEW_MS = WIZARD_EXPAND_MS + 80;
export const WIZARD_PREVIEW_EASE = EXPAND_EASE;

const WIDTH_SELECT = WIZARD_WIDTH_SELECT;
const WIDTH_FORM = WIZARD_WIDTH_FORM;

const HEADER_PX = 56;
/** py-8 сверху/снизу + место под тень карточки. */
const SHELL_PAD_PX = 80;

/** Общая высота карточек мастера — список и превью роботов совпадают. */
export function wizardCardHeightPx(): number {
  if (typeof window === 'undefined') return 560;
  const available = window.innerHeight - HEADER_PX - SHELL_PAD_PX;
  return Math.max(280, Math.min(640, available));
}

export const WIZARD_COMPANION_ID = 'wizard-companion';
export const WIZARD_RAIL_ID = 'wizard-rail';

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

const RADIUS_PX = 20;
const CONTENT_PAD_X_PX = 28;
/** Больше сверху/снизу, меньше по бокам (Y-смещения + узкий clip по X у краёв). */
const CARD_SHADOW =
  '0 0 0 1px rgba(0,0,0,0.04), 0 -8px 28px rgba(0,0,0,0.08), 0 10px 28px rgba(0,0,0,0.11)';
const SHADOW_CLIP_Y = 64;
const SHADOW_CLIP_X = 14;
const FLIP_TRANSITION = `transform ${EXPAND_MS}ms ${EXPAND_EASE}`;

/**
 * Фон карточки из трёх частей: скруглённые края двигаются, середина
 * растягивается. Так смену ширины можно проиграть одними transform —
 * без пересчёта вёрстки и перерисовки карточки с тенью на каждом кадре,
 * и без искажения скруглений, как было бы при scaleX всей карточки.
 * Боковые тени обрезаны clip-path, чтобы на стыках не было полос.
 */
function CardSurface() {
  const cap = { width: RADIUS_PX + 1, boxShadow: CARD_SHADOW } as const;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        data-flip="mid"
        className="absolute inset-y-0 bg-white"
        style={{
          left: RADIUS_PX,
          right: RADIUS_PX,
          boxShadow: CARD_SHADOW,
          // Только верх/низ — бока у mid обрезаны на стыках с краями.
          clipPath: `inset(-${SHADOW_CLIP_Y}px 0)`,
        }}
      />
      <div
        data-flip="left"
        className="absolute inset-y-0 left-0 bg-white"
        style={{
          ...cap,
          borderRadius: `${RADIUS_PX}px 0 0 ${RADIUS_PX}px`,
          clipPath: `inset(-${SHADOW_CLIP_Y}px 0 -${SHADOW_CLIP_Y}px -${SHADOW_CLIP_X}px)`,
        }}
      />
      <div
        data-flip="right"
        className="absolute inset-y-0 right-0 bg-white"
        style={{
          ...cap,
          borderRadius: `0 ${RADIUS_PX}px ${RADIUS_PX}px 0`,
          clipPath: `inset(-${SHADOW_CLIP_Y}px -${SHADOW_CLIP_X}px -${SHADOW_CLIP_Y}px 0)`,
        }}
      />
    </div>
  );
}

/**
 * FLIP смены ширины: вёрстка сразу получает конечную ширину, а части карточки
 * стартуют с transform, изображающего старую ширину, и едут к нулю.
 * Левые элементы (край, «Назад», заголовок) — сдвиг, правые — встречный сдвиг,
 * середина фона и разделитель — scaleX от центра.
 */
function playWidthFlip(card: HTMLElement, from: number, to: number) {
  const shift = (to - from) / 2;
  const parts = [...card.querySelectorAll<HTMLElement>('[data-flip]')];
  const clips = [...card.querySelectorAll<HTMLElement>('[data-flip-clip]')];
  const start = (el: HTMLElement) => {
    switch (el.dataset.flip) {
      case 'left':
        return `translateX(${shift}px)`;
      case 'right':
        return `translateX(${-shift}px)`;
      case 'mid':
        return `scaleX(${(from - 2 * RADIUS_PX) / (to - 2 * RADIUS_PX)})`;
      default:
        return `scaleX(${(from - 2 * CONTENT_PAD_X_PX) / (to - 2 * CONTENT_PAD_X_PX)})`;
    }
  };

  for (const el of parts) {
    el.style.transition = 'none';
    el.style.transform = start(el);
  }
  // При сужении левые/правые элементы стартуют за новой границей карточки.
  for (const el of clips) el.style.overflow = 'visible';
  void card.offsetWidth;
  for (const el of parts) {
    el.style.transition = FLIP_TRANSITION;
    el.style.transform = '';
  }

  // Inline transition снимаем только по окончании: у «Назад» свой transition-colors,
  // и ранний сброс оборвал бы сдвиг на полпути.
  let pending = parts.length;
  const release = () => {
    for (const el of clips) el.style.overflow = '';
  };
  const onEnd = (event: TransitionEvent) => {
    const el = event.currentTarget as HTMLElement;
    if (event.target !== el || event.propertyName !== 'transform') return;
    el.style.transition = '';
    el.removeEventListener('transitionend', onEnd);
    el.removeEventListener('transitioncancel', onEnd);
    if (--pending === 0) release();
  };
  for (const el of parts) {
    el.addEventListener('transitionend', onEnd);
    el.addEventListener('transitioncancel', onEnd);
  }
  // Страховка, если какой-то transition не стартовал и события не будет.
  const fallback = window.setTimeout(release, EXPAND_MS * 3);

  return () => {
    window.clearTimeout(fallback);
    release();
    for (const el of parts) {
      el.removeEventListener('transitionend', onEnd);
      el.removeEventListener('transitioncancel', onEnd);
      el.style.transition = '';
      el.style.transform = '';
    }
  };
}

/**
 * Оболочка мастера: фиксированная высота во вьюпорте, смена ширины — FLIP на transform.
 * Слоты companion: превью справа (#wizard-companion), рейка категорий слева (#wizard-rail);
 * оба вне потока, группа центрируется сдвигом.
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
  const renderedWidth = useRef(0);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const companion = useMemo(() => ({ setCompanionOpen, setRailOpen }), []);

  useLayoutEffect(() => {
    const sync = () => {
      const card = cardRef.current;
      if (!card) return;
      card.style.height = `${wizardCardHeightPx()}px`;
      if (renderedWidth.current) renderedWidth.current = card.offsetWidth;
      setViewportWidth(window.innerWidth);
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

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const from = renderedWidth.current;
    const to = card.offsetWidth;
    renderedWidth.current = to;
    if (!from || from === to) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return playWidthFlip(card, from, to);
  }, [width]);

  const previewSpan = WIZARD_WIDTH_PREVIEW + COMPANION_GAP_PX;
  const railSpan = WIZARD_WIDTH_RAIL + COMPANION_GAP_PX;
  const pad = 2 * 16;
  // Рейка узкая — не сдвигаем группу под неё (двойной motion с width/translate давал рывок).
  const previewSideBySide = viewportWidth - pad >= width + previewSpan + (railOpen ? railSpan : 0);
  const railSideBySide = viewportWidth - pad >= width + railSpan;
  const groupShift = companionOpen && previewSideBySide ? -previewSpan / 2 : 0;

  return (
    <WizardCompanionContext.Provider value={companion}>
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center overflow-x-hidden bg-white px-4 py-8">
      <div className="flex w-full max-w-full items-stretch justify-center">
        <div
          className="relative flex max-w-full motion-reduce:!transition-none"
          style={{
            transform: groupShift ? `translateX(${groupShift}px)` : undefined,
            transition: `transform ${WIZARD_PREVIEW_MS}ms ${WIZARD_PREVIEW_EASE}`,
          }}
        >
        {/* Рейка слева: слот всегда полной ширины, выезд — transform на самой карточке */}
        <div
          id={WIZARD_RAIL_ID}
          className={cn(
            'absolute inset-y-0 z-10 flex items-stretch',
            railOpen ? 'pointer-events-auto' : 'pointer-events-none',
            railSideBySide ? 'right-full' : 'left-1/2 -translate-x-1/2',
          )}
          style={railSideBySide ? { marginRight: COMPANION_GAP_PX } : undefined}
        />

        <div
          ref={cardRef}
          className={cn('relative flex max-h-full flex-col', className)}
          style={{ width, maxWidth: 'calc(100vw - 2rem)', height }}
        >
          <CardSurface />
          <div data-flip-clip className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]">
          <div className="flex flex-none items-center justify-between px-7 pt-5">
            <button
              type="button"
              data-flip="left"
              onClick={onBack ?? (() => navigate(-1))}
              className="text-[13px] font-medium text-[#8E8E93] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            >
              Назад
            </button>

            <div
              data-flip="right"
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
                    index === activeStep
                      ? 'bg-primary-bright'
                      : index < activeStep
                        ? 'bg-foreground'
                        : 'bg-[#E5E5EA]',
                  )}
                />
              ))}
            </div>
          </div>

          <div data-flip-clip className={cn('flex min-h-0 flex-1 flex-col overflow-hidden px-7 pb-3 pt-3', bodyClassName)}>
            {title ? (
              <header className="flex flex-none items-start justify-between gap-3">
                <div data-flip="left" className="min-w-0 flex-1">
                  <h1 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
                    {title}
                  </h1>
                  <WizardSubtitle subtitle={subtitle} />
                </div>
                <div data-flip="right" className="flex-none">
                  <div
                    id="wizard-title-action"
                    className="flex h-7 items-center justify-end gap-1 overflow-hidden"
                    style={{
                      width: expanded ? 60 : 0,
                      opacity: expanded ? 1 : 0,
                      transition: `width ${EXPAND_MS}ms ${EXPAND_EASE}, opacity ${EXPAND_MS}ms ${EXPAND_EASE}`,
                    }}
                  />
                </div>
              </header>
            ) : null}

            {/* Одна линия на все шаги — иначе у select/form/processes свои и они «съезжают». */}
            {title ? <div data-flip="line" className="mt-3.5 flex-none border-t border-accent-tint" /> : null}

            <div className="relative mt-3.5 min-h-0 flex-1">{children}</div>
          </div>
          </div>
        </div>

        {/* Превью робота порталится сюда — вне потока, справа от карточки или поверх на узком экране */}
        <div
          id={WIZARD_COMPANION_ID}
          className={cn(
            'absolute inset-y-0 z-10 flex items-stretch',
            // Закрытый слот не должен перехватывать клики по форме (на узком экране он по центру).
            companionOpen ? 'pointer-events-auto' : 'pointer-events-none',
            previewSideBySide ? 'left-full' : 'left-1/2 -translate-x-1/2',
          )}
          style={previewSideBySide ? { marginLeft: COMPANION_GAP_PX } : undefined}
        />
        </div>
      </div>
    </div>
    </WizardCompanionContext.Provider>
  );
}
