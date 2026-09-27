import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  ListTree,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  TriangleAlert,
  ClipboardList,
  ScrollText,
} from 'lucide-react';
import { SiteFooter } from '@/app/AppShell';
import { useCalculation } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { CostBreakdown } from './CostBreakdown';
import { ObjectParametersList } from './ObjectParametersList';
import { OBJECT_PARAMETERS } from './objectParameters';
import { ReportCategories, ReportCategory, ReportShell } from './ReportCategory';
import { ScenarioBars } from './ScenarioBars';
import { SensitivityPanel } from './SensitivityPanel';
import { ResultSimulation } from './simulation/ResultSimulation';
import { SIMULATION_ASSUMPTIONS } from './simulation/simulationInput';
import { SimPlaybackProvider, useSimPlayback } from './simulation/SimPlaybackContext';
import type { CalculationResult } from '@/api/types';
import { fmt } from '@/lib/utils';

// jspdf + xlsx + html2canvas — около 700 КБ, нужны только по клику «Скачать».
const loadExport = () => import('./export/exportCalculation');

interface ObjectIntro {
  title: string;
  meta: string;
}

const DEFAULT_INTRO: ObjectIntro = {
  title: 'Склад «Южные Врата» · 20 000 м²',
  meta: 'Расчёт №2026-0417 · 2 смены · 100 отборщиков · горизонт 5 лет · обновлено 17.09.2026',
};

const OBJECT_INTRO: Record<string, ObjectIntro> = {
  warehouse: DEFAULT_INTRO,
  airport: {
    title: 'Аэропорт «Соколиная Гора» · 85 000 м²',
    meta: 'Расчёт №2026-0418 · 2 терминала · 320 сотрудников рампы · горизонт 7 лет · обновлено 17.09.2026',
  },
  clinic: {
    title: 'Многопрофильная больница №14 · 45 000 м²',
    meta: 'Расчёт №2026-0419 · 650 коек · 65 санитаров · горизонт 7 лет · обновлено 17.09.2026',
  },
};

export function ResultsPage() {
  const navigate = useNavigate();
  const { objectType = 'warehouse', calculationId = 'demo' } = useParams<{
    objectType: string;
    calculationId: string;
  }>();
  const { data, isLoading, isError } = useCalculation(calculationId);
  const intro = OBJECT_INTRO[objectType] ?? DEFAULT_INTRO;
  const parameterGroups = OBJECT_PARAMETERS[objectType] ?? OBJECT_PARAMETERS.warehouse ?? [];
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

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
        Hero: симуляция на весь экран. Поверх — один белый блок слева
        (экономика + управление симуляцией).
      */}
      <section
        data-testid="visualization-slot"
        className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden"
        aria-label="Симуляция и ключевые показатели"
      >
        <SimPlaybackProvider>
          <div className="absolute inset-0 z-0">
            <ResultSimulation objectType={objectType} immersive />
          </div>

          <div className="pointer-events-none absolute inset-0 z-20 p-3 sm:p-5 lg:p-6">
            <HeroMetrics data={data} intro={intro} />
          </div>
        </SimPlaybackProvider>
      </section>

      <div className="mx-auto max-w-site px-[18px] py-8">
        {/* Действия — не категория контента, а панель: не смешиваем с вводными. */}
        <ReportShell className="mb-3">
          <div className="flex flex-wrap items-center gap-1 px-1 py-0.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-[12px] border-[#E5E5EA] text-[13px]"
              onClick={() => void runExport('pdf')}
              onPointerEnter={() => void loadExport()}
              onFocus={() => void loadExport()}
              disabled={exporting !== null}
            >
              <FileText className="size-3.5 text-foreground" strokeWidth={1.75} />
              {exporting === 'pdf' ? 'Готовим…' : 'PDF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-[12px] border-[#E5E5EA] text-[13px]"
              onClick={() => void runExport('xlsx')}
              onPointerEnter={() => void loadExport()}
              onFocus={() => void loadExport()}
              disabled={exporting !== null}
            >
              <FileSpreadsheet className="size-3.5 text-status-operation" strokeWidth={1.75} />
              {exporting === 'xlsx' ? 'Готовим…' : 'Excel'}
            </Button>
            <Button size="sm" className="ml-auto h-8 gap-2 rounded-[12px] text-[13px]">
              В инвесткомитет
              <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
            </Button>
          </div>
        </ReportShell>

        <ReportCategories defaultOpen={['compare', 'costs']}>
          <ReportCategory
            id="compare"
            title="Сравнение решений"
            summary={compareSummary(data)}
            icon={GitCompareArrows}
          >
            <ScenarioBars scenarios={data.scenarios} />
          </ReportCategory>

          <ReportCategory
            id="costs"
            title="Структура затрат"
            summary={`${fmt(data.totalTco)} млн ₽ за 7 лет · сценарий «Покупка»`}
            icon={ListTree}
          >
            <CostBreakdown groups={data.costGroups} total={data.totalTco} />
          </ReportCategory>

          {data.sensitivity?.length ? (
            <ReportCategory
              id="sensitivity"
              title="Чувствительность"
              summary={sensitivitySummary(data)}
              icon={SlidersHorizontal}
            >
              <SensitivityPanel factors={data.sensitivity} />
            </ReportCategory>
          ) : null}

          <ReportCategory
            id="inputs"
            title="Вводные объекта"
            summary={intro.title}
            icon={ClipboardList}
          >
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 px-1">
              {intro.meta.split('·').map((part) => (
                <span key={part} className="text-[12px] text-[#8E8E93]">
                  {part.trim()}
                </span>
              ))}
            </div>
            {parameterGroups.length ? <ObjectParametersList groups={parameterGroups} /> : null}
          </ReportCategory>

          <ReportCategory
            id="assumptions"
            title="Допущения"
            summary={`${data.assumptions.length + SIMULATION_ASSUMPTIONS.length} пунктов · экономика и симуляция`}
            icon={ScrollText}
          >
            <div className="grid gap-3">
              <AssumptionBlock title="Экономика" items={data.assumptions} />
              <AssumptionBlock title="Симуляция" items={[...SIMULATION_ASSUMPTIONS]} />
              <button
                type="button"
                className="px-1 text-left text-[12.5px] font-medium text-foreground underline-offset-4 hover:underline"
              >
                Изменить допущения
              </button>
            </div>
          </ReportCategory>
        </ReportCategories>
      </div>

      <div className="mx-auto max-w-site px-[18px] pb-8">
        <SiteFooter />
      </div>
    </div>
  );
}

