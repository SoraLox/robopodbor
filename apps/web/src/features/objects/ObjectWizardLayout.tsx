import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { useWizardStore } from '@/app/store';
import { useObjectTypes } from '@/api/queries';
import { CalculatingStep } from '@/features/objects/CalculatingStep';
import ObjectFormPage from '@/features/objects/ObjectFormPage';
import ObjectSelectPage from '@/features/objects/ObjectSelectPage';
import ProcessesPage from '@/features/objects/ProcessesPage';
import { TYPE_TITLE_GENITIVE } from '@/features/objects/objectTypeMeta';
import { WizardCard, WIZARD_EXPAND_MS } from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

/** Длительность fade контента — сначала уходит старый, потом входит новый. */
const FADE_MS = 320;
const FADE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Step = 'select' | 'form' | 'processes' | 'calculating';

function stepFromRoute(isForm: boolean, isProcesses: boolean, isCalculating: boolean): Step {
  if (isCalculating) return 'calculating';
  if (isProcesses) return 'processes';
  if (isForm) return 'form';
  return 'select';
}

function formObjectLabel(objectType: string, fallbackTitle: string): string {
  return TYPE_TITLE_GENITIVE[objectType] ?? fallbackTitle;
}

function titleFor(step: Step, objectType: string, objectTitle: string): string {
  if (step === 'calculating') return 'Считаем экономику';
  if (step === 'processes') return 'Роботы для вашего объекта';
  if (step === 'form') return `Параметры ${formObjectLabel(objectType, objectTitle)}`;
  return 'Какой объект считаем?';
}

function subtitleFor(step: Step): ReactNode {
  if (step === 'calculating') return null;
  if (step === 'processes') return null;
  if (step === 'form') return null;
  return (
    <p className="text-[13px] leading-[1.4] text-[#8E8E93]">
      Выберите тип площадки — дальше подстроим вопросы под неё.
    </p>
  );
}

function applyStepFlags(
  step: Step,
  set: {
    setSelectOn: (v: boolean) => void;
    setFormOn: (v: boolean) => void;
    setProcessesOn: (v: boolean) => void;
    setCalculatingOn: (v: boolean) => void;
  },
) {
  set.setSelectOn(step === 'select');
  set.setFormOn(step === 'form');
  set.setProcessesOn(step === 'processes');
  set.setCalculatingOn(step === 'calculating');
}

/**
 * Layout мастера: select → form → processes → calculating.
 * Клики всегда по текущему route-шагу; opacity анимируется отдельно.
 */
