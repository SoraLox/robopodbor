import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUpRight, FileSpreadsheet, FileText, Minus, Plus } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useCalculation } from '@/api/queries';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { KpiBlock, SectionHeading, Sparkline, StatusBadge } from '@/shared/components';
import { ScenarioBars } from './ScenarioBars';
import { SensitivityPanel } from './SensitivityPanel';
import { VisualizationSlot } from './visualization/VisualizationSlot';
import { exportToPdf, exportToXlsx } from './export/exportCalculation';
import { fmt } from '@/lib/utils';

/** Сетка строки таблицы затрат — общая для шапки, групп и итога. */
const COST_GRID = 'minmax(0, 1fr) 112px 72px 150px';

export function ResultsPage() {
  const { calculationId = 'demo' } = useParams<{ calculationId: string }>();
  const { data, isLoading, isError } = useCalculation(calculationId);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  const runExport = async (kind: 'pdf' | 'xlsx') => {
    if (!data) return;
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
      <AppShell>
        <div className="grid min-h-[420px] place-items-center p-5">
          <div className="w-full max-w-[420px] text-center">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            <h2 className="mt-5 text-[15px] font-semibold">Идёт расчёт сценариев</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Прогон модели по вашему объекту занимает до минуты. Считаем TCO
              на семь лет для трёх сценариев и разбираем CAPEX и OPEX построчно.
            </p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-hairline">
              <div className="h-full w-1/3 animate-[progress_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">
          Не удалось загрузить расчёт.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Шапка результата: объект слева, экспорт справа */}
      <div className="flex flex-wrap items-stretch border-b border-border">
        <div className="flex flex-col justify-center px-5 py-3.5">
          <h1 className="font-heading text-[22px] font-bold uppercase leading-none tracking-h1">
            {data.objectTitle}
          </h1>
          <div className="mt-1.5 meta-label">{data.meta}</div>
        </div>

        <div className="ml-auto flex items-stretch">
          <Button
            variant="ghost"
            className="gap-2 border-l border-border px-4 py-3.5 text-foreground"
            onClick={() => void runExport('pdf')}
            disabled={exporting !== null}
          >
            <FileText className="size-3.5 text-primary" strokeWidth={2} />
            {exporting === 'pdf' ? 'Готовим…' : 'PDF'}
          </Button>
          <Button
            variant="ghost"
            className="gap-2 border-l border-border px-4 py-3.5 text-foreground"
            onClick={() => void runExport('xlsx')}
            disabled={exporting !== null}
          >
            <FileSpreadsheet className="size-3.5 text-status-operation" strokeWidth={2} />
            {exporting === 'xlsx' ? 'Готовим…' : 'Excel'}
          </Button>
          <Button className="px-5 py-3.5">
            В инвесткомитет
            <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[296px_minmax(0,1fr)]">
        {/* Левая колонка: KPI, вторичные метрики, спарклайн, предупреждение */}
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <KpiBlock
            variant="filled"
            size="lg"
            label={data.payback.label}
            value={data.payback.value}
            {...(data.payback.unit ? { unit: data.payback.unit } : {})}
            trend="down"
            {...(data.payback.note ? { note: data.payback.note } : {})}
          />

          <div className="grid grid-cols-2 border-b border-hairline">
            <div className="border-r border-hairline">
              <KpiBlock
                size="sm"
                label={data.capex.label}
                value={data.capex.value}
                trend="none"
                className="p-4"
              />
              <div className="-mt-2 px-4 pb-3.5 meta-label">{data.capex.note}</div>
            </div>
            <div>
              <KpiBlock
                size="sm"
                label={data.roi.label}
                value={data.roi.value}
                trend="up"
                className="p-4"
              />
              <div className="-mt-2 px-4 pb-3.5 meta-label">{data.roi.note}</div>
            </div>
          </div>

          <div className="border-b border-hairline px-4 py-3.5">
            <Sparkline
              label="Экономия OPEX по годам"
              data={data.opexSaving.series}
              percent={data.opexSaving.percent}
              trend="up"
              meta={data.opexSaving.meta}
            />
          </div>

          <div className="border-l-[3px] border-l-status-piloting px-4 py-3.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-status-piloting">
              Требует проверки данных
            </div>
            <p className="mt-[7px] text-[11.5px] leading-[1.5] text-muted-foreground">
              {data.warning}
            </p>
          </div>
        </aside>

        <div>
          {/* Сравнение сценариев */}
          <section className="border-b border-border px-5 py-[18px]">
            <SectionHeading className="mb-[18px]" meta="TCO, 7 ЛЕТ · МЛН ₽">
              Сравнение сценариев
            </SectionHeading>

            <ScenarioBars scenarios={data.scenarios} />

            <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-hairline pt-3">
              {data.assumptions.map((assumption) => (
                <div key={assumption} className="meta-label">
                  {assumption}
                </div>
              ))}
              <button
                type="button"
                className="meta-label border-b border-primary text-primary hover:text-primary-hover"
              >
                ИЗМЕНИТЬ ДОПУЩЕНИЯ
              </button>
            </div>
          </section>

          {/* Структура затрат: раскрывающиеся группы CAPEX / OPEX */}
          <section>
            <SectionHeading
              className="px-5 pb-3 pt-4"
              meta="СЦЕНАРИЙ «ПОКУПКА»"
            >
              Структура затрат
            </SectionHeading>

            <div
              className="grid gap-2.5 border-b border-border px-5 pb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              style={{ gridTemplateColumns: COST_GRID }}
            >
              <div>Статья</div>
              <div className="text-right">Сумма, млн ₽</div>
              <div className="text-right">Доля</div>
              <div className="text-right">Источник</div>
            </div>

            <Accordion type="multiple" defaultValue={['capex']}>
              {data.costGroups.map((group) => (
                <AccordionItem key={group.id} value={group.id}>
                  <AccordionTrigger className="group">
                    <div
                      className="grid items-center gap-2.5 border-b border-hairline px-5 py-3 data-[state=open]:bg-accent-tint group-data-[state=open]:bg-accent-tint"
                      style={{ gridTemplateColumns: COST_GRID }}
                    >
                      <div className="flex items-center gap-2.5 text-[13px] font-bold">
                        <Plus
                          className="size-2.5 text-primary group-data-[state=open]:hidden"
                          strokeWidth={3}
                        />
                        <Minus
                          className="hidden size-2.5 text-primary group-data-[state=open]:block"
                          strokeWidth={3}
                        />
                        {group.title}
                      </div>
                      <div className="text-right text-sm font-bold tabular">
                        {fmt(group.amount)}
                      </div>
                      <div className="text-right text-xs tabular text-muted-foreground">
                        {group.share}%
                      </div>
                      <div className="text-right">
                        <StatusBadge
                          variant={
                            group.confidence === 'confirmed' ? 'confirmed' : 'needs-review'
                          }
                        />
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent>
                    {group.lines.map((line) => (
                      <div
                        key={line.title}
                        className="grid items-center gap-2.5 border-b border-hairline py-2.5 pl-[38px] pr-5 text-xs"
                        style={{ gridTemplateColumns: COST_GRID }}
                      >
                        <div className="text-foreground/80">{line.title}</div>
                        <div className="text-right tabular">{fmt(line.amount)}</div>
                        <div className="text-right tabular text-muted-foreground">
                          {line.share}%
                        </div>
                        <div
                          className={
                            line.confidence === 'confirmed'
                              ? 'text-right font-mono text-[9px] uppercase text-status-confirmed'
                              : 'text-right font-mono text-[9px] uppercase text-status-piloting'
                          }
                        >
                          {line.source}
                        </div>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div
              className="grid items-center gap-2.5 border-t border-border px-5 py-3"
              style={{ gridTemplateColumns: COST_GRID }}
            >
              <div className="micro-label">Итого TCO, 7 лет</div>
              <div className="text-right font-heading text-lg font-bold tabular tracking-[-0.02em]">
                {fmt(data.totalTco)}
              </div>
              <div className="text-right text-xs tabular text-muted-foreground">100%</div>
              <div />
            </div>
          </section>

          {/* Чувствительность: что сильнее всего двигает срок окупаемости */}
          {data.sensitivity?.length ? (
            <section className="border-t border-border px-5 py-[18px]">
              <SectionHeading className="mb-4" meta="ВЛИЯНИЕ НА СРОК ОКУПАЕМОСТИ">
                Анализ чувствительности
              </SectionHeading>
              <SensitivityPanel factors={data.sensitivity} />
            </section>
          ) : null}

          {/* Слот визуализации — наполняет отдельный поток */}
          <section className="border-t border-border px-5 py-[18px]">
            <SectionHeading className="mb-4">Визуализация</SectionHeading>
            <VisualizationSlot layout={{ objectType: 'warehouse' }} events={[]} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default ResultsPage;