/**
 * Левый оверлей — оболочка как у мини-меню профиля:
 * rounded-[20px], border #E5E5EA, p-1.5, мягкая тень; секции через hairline.
 */
function HeroMetrics({ data, intro }: { data: CalculationResult; intro: ObjectIntro }) {
  const {
    running,
    setRunning,
    reset,
    speed,
    setSpeed,
    speedMin,
    speedMax,
    topView,
    toggleTopView,
    zoomBy,
    rotate,
  } = useSimPlayback();
  const [speedDraft, setSpeedDraft] = useState(String(speed));

  useEffect(() => {
    setSpeedDraft(String(speed));
  }, [speed]);

  const commitSpeed = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setSpeedDraft(String(speed));
      return;
    }
    const next = Math.min(speedMax, Math.max(speedMin, Math.round(parsed)));
    setSpeedDraft(String(next));
    setSpeed(next);
  };

  const iconBtn =
    'grid size-8 flex-none place-items-center rounded-[12px] border border-transparent text-foreground transition-colors duration-100 hover:border-[#E5E5EA] hover:bg-[#FAFAFA]';
  const iconBtnActive =
    'grid size-8 flex-none place-items-center rounded-[12px] border border-foreground bg-white text-foreground transition-colors duration-100';

  return (
    <div className="pointer-events-auto w-[min(100%,248px)]">
      <div className="overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        {/* Экономика */}
        <div className="rounded-[12px] px-2.5 py-2">
          <div className="truncate text-[11.5px] leading-snug text-[#8E8E93]">{intro.title}</div>
          <div className="mt-2 text-[11.5px] font-medium text-[#8E8E93]">{data.payback.label}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[28px] font-semibold leading-none tabular tracking-tight text-foreground">
              {data.payback.value}
            </span>
            {data.payback.unit ? (
              <span className="text-[12px] font-medium text-[#8E8E93]">{data.payback.unit}</span>
            ) : null}
          </div>
          {data.payback.note ? (
            <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-[#8E8E93]">{data.payback.note}</p>
          ) : null}

          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            <div>
              <div className="text-[10.5px] text-[#8E8E93]">{data.capex.label}</div>
              <div className="mt-0.5 text-[14px] font-semibold leading-none tabular text-foreground">
                {data.capex.value}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#8E8E93]">ROI</div>
              <div className="mt-0.5 text-[14px] font-semibold leading-none tabular text-foreground">
                {data.roi.value}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#8E8E93]">OPEX</div>
              <div className="mt-0.5 text-[14px] font-semibold leading-none tabular text-status-operation">
                {data.opexSaving.percent}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-1 my-1.5 h-px bg-accent-tint" />

        {/* Камера: 3D/2D, зум, поворот */}
        <div className="flex items-center gap-1 px-1 py-0.5">
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

          <button
            type="button"
            onClick={() => zoomBy(6)}
            aria-label="Отдалить"
            title="Отдалить"
            className={iconBtn}
          >
            <Minus className="size-4" strokeWidth={1.75} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => zoomBy(-6)}
            aria-label="Приблизить"
            title="Приблизить"
            className={iconBtn}
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => rotate(-1)}
            aria-label="Повернуть влево"
            title="Повернуть влево"
            className={iconBtn}
          >
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => rotate(1)}
            aria-label="Повернуть вправо"
            title="Повернуть вправо"
            className={iconBtn}
          >
            <RotateCw className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="mx-1 my-1.5 h-px bg-accent-tint" />

        {/* Плейбек: пауза, сброс, скорость */}
        <div className="flex items-center gap-1 px-1 py-0.5">
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

          <label className="ml-auto flex items-center gap-1.5 pr-1">
            <span className="text-[11.5px] font-medium text-[#8E8E93]">×</span>
            <input
              type="number"
              min={speedMin}
              max={speedMax}
              step={1}
              value={speedDraft}
              onChange={(event) => setSpeedDraft(event.target.value)}
              onBlur={(event) => commitSpeed(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-label="Скорость симуляции"
              className="h-8 w-12 rounded-[12px] border border-[#E5E5EA] bg-white px-1.5 text-center font-mono text-[13px] font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-foreground"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function compareSummary(data: CalculationResult): string {
  const recommended = data.scenarios.find((scenario) => scenario.recommended);
  if (!recommended) return `${data.scenarios.length} варианта · TCO за 7 лет`;
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
      <div className="px-1 text-[11.5px] font-medium text-[#8E8E93]">{title}</div>
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
