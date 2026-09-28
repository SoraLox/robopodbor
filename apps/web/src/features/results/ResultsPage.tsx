import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GitCompareArrows,
  ListTree,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  ScrollText,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { useCalculation, useObjectParameters } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { CostBreakdown } from './CostBreakdown';
import { ObjectParametersList } from './ObjectParametersList';
import { parameterGroups as buildParameterGroups, type ObjectParameterGroup } from './objectParameters';
import { ReportSections, type ReportSection } from './ReportCategory';
import { ScenarioBars } from './ScenarioBars';
import { SensitivityPanel } from './SensitivityPanel';
import { ResultSimulation } from './simulation/ResultSimulation';
import { SIMULATION_ASSUMPTIONS } from './simulation/simulationInput';
import { AIRPORT_ASSUMPTIONS } from './simulation/airportInput';
import { SimPlaybackProvider, useSimPlayback } from './simulation/SimPlaybackContext';
import type { CalculationResult } from '@/api/types';
import { cn, fmt } from '@/lib/utils';

// jspdf + xlsx + html2canvas — около 700 КБ, нужны только по клику «Скачать».
const loadExport = () => import('./export/exportCalculation');

interface ObjectIntro {
  title: string;
  meta: string;
}

/** Заголовок отчёта — из самого расчёта: объект, площадь, решение, смены, горизонт. */
function introOf(data: CalculationResult | undefined): ObjectIntro {
  return { title: data?.objectTitle ?? '', meta: data?.meta ?? '' };
}

