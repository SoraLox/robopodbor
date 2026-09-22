import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Trash2 } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useCopyProject, useCreateProject, useDeleteProject, useProjects } from '@/api/queries';
import { api } from '@/api/client';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import {
  ComparisonTable,
  KpiBlock,
  SectionHeading,
  StatusBadge,
  type ComparisonColumn,
} from '@/shared/components';
import type { Maturity } from '@/api/types';

const COLUMNS: ComparisonColumn[] = [
  { key: 'title', header: 'Объект', width: 'minmax(0, 1.6fr)' },
  { key: 'meta', header: 'Расчёт', width: 'minmax(0, 1fr)' },
  { key: 'payback', header: 'Окупаемость', width: '110px', align: 'right' },
  { key: 'status', header: 'Статус и действия', width: '230px', align: 'right' },
];

const STATUS_LABEL: Record<Maturity, string> = {
  operation: 'Защищён',
  piloting: 'На согласовании',
  rnd: 'Черновик',
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const copyProject = useCopyProject();
  const { objectType, parameters, processes, loadProject } = useWizardStore();
  const [opening, setOpening] = useState<string | null>(null);

  /** Открыть проект = вернуть его входные параметры в мастер. */
  const reopen = async (projectId: string) => {
    setOpening(projectId);
    try {
      const { data } = await api.GET('/projects/{projectId}', {
        params: { path: { projectId } },
      });
      if (!data) return;
      loadProject({
        objectType: data.objectType,
        parameters: data.parameters,
        ...(data.processes ? { processes: data.processes } : {}),
      });
      navigate(`/calculate/${data.objectType}/form`);
    } finally {
      setOpening(null);
    }
  };

  const saveCurrent = async () => {
    const detail = await createProject.mutateAsync({
      title: `Новый расчёт · ${new Date().toLocaleDateString('ru-RU')}`,
      objectType: objectType ?? 'warehouse',
      parameters,
      processes,
    });
    navigate(`/calculate/${detail.objectType}/results/${detail.calculationId ?? 'demo'}`);
  };

  const rows = (projects ?? []).map((project) => ({
    id: project.id,
    cells: {
      title: <span className="text-[13px] font-semibold">{project.title}</span>,
      meta: <span className="meta-label">{project.meta}</span>,
      payback: (
        <span className="font-heading text-base font-bold tabular tracking-h1">
          {project.payback}
        </span>
      ),
      status: (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusBadge variant={project.status}>{STATUS_LABEL[project.status]}</StatusBadge>
          <button
            type="button"
            onClick={() => void reopen(project.id)}
            disabled={opening === project.id}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {opening === project.id ? 'Открываем…' : 'Открыть'}
          </button>
          <button
            type="button"
            aria-label={`Скопировать расчёт ${project.id}`}
            onClick={() => copyProject.mutate(project.id)}
            disabled={copyProject.isPending}
            className="rounded-md border border-border p-1 text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Copy className="size-3.5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label={`Удалить расчёт ${project.id}`}
            onClick={() => deleteProject.mutate(project.id)}
            className="rounded-md border border-border p-1 text-muted-foreground hover:border-status-danger hover:text-status-danger"
          >
            <Trash2 className="size-3.5" strokeWidth={1.8} />
          </button>
        </div>
      ),
    },
  }));

  return (
    <AppShell>
      <div className="flex flex-col items-stretch border-b border-border sm:flex-row sm:flex-wrap">
        <div className="flex flex-col justify-center px-5 py-3.5">
          <h1 className="font-heading text-[22px] font-bold uppercase leading-none tracking-h1">
            Мои расчёты
          </h1>
          <div className="mt-1.5 meta-label">
            ВСЕГО {projects?.length ?? 0} · ЧЕРНОВИКИ ХРАНЯТСЯ 30 ДНЕЙ
          </div>
        </div>
        <div className="flex flex-col items-stretch sm:ml-auto sm:flex-row">
          <Button
            variant="outline"
            className="px-5 py-3.5"
            onClick={() => void saveCurrent()}
            disabled={createProject.isPending}
          >
            {createProject.isPending ? 'Сохраняем…' : 'Сохранить текущий'}
          </Button>
          <Button asChild className="px-5 py-3.5">
            <Link to="/calculate/warehouse">
              Новый расчёт
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid border-b border-border sm:grid-cols-3">
        <div className="border-r border-hairline">
          <KpiBlock size="sm" label="Объектов в работе" value="3" trend="up" />
        </div>
        <div className="border-r border-hairline">
          <KpiBlock size="sm" label="Медиана окупаемости" value="5.1" unit="года" trend="down" />
        </div>
        <div>
          <KpiBlock size="sm" label="Суммарный CAPEX" value="214" unit="млн ₽" trend="none" />
        </div>
      </div>

      {isLoading ? (
        <div className="p-5">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <>
          <SectionHeading className="px-5 pb-3 pt-4" meta="СОРТИРОВКА: ПО ДАТЕ">
            Расчёты
          </SectionHeading>
          <ComparisonTable columns={COLUMNS} rows={rows} />
        </>
      )}
    </AppShell>
  );
}

export default ProjectsPage;
