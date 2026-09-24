import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  PiggyBank,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useCalculation } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { MiniTrend } from '@/shared/charts';
import { CostBreakdown, type CostZone } from './CostBreakdown';
import { ObjectParametersList } from './ObjectParametersList';
import { OBJECT_PARAMETERS } from './objectParameters';
import { MetricTile } from './parts';
import { ScenarioBars } from './ScenarioBars';
import { SensitivityPanel } from './SensitivityPanel';
import { VisualizationSlot } from './visualization/VisualizationSlot';
import type { SimSceneVariant } from './visualization/WarehouseSimulation';
import { exportToPdf, exportToXlsx } from './export/exportCalculation';

/**
 * Вводные данные объекта отличаются по типу площадки (склад / аэропорт /
 * медучреждение) — расчёт экономики при этом общий демо-сценарий, но
 * карточка «Вводные» должна показывать реальные для типа объекта параметры.
 */
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

  // «Живой спутник» справа реагирует на то, что читает пользователь слева.
  const [hoveredScenarioId, setHoveredScenarioId] = useState<string | null>(null);
  const [hoveredZone, setHoveredZone] = useState<CostZone | null>(null);
  const [hoveredImpact, setHoveredImpact] = useState<number | null>(null);
  const [flashSignal, setFlashSignal] = useState(0);

  const sceneVariant: SimSceneVariant =
    hoveredScenarioId === 'as-is' ? 'as-is' : hoveredScenarioId === 'raas' ? 'raas' : null;

  const runExport = async (kind: 'pdf' | 'xlsx') => {
    if (!data) return;
    setFlashSignal((n) => n + 1);
    setExporting(kind);
    try {
      if (kind === 'pdf') await exportToPdf(data);
      else exportToXlsx(data);
    } finally {
      setExporting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] px-[18px] pt-8">
        <div className="panel mx-auto grid min-h-[240px] max-w-site place-items-center p-8">
          <h2 className="text-[17px] font-semibold">Считаем экономику</h2>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <AppShell>
        <div className="panel mt-8 flex flex-col items-center gap-3 p-8 text-center">
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
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/*
        Живой спутник отчёта — сразу половина экрана справа, фиксированная
        (sticky) от самого верха: реагирует на то, что читает пользователь
        слева, без единой подписи — сама сцена уже понятна. На мобильном —
        та же сцена, без прилипания.
      */}
      <div className="grid gap-4 pt-8 lg:grid-cols-2 lg:items-start lg:gap-6">
        <aside className="panel h-[520px] overflow-hidden lg:sticky lg:top-[calc(3.5rem+1px+2rem)] lg:order-2 lg:h-[calc(100dvh-3.5rem-1px-2rem-1.5rem)]">
          <VisualizationSlot
            className="h-full rounded-none"
            layout={{ objectType }}
            events={[]}
            sceneVariant={sceneVariant}
            highlightZone={hoveredZone}
            sensitivityPulse={hoveredImpact ?? 0}
            flashSignal={flashSignal}
          />
        </aside>

        <div className="grid gap-4 lg:order-1">
          {/* Раздел 1 — Вводные */}
          <section className="panel p-5 lg:p-6">
            <SectionHeading>Вводные</SectionHeading>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <p className="text-[15px] font-medium">{intro.title}</p>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void runExport('pdf')}
                  disabled={exporting !== null}
                >
                  <FileText className="size-4 text-primary" strokeWidth={1.8} />
                  {exporting === 'pdf' ? 'Готовим…' : 'Скачать PDF'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void runExport('xlsx')}
                  disabled={exporting !== null}
                >
                  <FileSpreadsheet className="size-4 text-status-operation" strokeWidth={1.8} />
                  {exporting === 'xlsx' ? 'Готовим…' : 'Скачать Excel'}
                </Button>
                <Button size="sm" className="gap-2">
                  Отправить в инвесткомитет
                  <ArrowUpRight className="size-4" strokeWidth={2.2} />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-4">
              {intro.meta.split('·').map((part) => (
                <div key={part} className="text-[13px] text-muted-foreground">
                  {part.trim()}
                </div>
              ))}
            </div>

            {parameterGroups.length ? <ObjectParametersList groups={parameterGroups} /> : null}
          </section>

          {/* Раздел 2 — Базовые экономические показатели */}
          <section className="panel p-5 lg:p-6">
            <SectionHeading>Базовые экономические показатели</SectionHeading>

            <div className="mt-4">
              <div className="text-[13px] font-medium text-muted-foreground">{data.payback.label}</div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-heading text-[64px] font-bold leading-[0.85] tabular tracking-display">
                  {data.payback.value}
                </span>
                {data.payback.unit ? (
                  <span className="text-[16px] font-medium text-muted-foreground">{data.payback.unit}</span>
                ) : null}
              </div>
              {data.payback.note ? (
                <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">
                  {data.payback.note}
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricTile icon={Wallet} label={data.capex.label} value={data.capex.value} note={data.capex.note} />
              <MetricTile
                icon={TrendingUp}
                label={data.roi.label}
                value={data.roi.value}
                note={data.roi.note}
                trend="up"
              />
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 flex-none place-items-center rounded-lg bg-accent-tint">
                    <PiggyBank className="size-4 text-primary" strokeWidth={1.8} />
                  </span>
                  <span className="text-[13px] text-muted-foreground">Экономия на OPEX по годам</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[22px] font-semibold leading-none tabular text-status-operation">
                      {data.opexSaving.percent}
                    </div>
                    <div className="mt-1.5 text-[12px] text-muted-foreground">{data.opexSaving.meta}</div>
                  </div>
                  <MiniTrend data={data.opexSaving.series} tone="up" width={70} height={34} />
                </div>
              </div>
            </div>
          </section>

          {/* Раздел 3 — Структура затрат */}
          <section className="panel p-5 lg:p-6">
            <SectionHeading description="Из чего складывается сумма в сценарии «Покупка» — по каждой статье указан источник.">
              Структура затрат
            </SectionHeading>

            <div className="mt-4">
              <CostBreakdown groups={data.costGroups} total={data.totalTco} onHoverLine={setHoveredZone} />
            </div>
          </section>

          {/* Раздел 4 — Сравнение решений */}
          <section className="panel p-5 lg:p-6">
            <SectionHeading description="Общие расходы за 7 лет по каждому варианту, в млн ₽.">
              Сравнение решений
            </SectionHeading>

            <div className="mt-4">
              <ScenarioBars scenarios={data.scenarios} onHoverScenario={setHoveredScenarioId} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-4">
              {data.assumptions.map((assumption) => (
                <div key={assumption} className="text-[12.5px] text-muted-foreground">
                  {assumption}
                </div>
              ))}
              <button
                type="button"
                className="text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
              >
                Изменить допущения
              </button>
            </div>
          </section>

          {/* Раздел 5 — далее прочее: анализ чувствительности */}
          {data.sensitivity?.length ? (
            <section className="panel p-5 lg:p-6">
              <SectionHeading description="Что сильнее всего может сдвинуть срок окупаемости, если параметр изменится.">
                Анализ чувствительности
              </SectionHeading>

              <div className="mt-4">
                <SensitivityPanel factors={data.sensitivity} onHoverFactor={setHoveredImpact} />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Один и тот же заголовок раздела везде на странице — размер, начертание,
 * цвет и отступ описания не меняются от секции к секции: страница должна
 * читаться как книга, а не как коллаж разных экранов.
 */
function SectionHeading({ children, description }: { children: string; description?: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-semibold">{children}</h2>
      {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export default ResultsPage;