export function ObjectWizardLayout() {
  const navigate = useNavigate();
  const { objectType: routeType = 'warehouse' } = useParams<{ objectType: string }>();
  const storeType = useWizardStore((s) => s.objectType);
  const { data: types } = useObjectTypes();
  const isForm = Boolean(useMatch('/calculate/:objectType/form'));
  const isProcesses = Boolean(useMatch('/calculate/:objectType/processes'));
  const isCalculating = Boolean(useMatch('/calculate/:objectType/calculating'));

  const objectType = storeType ?? routeType;
  const objectTitle = types?.find((t) => t.slug === objectType)?.title ?? objectType;
  const step = stepFromRoute(isForm, isProcesses, isCalculating);
  const activeStep = step === 'calculating' ? 3 : step === 'processes' ? 2 : step === 'form' ? 1 : 0;

  const [selectOn, setSelectOn] = useState(step === 'select');
  const [formOn, setFormOn] = useState(step === 'form');
  const [processesOn, setProcessesOn] = useState(step === 'processes');
  const [calculatingOn, setCalculatingOn] = useState(step === 'calculating');
  const [wide, setWide] = useState(step === 'form');
  const [heading, setHeading] = useState(() => titleFor(step, objectType, objectTitle));
  const [subtitle, setSubtitle] = useState<ReactNode>(() => subtitleFor(step));

  const prevStep = useRef<Step | null>(null);
  const objectTitleRef = useRef(objectTitle);
  const objectTypeRef = useRef(objectType);
  const runId = useRef(0);
  const processesBackRef = useRef<(() => boolean) | null>(null);
  objectTitleRef.current = objectTitle;
  objectTypeRef.current = objectType;

  const flagSetters = { setSelectOn, setFormOn, setProcessesOn, setCalculatingOn };

  useEffect(() => {
    if (prevStep.current === null) {
      prevStep.current = step;
      setHeading(titleFor(step, objectTypeRef.current, objectTitleRef.current));
      setSubtitle(subtitleFor(step));
      applyStepFlags(step, flagSetters);
      setWide(step === 'form');
      return;
    }
    if (prevStep.current === step) return;

    const from = prevStep.current;
    const myRun = ++runId.current;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      prevStep.current = step;
      applyStepFlags(step, flagSetters);
      setWide(step === 'form');
      setHeading(titleFor(step, objectTypeRef.current, objectTitleRef.current));
      setSubtitle(subtitleFor(step));
      return;
    }

    const nextWide = step === 'form';
    const widthChanges = (from === 'form') !== (step === 'form');
    const nextHeading = titleFor(step, objectTypeRef.current, objectTitleRef.current);
    const nextSubtitle = subtitleFor(step);

    setSelectOn(false);
    setFormOn(false);
    setProcessesOn(false);
    setCalculatingOn(false);
    if (!nextSubtitle) setSubtitle(null);

    const timers: number[] = [];

    const reveal = () => {
      if (runId.current !== myRun) return;
      prevStep.current = step;
      applyStepFlags(step, flagSetters);
    };

    if (widthChanges) {
      timers.push(
        window.setTimeout(() => {
          if (runId.current !== myRun) return;
          setWide(nextWide);
          setHeading(nextHeading);
          setSubtitle(nextSubtitle);
        }, FADE_MS),
      );
      timers.push(window.setTimeout(reveal, FADE_MS + WIZARD_EXPAND_MS));
    } else {
      timers.push(
        window.setTimeout(() => {
          if (runId.current !== myRun) return;
          setHeading(nextHeading);
          setSubtitle(nextSubtitle);
          reveal();
        }, FADE_MS),
      );
    }

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
    // flagSetters стабильны по смыслу (setState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step === 'form') {
      setHeading(titleFor('form', objectType, objectTitle));
    }
  }, [objectTitle, objectType, step]);

  const onBack = () => {
    if (step === 'processes' && processesBackRef.current?.()) return;
    if (step === 'calculating') navigate(`/calculate/${objectType}/processes`);
    else if (step === 'processes') navigate(`/calculate/${objectType}/form`);
    else if (step === 'form') navigate(`/calculate/${objectType}`);
    else navigate(-1);
  };

  return (
    <WizardCard activeStep={activeStep} expanded={wide} onBack={onBack} title={heading} subtitle={subtitle}>
      <WizardPane active={step === 'select'} visible={selectOn}>
        <ObjectSelectPage />
      </WizardPane>
      <WizardPane active={step === 'form'} visible={formOn}>
        <ObjectFormPage showTitleImport={step === 'form'} />
      </WizardPane>
      <WizardPane active={step === 'processes'} visible={processesOn}>
        <ProcessesPage active={step === 'processes'} backRef={processesBackRef} />
      </WizardPane>
      <WizardPane active={step === 'calculating'} visible={calculatingOn}>
        <CalculatingStep active={step === 'calculating'} revealed={calculatingOn} />
      </WizardPane>
    </WizardCard>
  );
}

const FADE_STYLE = {
  transitionProperty: 'opacity',
  transitionDuration: `${FADE_MS}ms`,
  transitionTimingFunction: FADE_EASE,
} as const;

/**
 * active — клики по route; панель сверху и всегда pointer-events-auto.
 * visible — только opacity для fade.
 */
function WizardPane({
  active,
  visible,
  children,
}: {
  active: boolean;
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col',
        visible ? 'opacity-100' : 'opacity-0',
        active ? 'z-[1] pointer-events-auto' : 'z-0 pointer-events-none',
      )}
      style={FADE_STYLE}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

export default ObjectWizardLayout;
