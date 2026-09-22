import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { useWizardStore } from '@/app/store';
import { useObjectTypes } from '@/api/queries';
import ObjectFormPage from '@/features/objects/ObjectFormPage';
import ObjectSelectPage from '@/features/objects/ObjectSelectPage';
import ProcessesPage from '@/features/objects/ProcessesPage';
import { TYPE_TITLE_GENITIVE } from '@/features/objects/objectTypeMeta';
import { WizardCard, WIZARD_EXPAND_MS } from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

/** Длительность fade контента — сначала уходит старый, потом входит новый. */
const FADE_MS = 320;
const FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Step = 'select' | 'form' | 'processes';

function stepFromRoute(isForm: boolean, isProcesses: boolean): Step {
  if (isProcesses) return 'processes';
  if (isForm) return 'form';
  return 'select';
}

function formObjectLabel(objectType: string, fallbackTitle: string): string {
  return TYPE_TITLE_GENITIVE[objectType] ?? fallbackTitle;
}

function titleFor(step: Step, objectType: string, objectTitle: string): string {
  if (step === 'processes') return 'Роботы для вашего объекта';
  if (step === 'form') return `Параметры ${formObjectLabel(objectType, objectTitle)}`;
  return 'Какой объект считаем?';
}

function subtitleFor(step: Step): ReactNode {
  if (step === 'processes') {
    return (
      <p className="text-[13px] leading-[1.4] text-[#8E8E93]">
        Нажмите на решение — справа откроется карточка с деталями.
      </p>
    );
  }
  if (step === 'form') return null;
  return (
    <p className="text-[13px] leading-[1.4] text-[#8E8E93]">
      Выберите тип площадки — дальше подстроим вопросы под неё.
    </p>
  );
}

/**
 * Layout мастера: select → form → processes.
 * Переход: fade-out → разъезд/сжатие ширины → fade-in.
 * Список роботов — узкая карточка, как выбор объекта; широкая только форма.
 */
export function ObjectWizardLayout() {
  const navigate = useNavigate();
  const { objectType: routeType = 'warehouse' } = useParams<{ objectType: string }>();
  const storeType = useWizardStore((s) => s.objectType);
  const { data: types } = useObjectTypes();
  const isForm = Boolean(useMatch('/calculate/:objectType/form'));
  const isProcesses = Boolean(useMatch('/calculate/:objectType/processes'));

  const objectType = storeType ?? routeType;
  const objectTitle = types?.find((t) => t.slug === objectType)?.title ?? objectType;
  const step = stepFromRoute(isForm, isProcesses);
  const activeStep = step === 'processes' ? 2 : step === 'form' ? 1 : 0;

  const [selectOn, setSelectOn] = useState(step === 'select');
  const [formOn, setFormOn] = useState(step === 'form');
  const [processesOn, setProcessesOn] = useState(step === 'processes');
  const [wide, setWide] = useState(step === 'form');
  const [heading, setHeading] = useState(() => titleFor(step, objectType, objectTitle));
  const [subtitle, setSubtitle] = useState<ReactNode>(() => subtitleFor(step));
  const prevStep = useRef<Step | null>(null);
  const objectTitleRef = useRef(objectTitle);
  const objectTypeRef = useRef(objectType);
  objectTitleRef.current = objectTitle;
  objectTypeRef.current = objectType;

  useEffect(() => {
    if (prevStep.current === null) {
      prevStep.current = step;
      setHeading(titleFor(step, objectTypeRef.current, objectTitleRef.current));
      setSubtitle(subtitleFor(step));
      return;
    }
    if (prevStep.current === step) return;
    const from = prevStep.current;
    prevStep.current = step;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setSelectOn(step === 'select');
      setFormOn(step === 'form');
      setProcessesOn(step === 'processes');
      setWide(step === 'form');
      setHeading(titleFor(step, objectTypeRef.current, objectTitleRef.current));
      setSubtitle(subtitleFor(step));
      return;
    }

    const timers: number[] = [];
    const nextWide = step === 'form';
    const widthChanges = (from === 'form') !== (step === 'form');

    setSelectOn(false);
    setFormOn(false);
    setProcessesOn(false);

    const reveal = () => {
      if (step === 'select') setSelectOn(true);
      else if (step === 'form') setFormOn(true);
      else setProcessesOn(true);
    };

    if (widthChanges) {
      // После fade: заголовок + разъезд/сжатие ширины при пустом теле.
      timers.push(
        window.setTimeout(() => {
          setWide(nextWide);
          setHeading(titleFor(step, objectTypeRef.current, objectTitleRef.current));
          setSubtitle(subtitleFor(step));
        }, FADE_MS),
      );
      // Контент только после полной ширины — fade in на месте.
      timers.push(window.setTimeout(reveal, FADE_MS + WIZARD_EXPAND_MS));
    } else {
      // select ↔ processes: обе узкие — только заголовок и fade
      timers.push(
        window.setTimeout(() => {
          setHeading(titleFor(step, objectTypeRef.current, objectTitleRef.current));
          setSubtitle(subtitleFor(step));
          reveal();
        }, FADE_MS),
      );
    }

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [step]);

  // Заголовок формы зависит от названия типа — обновить без анимации, если уже на форме.
  useEffect(() => {
    if (step === 'form' && formOn) {
      setHeading(titleFor('form', objectType, objectTitle));
    }
  }, [objectTitle, objectType, step, formOn]);

  const onBack = () => {
    if (step === 'processes') navigate(`/calculate/${objectType}/form`);
    else if (step === 'form') navigate(`/calculate/${objectType}`);
    else navigate(-1);
  };

  const fadeStyle = {
    transitionProperty: 'opacity',
    transitionDuration: `${FADE_MS}ms`,
    transitionTimingFunction: FADE_EASE,
  } as const;

  return (
    <WizardCard activeStep={activeStep} expanded={wide} onBack={onBack} title={heading} subtitle={subtitle}>
      <div
        className={cn(
          'absolute inset-0 flex flex-col',
          selectOn ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={fadeStyle}
        aria-hidden={!selectOn}
      >
        <ObjectSelectPage />
      </div>

      <div
        className={cn(
          'absolute inset-0 flex flex-col',
          formOn ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={fadeStyle}
        aria-hidden={!formOn}
      >
        <ObjectFormPage showTitleImport={formOn} />
      </div>

      <div
        className={cn(
          'absolute inset-0 flex flex-col',
          processesOn ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={fadeStyle}
        aria-hidden={!processesOn}
      >
        <ProcessesPage active={processesOn} />
      </div>
    </WizardCard>
  );
}

export default ObjectWizardLayout;