/** «5 лет» — горизонт расчёта из группы OPEX («OPEX — расходы за 5 лет»). */
function horizonOf(data: CalculationResult): string {
  const opex = data.costGroups.find((group) => group.id === 'opex')?.title ?? '';
  return opex.match(/за\s(.+)$/)?.[1] ?? 'горизонт расчёта';
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { objectType = 'warehouse', calculationId = 'demo' } = useParams<{
    objectType: string;
    calculationId: string;
  }>();
  const { data, isLoading, isError } = useCalculation(calculationId);
  const intro = introOf(data);
  const { data: fields } = useObjectParameters(objectType);
  const entered = useWizardStore((s) => s.parameters);
  const parameterGroups = fields ? buildParameterGroups(fields, entered) : [];
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const runExport = async (kind: 'pdf' | 'xlsx') => {
    if (!data) return;
    setExporting(kind);
    try {
      const { exportToPdf, exportToXlsx } = await loadExport();
      if (kind === 'pdf') await exportToPdf(data, objectType);
      else await exportToXlsx(data, objectType);
    } finally {
      setExporting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grid min-h-[calc(100dvh-3.5rem)] place-items-center px-[18px]">
        <div className="panel grid min-h-[200px] w-full max-w-site place-items-center p-8">
          <h2 className="text-[17px] font-semibold">Считаем экономику</h2>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-site px-[18px] py-8">
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <TriangleAlert className="size-6 text-status-piloting" strokeWidth={1.8} />
          <p className="text-[14px] text-muted-foreground">
            Не удалось загрузить расчёт. Попробуйте посчитать ещё раз.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/calculate/${objectType}/processes`)}
          >
            Вернуться к процессам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/*
        Hero: симуляция на весь экран. Мини-меню экономики — по сетке шапки,
        внизу слева (gutters px-5/sm:px-8 + max-w-site).
      */}
      <section
        data-testid="visualization-slot"
        className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden"
        aria-label="Симуляция и ключевые показатели"
      >
        <SimPlaybackProvider>
          <div className="absolute inset-0 z-0">
            <ResultSimulation
              objectType={objectType}
              immersive
              {...(data?.robots && data.solutionId ? { planned: { solutionId: data.solutionId, count: data.robots.count } } : {})}
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-20 px-5 sm:px-8">
            <div className="mx-auto flex h-full max-w-site items-end pb-5 sm:pb-6">
              <HeroMetrics
                data={data}
                intro={intro}
                exporting={exporting}
                onExport={runExport}
                onExportHover={() => void loadExport()}
              />
            </div>
          </div>
        </SimPlaybackProvider>
      </section>

      <ReportBelowFold
        data={data}
        intro={intro}
        parameterGroups={parameterGroups}
        simulationAssumptions={objectType === 'airport' ? AIRPORT_ASSUMPTIONS : SIMULATION_ASSUMPTIONS}
        previewId={previewId}
        onSelect={(id) => setPreviewId((current) => (current === id ? null : id))}
        onClosePreview={() => setPreviewId(null)}
      />
    </div>
  );
}

function ReportBelowFold({
  data,
  intro,
  parameterGroups,
  simulationAssumptions,
  previewId,
  onSelect,
  onClosePreview,
}: {
  data: CalculationResult;
  intro: ObjectIntro;
  parameterGroups: ObjectParameterGroup[];
  simulationAssumptions: readonly string[];
  previewId: string | null;
  onSelect: (id: string) => void;
  onClosePreview: () => void;
}) {
  const sections: ReportSection[] = [
    {
      id: 'compare',
      title: 'Сравнение решений',
      summary: compareSummary(data),
      icon: GitCompareArrows,
      content: <ScenarioBars scenarios={data.scenarios} />,
    },
    {
      id: 'costs',
      title: 'Структура затрат',
      summary: `${fmt(data.totalTco)} млн ₽ за ${horizonOf(data)} · сценарий «Покупка»`,
      icon: ListTree,
      content: <CostBreakdown groups={data.costGroups} total={data.totalTco} />,
    },
    ...(data.sensitivity?.length
      ? [
          {
            id: 'sensitivity',
            title: 'Чувствительность',
            summary: sensitivitySummary(data),
            icon: SlidersHorizontal,
            content: <SensitivityPanel factors={data.sensitivity} />,
          } satisfies ReportSection,
        ]
      : []),
    {
      id: 'inputs',
      title: 'Вводные объекта',
      summary: intro.title,
      icon: ClipboardList,
      content: (
        <div>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
            {intro.meta.split('·').map((part) => (
              <span key={part} className="text-[12px] text-[#8E8E93]">
                {part.trim()}
              </span>
            ))}
          </div>
          {parameterGroups.length ? <ObjectParametersList groups={parameterGroups} /> : null}
        </div>
      ),
    },
    {
      id: 'assumptions',
      title: 'Допущения',
      summary: `${data.assumptions.length + simulationAssumptions.length} пунктов · экономика и симуляция`,
      icon: ScrollText,
      content: (
        <div className="grid gap-3">
          <AssumptionBlock title="Экономика" items={data.assumptions} />
          <AssumptionBlock title="Симуляция" items={[...simulationAssumptions]} />
          <button
            type="button"
            className="text-left text-[12.5px] font-medium text-[#2F86F0] underline-offset-4 hover:underline"
          >
            Изменить допущения
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-5 sm:px-8">
      <div className="mx-auto max-w-site py-12 sm:py-16">
        <ReportSections
          sections={sections}
          activeId={previewId}
          onSelect={onSelect}
          onClose={onClosePreview}
        />
      </div>
    </div>
  );
}

/**
 * Левый оверлей на симуляции: KPI + сценарий + тонкая панель управления.
 * Сворачивается до одной строки с кнопками камеры/плейбека/экспорта.
 */
const SPEED_STEPS = [1, 2, 4, 8, 16, 32, 64, 128] as const;

function HeroMetrics({
  data,
  intro,
  exporting,
  onExport,
  onExportHover,
}: {
  data: CalculationResult;
  intro: ObjectIntro;
  exporting: 'pdf' | 'xlsx' | null;
  onExport: (kind: 'pdf' | 'xlsx') => void;
  onExportHover: () => void;
}) {
  const {
    running,
    setRunning,
    reset,
    speed,
    setSpeed,
    topView,
    toggleTopView,
    zoomBy,
    rotate,
    snapshot,
  } = useSimPlayback();
  const [collapsed, setCollapsed] = useState(false);

  const speedStepIndex = SPEED_STEPS.reduce((best, step, index) => {
    const bestStep = SPEED_STEPS[best] ?? step;
    return Math.abs(step - speed) < Math.abs(bestStep - speed) ? index : best;
  }, 0);
  const bumpSpeed = (direction: -1 | 1) => {
    const next = SPEED_STEPS[speedStepIndex + direction];
    if (next !== undefined) setSpeed(next);
  };

  const area = areaFromTitle(intro.title);
  const recommended = data.scenarios.find((scenario) => scenario.recommended);

  // Два кегля в острове: 11 (подписи) / 13 (значения и тулбар).
  const iconBtn =
    'grid size-8 flex-none place-items-center rounded-[10px] border border-transparent text-foreground transition-colors duration-100 hover:border-[#E5E5EA] hover:bg-[#FAFAFA] disabled:pointer-events-none disabled:opacity-40';
  const iconBtnActive =
    'grid size-8 flex-none place-items-center rounded-[10px] border border-foreground bg-white text-foreground';

  return (
    <div className="pointer-events-auto w-full max-w-[520px]">
      <div className="overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
            collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                'grid grid-cols-2 items-stretch gap-2 border-b border-[#E5E5EA] px-3 pb-3 pt-3.5',
                'transition-opacity duration-300 ease-out motion-reduce:transition-none',
                collapsed ? 'opacity-0' : 'opacity-100',
              )}
            >
              {/* Слева — показатели 2×2, та же оболочка что у покупки */}
              <div className="grid grid-cols-2 content-center gap-x-3 gap-y-3 rounded-[12px] border border-[#E5E5EA] px-2.5 py-2.5">
                <Metric label="Площадь" value={`${area.number} ${area.unit}`.trim()} />
                <Metric label="CAPEX" value={data.capex.value} />
                <Metric label="ROI" value={data.roi.value} />
                <Metric
                  label="Окупаемость"
                  value={`${data.payback.value} ${data.payback.unit ?? 'лет'}`.trim()}
                  tone="blue"
                />
              </div>

              {/* Справа — покупка */}
              {recommended ? (
                <div className="relative flex min-h-0 flex-col justify-between rounded-[12px] border border-status-operation px-2.5 pb-2.5 pt-3.5">
                  <span className="absolute -top-2 right-2.5 rounded-full bg-status-operation-tint px-2 py-0.5 text-[11px] font-semibold leading-none text-status-operation">
                    Рекомендуем
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold leading-tight text-foreground">
                      {recommended.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] leading-snug text-[#8E8E93]">
                      {recommended.subtitle}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Metric label="CAPEX" value={data.capex.value} />
                    <Metric label="OPEX" value={data.opexSaving.percent} tone="green" />
                    <Metric label="TCO" value={fmt(recommended.tco)} />
                  </div>
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-[#E5E5EA]" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 px-2 py-1.5">
          <button
            type="button"
            onClick={toggleTopView}
            aria-pressed={topView}
            aria-label={topView ? 'Переключить на 3D' : 'Переключить на 2D-план'}
            title={topView ? '3D' : '2D план'}
            className={topView ? iconBtnActive : iconBtn}
          >
            <span className="text-[11px] font-semibold tabular-nums">{topView ? '2D' : '3D'}</span>
          </button>
          <button type="button" onClick={() => zoomBy(6)} aria-label="Отдалить" title="Отдалить" className={iconBtn}>
            <Minus className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" onClick={() => zoomBy(-6)} aria-label="Приблизить" title="Приблизить" className={iconBtn}>
            <Plus className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" onClick={() => rotate(-1)} aria-label="Повернуть влево" title="Влево" className={iconBtn}>
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" onClick={() => rotate(1)} aria-label="Повернуть вправо" title="Вправо" className={iconBtn}>
            <RotateCw className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" onClick={snapshot} aria-label="Сохранить снимок сцены" title="Снимок сцены, PNG" className={iconBtn}>
            <Camera className="size-4" strokeWidth={1.75} aria-hidden />
          </button>

          <span className="mx-0.5 h-4 w-px flex-none bg-[#E5E5EA]" aria-hidden />

          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            aria-label={running ? 'Пауза' : 'Продолжить'}
            title={running ? 'Пауза' : 'Продолжить'}
            className={iconBtn}
          >
            {running ? (
              <Pause className="size-4" strokeWidth={1.75} aria-hidden />
            ) : (
              <Play className="size-4" strokeWidth={1.75} aria-hidden />
            )}
          </button>
          <button type="button" onClick={reset} aria-label="Сброс" title="Сброс" className={iconBtn}>
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <div
            className="flex h-8 flex-none items-center overflow-hidden rounded-[10px] border border-[#E5E5EA] bg-white"
            role="group"
            aria-label="Скорость симуляции"
          >
            <button
              type="button"
              onClick={() => bumpSpeed(-1)}
              disabled={speedStepIndex <= 0}
              aria-label="Медленнее"
              title="Медленнее"
              className="grid size-8 place-items-center text-foreground transition-colors hover:bg-[#FAFAFA] disabled:pointer-events-none disabled:opacity-35"
            >
              <Minus className="size-3.5" strokeWidth={1.75} aria-hidden />
            </button>
            <span className="min-w-[2.5rem] select-none text-center text-[13px] font-semibold tabular-nums text-foreground">
              {SPEED_STEPS[speedStepIndex]}×
            </span>
            <button
              type="button"
              onClick={() => bumpSpeed(1)}
              disabled={speedStepIndex >= SPEED_STEPS.length - 1}
              aria-label="Быстрее"
              title="Быстрее"
              className="grid size-8 place-items-center text-foreground transition-colors hover:bg-[#FAFAFA] disabled:pointer-events-none disabled:opacity-35"
            >
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          <span className="mx-0.5 h-4 w-px flex-none bg-[#E5E5EA]" aria-hidden />

          <button
            type="button"
            className="flex h-8 flex-none items-center gap-1 rounded-[8px] bg-[#FEECEC] px-1.5 text-[#D32F2F] transition-colors hover:bg-[#FAD4D4] disabled:pointer-events-none disabled:opacity-40"
            disabled={exporting !== null}
            onClick={() => onExport('pdf')}
            onPointerEnter={onExportHover}
            onFocus={onExportHover}
            aria-label={exporting === 'pdf' ? 'Готовим PDF…' : 'Скачать PDF'}
            title={exporting === 'pdf' ? 'Готовим PDF…' : 'PDF'}
          >
            <PdfMark />
            <span className="text-[11px] font-bold tracking-wide">PDF</span>
          </button>
          <button
            type="button"
            className="flex h-8 flex-none items-center gap-1 rounded-[8px] bg-[#E8F5EE] px-1.5 text-[#217346] transition-colors hover:bg-[#D4ECDD] disabled:pointer-events-none disabled:opacity-40"
            disabled={exporting !== null}
            onClick={() => onExport('xlsx')}
            onPointerEnter={onExportHover}
            onFocus={onExportHover}
            aria-label={exporting === 'xlsx' ? 'Готовим Excel…' : 'Скачать Excel'}
            title={exporting === 'xlsx' ? 'Готовим Excel…' : 'Excel'}
          >
            <ExcelMark />
            <span className="text-[11px] font-bold tracking-wide">XLS</span>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Развернуть показатели' : 'Свернуть до управления симуляцией'}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
            className={cn(iconBtn, 'ml-auto')}
          >
            {collapsed ? (
              <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
            ) : (
              <ChevronUp className="size-4" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function areaFromTitle(title: string): { number: string; unit: string } {
  const match = title.match(/([\d\s\u00a0]+)\s*(м²|m²)/i);
  const number = match?.[1];
  const unit = match?.[2];
  if (!number || !unit) return { number: title, unit: '' };
  return {
    number: number.replace(/\s+/g, '\u00a0').trim(),
    unit,
  };
}

function PdfMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 flex-none" aria-hidden>
      <path
        fill="currentColor"
        d="M3 1.5h6.2L13 5.2V13.5A1.5 1.5 0 0 1 11.5 15h-8A1.5 1.5 0 0 1 2 13.5v-10A1.5 1.5 0 0 1 3.5 2  .5.5 0 0 0 3 1.5Z"
      />
      <path fill="#FEECEC" d="M9.1 1.6v2.9c0 .4.32.7.7.7H12.9L9.1 1.6Z" />
    </svg>
  );
}

function ExcelMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 flex-none" aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.2" fill="currentColor" />
      <path
        stroke="#E8F5EE"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M5.2 5.2 10.8 10.8M10.8 5.2 5.2 10.8"
      />
    </svg>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'blue' | 'green';
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-[#8E8E93]">{label}</div>
      <div
        className={cn(
          'mt-1 truncate text-[13px] font-semibold leading-none tabular',
          tone === 'blue' && 'text-[#2F86F0]',
          tone === 'green' && 'text-status-operation',
          tone === 'default' && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function compareSummary(data: CalculationResult): string {
  const recommended = data.scenarios.find((scenario) => scenario.recommended);
  if (!recommended) return `${data.scenarios.length} варианта · TCO за ${horizonOf(data)}`;
  return `${recommended.title} · ${fmt(recommended.tco)} млн ₽`;
}

function sensitivitySummary(data: CalculationResult): string {
  const top = data.sensitivity?.[0];
  if (!top) return 'Влияние параметров на срок';
  return `${top.label} · ±${Math.round(top.impact * 100)}% к сроку`;
}

function AssumptionBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="px-1 text-[11.5px] font-medium text-[#5B8FCE]">{title}</div>
      <ul className="mt-1">
        {items.map((item) => (
          <li
            key={item}
            className="border-b border-[#F2F2F2] px-1 py-2 text-[13px] leading-snug text-foreground last:border-b-0"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ResultsPage;
