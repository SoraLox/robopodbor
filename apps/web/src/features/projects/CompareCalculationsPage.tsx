import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, Trophy } from 'lucide-react';
import { OBJECT_LABEL } from '@domain/catalog';
import { DashboardLayout } from '@/app/DashboardLayout';
import { api } from '@/api/client';
import { queryKeys, useProjects, useSolutions } from '@/api/queries';
import type { CalculationResult, Kpi, Project } from '@/api/types';
import { Button } from '@/components/ui/button';
import { cn, fmt } from '@/lib/utils';

const kpiText = (kpi: Kpi | undefined) => (kpi ? `${kpi.value} ${kpi.unit ?? ''}`.trim() : '—');

/** «2,4» → 2.4; нет расчёта — null. */
const numberOf = (value: string | undefined) => {
  const parsed = Number((value ?? '').replace(/\s/g, '').replace(',', '.'));
  return value && Number.isFinite(parsed) ? parsed : null;
};

interface Column {
  project: Project;
  result: CalculationResult | undefined;
  loading: boolean;
  failed: boolean;
}

/** Сравнение сохранённых расчётов пользователя: ключевые показатели бок о бок. */
export function CompareCalculationsPage() {
  const [searchParams] = useSearchParams();
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean);
  const { data: projects = [], isLoading } = useProjects();
  const { data: solutions = [] } = useSolutions();

  const picked = ids.flatMap((id) => projects.find((project) => project.id === id) ?? []);
  // Последний сохранённый расчёт проекта открывается по id проекта (GET /calculations/{projectId}).
  const results = useQueries({
    queries: picked.map((project) => ({
      queryKey: queryKeys.calculation(project.id),
      queryFn: async (): Promise<CalculationResult> => {
        const { data, error } = await api.GET('/calculations/{calculationId}', {
          params: { path: { calculationId: project.id } },
        });
        if (error || !data) throw new Error('Не удалось загрузить расчёт');
        return data;
      },
    })),
  });

  const columns: Column[] = picked.map((project, index) => ({
    project,
    result: results[index]?.data,
    loading: results[index]?.isLoading ?? false,
    failed: results[index]?.isError ?? false,
  }));

  const solutionName = (id: string) => solutions.find((solution) => solution.id === id)?.name ?? id;

  // Лучшее значение в строке: минимальная окупаемость и TCO, максимальный ROI.
  const best = (values: Array<number | null>, mode: 'min' | 'max') => {
    const known = values.filter((value): value is number => value !== null);
    if (known.length < 2) return null;
    return mode === 'min' ? Math.min(...known) : Math.max(...known);
  };
  const paybacks = columns.map((c) => numberOf(c.result?.payback.value));
  const rois = columns.map((c) => numberOf(c.result?.roi.value.replace('%', '')));
  const tcos = columns.map((c) => (c.result ? c.result.totalTco : null));
  const bestPayback = best(paybacks, 'min');
  const bestRoi = best(rois, 'max');
  const bestTco = best(tcos, 'min');

  const rows: Array<{ label: string; cell: (column: Column, index: number) => ReactNode; highlight?: (index: number) => boolean }> = [
    { label: 'Объект', cell: (c) => c.result?.objectTitle ?? (c.project.objectType ? OBJECT_LABEL[c.project.objectType] : '—') },
    {
      label: 'Роботы в расчёте',
      cell: (c) => {
        const ids = c.result?.solutionIds?.length ? c.result.solutionIds : c.result?.solutionId ? [c.result.solutionId] : [];
        return ids.length ? ids.map(solutionName).join(', ') : '—';
      },
    },
    { label: 'Количество роботов', cell: (c) => (c.result?.robots ? `${c.result.robots.count} шт.` : '—') },
    {
      label: 'Окупаемость',
      cell: (c) => kpiText(c.result?.payback),
      highlight: (i) => bestPayback !== null && paybacks[i] === bestPayback,
    },
    { label: 'CAPEX', cell: (c) => kpiText(c.result?.capex) },
    { label: 'ROI', cell: (c) => kpiText(c.result?.roi), highlight: (i) => bestRoi !== null && rois[i] === bestRoi },
    { label: 'Снижение OPEX', cell: (c) => c.result?.opexSaving.percent ?? '—' },
    {
      label: 'TCO покупки, млн ₽',
      cell: (c) => (c.result ? fmt(c.result.totalTco) : '—'),
      highlight: (i) => bestTco !== null && tcos[i] === bestTco,
    },
    {
      label: 'Рекомендуемый сценарий',
      cell: (c) => {
        const recommended = c.result?.scenarios.find((scenario) => scenario.recommended);
        return recommended ? `${recommended.title} · ${fmt(recommended.tco)} млн ₽` : 'без рекомендации';
      },
    },
    {
      label: 'TCO по сценариям, млн ₽',
      cell: (c) =>
        c.result ? (
          <ul className="grid gap-0.5">
            {c.result.scenarios.map((scenario) => (
              <li key={scenario.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{scenario.title}</span>
                <span className="tabular">{fmt(scenario.tco)}</span>
              </li>
            ))}
          </ul>
        ) : (
          '—'
        ),
    },
    {
      label: 'Дата расчёта',
      cell: (c) =>
        c.result?.calculatedAt || c.project.calculatedAt
          ? new Date((c.result?.calculatedAt ?? c.project.calculatedAt)!).toLocaleDateString('ru-RU')
          : '—',
    },
    { label: 'Версия модели', cell: (c) => c.result?.modelVersion ?? '—' },
  ];

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/projects" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> Мои расчёты
          </Link>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.01em]">Сравнение расчётов</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Последний сохранённый расчёт каждого проекта. Лучшее значение в строке отмечено зелёным.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-muted" />
      ) : picked.length < 2 ? (
        <section className="panel px-5 py-12 text-center">
          <p className="text-[15px] font-semibold">Выберите хотя бы два расчёта</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            В списке «Мои расчёты» отметьте расчёты галочкой и нажмите «Сравнить».
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link to="/projects">К расчётам</Link>
          </Button>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-[#E5E5EA] bg-white" tabIndex={0} role="region" aria-label="Таблица сравнения расчётов">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="w-[190px] px-4 py-3 text-left text-[12px] font-medium text-muted-foreground">
                  Показатель
                </th>
                {columns.map((c) => (
                  <th key={c.project.id} scope="col" className="border-l border-hairline px-4 py-3 text-left align-top">
                    <Link
                      to={`/calculate/${c.project.objectType ?? 'warehouse'}/results/${c.project.id}`}
                      className="text-[13.5px] font-semibold leading-snug hover:text-primary"
                    >
                      {c.project.title}
                    </Link>
                    <div className="mt-0.5 text-[11.5px] font-normal text-muted-foreground">{c.project.meta}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-hairline last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left align-top text-[12px] font-medium text-muted-foreground">
                    {row.label}
                  </th>
                  {columns.map((c, index) => {
                    const good = row.highlight?.(index) ?? false;
                    return (
                      <td
                        key={c.project.id}
                        className={cn('border-l border-hairline px-4 py-2.5 align-top', good && 'bg-status-operation-tint font-semibold')}
                      >
                        {c.loading ? (
                          <span className="inline-block h-3.5 w-16 animate-pulse rounded bg-muted" />
                        ) : c.failed ? (
                          <span className="text-muted-foreground">нет сохранённого расчёта</span>
                        ) : (
                          <div className="flex items-start gap-1.5">
                            {good ? <Trophy className="mt-0.5 size-3.5 flex-none text-status-operation" strokeWidth={2} aria-label="лучшее" /> : null}
                            <div className="min-w-0 flex-1">{row.cell(c, index)}</div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}

export default CompareCalculationsPage;
