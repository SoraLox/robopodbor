import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Copy,
  FilePenLine,
  FilePlus2,
  GitCompareArrows,
  History,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import {
  useCopyProject,
  useCreateProject,
  useDeleteProject,
  useProjectHistory,
  useProjects,
  useSolutions,
  useUpdateProject,
  runCalculation,
} from '@/api/queries';
import { api } from '@/api/client';
import { useWizardStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/shared/components';
import { cn } from '@/lib/utils';
import type { Maturity, Project } from '@/api/types';

const STATUS_LABEL: Record<Maturity, string> = {
  operation: 'Защищён',
  piloting: 'На согласовании',
  rnd: 'Черновик',
};

type Toast = { tone: 'ok' | 'error'; message: string };
type PendingDelete = { id: string; title: string; status: Maturity };
type BusyAction = 'results' | 'form' | null;
type Editing = { id: string; title: string; status: Maturity };
type Viewing = { id: string; title: string };

function hasWizardDraft(
  objectType: string | null,
  parameters: Record<string, string>,
): boolean {
  if (!objectType) return false;
  return Object.values(parameters).some((value) => value.trim().length > 0);
}

/** Локальный live-region вместо toast-библиотеки: короткое подтверждение действий. */
function ActionToast({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-5 left-1/2 z-[60] flex max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2.5 rounded-[14px] border px-3.5 py-3 text-[13px] shadow-[0_8px_28px_rgba(0,0,0,0.12)]',
        toast.tone === 'ok'
          ? 'border-[#E5E5EA] bg-white text-foreground'
          : 'border-status-danger/25 bg-white text-status-danger',
      )}
    >
      {toast.tone === 'ok' ? (
        <CheckCircle2 className="mt-0.5 size-4 flex-none text-status-operation" strokeWidth={1.8} />
      ) : null}
      <span className="min-w-0 leading-snug">{toast.message}</span>
    </div>
  );
}

function DeleteDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const protectedCase = pending.status === 'operation';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-foreground/40"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[420px] rounded-[20px] border border-[#E5E5EA] bg-white p-5 shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
      >
        <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em]">
          Удалить расчёт?
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {protectedCase ? (
            <>
              «{pending.title}» — статус <strong className="font-medium text-foreground">Защищён</strong>.
              Удалить без возможности вернуть?
            </>
          ) : (
            <>«{pending.title}» будет удалён.</>
          )}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className="bg-status-danger text-white hover:bg-status-danger/90"
            onClick={onConfirm}
          >
            {busy ? 'Удаляем…' : 'Удалить'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Модальное окно: затемнение, Esc, блокировка прокрутки страницы. */
function DialogShell({
  titleId,
  busy = false,
  onClose,
  children,
  wide = false,
}: {
  titleId: string;
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-foreground/40"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative w-full rounded-[20px] border border-[#E5E5EA] bg-white p-5 shadow-[0_16px_48px_rgba(0,0,0,0.16)]',
          wide ? 'max-w-[560px]' : 'max-w-[420px]',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function EditDialog({
  editing,
  busy,
  error,
  onCancel,
  onSave,
}: {
  editing: Editing;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (next: { title: string; status: Maturity }) => void;
}) {
  const titleId = useId();
  const inputId = useId();
  const statusId = useId();
  const [title, setTitle] = useState(editing.title);
  const [status, setStatus] = useState<Maturity>(editing.status);
  const empty = title.trim().length === 0;

  return (
    <DialogShell titleId={titleId} busy={busy} onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!empty) onSave({ title: title.trim(), status });
        }}
      >
        <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em]">
          Изменить расчёт
        </h2>
        <label htmlFor={inputId} className="mt-4 block text-[12.5px] font-medium text-muted-foreground">
          Название
        </label>
        <input
          id={inputId}
          value={title}
          maxLength={200}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={empty}
          className="mt-1.5 h-10 w-full rounded-[10px] border border-[#E5E5EA] bg-[#FAFAFA] px-3 text-[13.5px] outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/10"
        />
        <label htmlFor={statusId} className="mt-3 block text-[12.5px] font-medium text-muted-foreground">
          Статус
        </label>
        <select
          id={statusId}
          value={status}
          onChange={(event) => setStatus(event.target.value as Maturity)}
          className="mt-1.5 h-10 w-full rounded-[10px] border border-[#E5E5EA] bg-[#FAFAFA] px-2.5 text-[13.5px] outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/10"
        >
          {(['rnd', 'piloting', 'operation'] as const).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
        {error ? (
          <p role="alert" className="mt-3 text-[12.5px] text-status-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={busy || empty}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function HistoryDialog({
  viewing,
  onClose,
  onOpen,
}: {
  viewing: Viewing;
  onClose: () => void;
  onOpen: (snapshotId: string) => void;
}) {
  const titleId = useId();
  const { data: history, isLoading, isError } = useProjectHistory(viewing.id);
  const { data: solutions } = useSolutions();
  const solutionName = (id?: string) => (id ? solutions?.find((s) => s.id === id)?.name ?? id : null);

  return (
    <DialogShell titleId={titleId} onClose={onClose} wide>
      <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em]">
        История расчётов
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        «{viewing.title}». Каждый снимок открывается с теми же данными и версией модели, что и при расчёте.
      </p>
      <div className="mt-4 max-h-[min(360px,55vh)] overflow-y-auto">
        {isLoading ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">Загружаем…</p>
        ) : isError ? (
          <p role="alert" className="py-6 text-center text-[13px] text-status-danger">
            Не удалось загрузить историю
          </p>
        ) : !history || history.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Сохранённых расчётов пока нет — снимок появится после сохранения результата.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-[14px] border border-hairline">
            {history.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] font-medium">
                    {dateTime.format(new Date(item.createdAt))}
                    {index === 0 ? (
                      <span className="rounded-md bg-status-confirmed-tint px-1.5 py-0.5 text-[10.5px] font-medium text-status-confirmed">
                        текущий
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    Данные {item.dataVersion} · модель {item.modelVersion}
                    {solutionName(item.solutionId) ? ` · ${solutionName(item.solutionId)}` : ''}
                  </div>
                </div>
                {item.payback ? (
                  <div className="flex-none text-right text-[12px] text-muted-foreground">
                    <span className="text-[15px] font-semibold tabular text-foreground">{item.payback}</span> г.
                  </div>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => onOpen(item.id)}>
                  Открыть
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </DialogShell>
  );
}

function RowMenu({
  project,
  busy,
  onOpenResults,
  onEditForm,
  onRename,
  onHistory,
  onCopy,
  onDelete,
}: {
  project: Project;
  busy: BusyAction;
  onOpenResults: () => void;
  onEditForm: () => void;
  onRename: () => void;
  onHistory: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const items = [
    {
      key: 'results',
      label: busy === 'results' ? 'Открываем…' : 'Результаты',
      icon: CheckCircle2,
      onClick: () => run(onOpenResults),
      disabled: busy !== null,
    },
    {
      key: 'form',
      label: busy === 'form' ? 'Открываем…' : 'Параметры',
      icon: FilePenLine,
      onClick: () => run(onEditForm),
      disabled: busy !== null,
    },
    {
      key: 'history',
      label: 'История расчётов',
      icon: History,
      onClick: () => run(onHistory),
      disabled: busy !== null,
    },
    {
      key: 'rename',
      label: 'Переименовать',
      icon: Pencil,
      onClick: () => run(onRename),
      disabled: busy !== null,
    },
    {
      key: 'copy',
      label: 'Скопировать',
      icon: Copy,
      onClick: () => run(onCopy),
      disabled: busy !== null,
    },
    {
      key: 'delete',
      label: 'Удалить',
      icon: Trash2,
      onClick: () => run(onDelete),
      disabled: busy !== null,
      danger: true,
    },
  ] as const;

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`Действия: ${project.title}`}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-[12px] text-muted-foreground transition-colors hover:bg-canvas hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-[220px] overflow-hidden rounded-[16px] border border-[#E5E5EA] bg-white p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)]"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={item.onClick}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13px] transition-colors disabled:opacity-50',
                'danger' in item && item.danger
                  ? 'text-status-danger hover:bg-status-danger-tint'
                  : 'text-foreground hover:bg-canvas',
              )}
            >
              <item.icon className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const COMPARE_LIMIT = 4;

/** Сравнить можно только расчёт с результатом — у черновика без робота показателей нет. */
const hasResult = (project: Project) => project.payback.trim() !== '' && project.payback !== '—';

function ProjectRow({
  project,
  busy,
  picked,
  pickDisabled,
  onPick,
  onOpenResults,
  onEditForm,
  onRename,
  onHistory,
  onCopy,
  onDelete,
}: {
  project: Project;
  busy: BusyAction;
  picked: boolean;
  pickDisabled: boolean;
  onPick: () => void;
  onOpenResults: () => void;
  onEditForm: () => void;
  onRename: () => void;
  onHistory: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const comparable = hasResult(project);
  return (
    <li className={cn('border-b border-hairline last:border-b-0', picked && 'bg-[#FAFAFA]')}>
      <div className="grid items-center gap-3 px-4 py-4 sm:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_2.75rem] sm:gap-4 sm:px-5">
        <Checkbox
          checked={picked}
          disabled={!comparable || pickDisabled}
          onCheckedChange={onPick}
          aria-label={comparable ? `Выбрать для сравнения: ${project.title}` : `${project.title}: нет результата для сравнения`}
          title={comparable ? 'Выбрать для сравнения' : 'Нет результата расчёта — сравнивать нечего'}
          className="size-[18px] border-[#C7C7CC]"
        />
        <button
          type="button"
          onClick={onOpenResults}
          disabled={busy !== null}
          className="min-w-0 rounded-[10px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:opacity-60"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 text-[14.5px] font-semibold leading-snug tracking-[-0.015em] text-foreground">
              {project.title}
            </span>
            <StatusBadge
              variant={project.status}
              className={cn(
                'rounded-md border-0 border-l-[3px] px-2 py-1 text-[11px] normal-case tracking-normal',
                project.status === 'operation' && 'bg-status-operation-tint',
                project.status === 'piloting' && 'bg-status-piloting-tint',
                project.status === 'rnd' && 'bg-status-rnd-tint',
              )}
            >
              {STATUS_LABEL[project.status]}
            </StatusBadge>
          </div>
          <span className="mt-1.5 block text-[12.5px] leading-snug text-muted-foreground">
            {project.meta}
          </span>
        </button>

        <div className="min-w-0 sm:text-right">
          <div className="text-[12px] text-muted-foreground">Окупаемость</div>
          <div className="mt-0.5 flex items-baseline gap-1.5 tabular sm:justify-end">
            <span className="text-[18px] font-semibold leading-none tracking-[-0.02em]">
              {project.payback}
            </span>
            <span className="text-[12px] text-muted-foreground">года</span>
          </div>
        </div>

        <div className="flex justify-end">
          <RowMenu
            project={project}
            busy={busy}
            onOpenResults={onOpenResults}
            onEditForm={onEditForm}
            onRename={onRename}
            onHistory={onHistory}
            onCopy={onCopy}
            onDelete={onDelete}
          />
        </div>
      </div>
    </li>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading, isError, refetch, isFetching } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const copyProject = useCopyProject();
  const updateProject = useUpdateProject();
  const { objectType, parameters, processes, solutionId, loadProject } = useWizardStore();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const draftReady = hasWizardDraft(objectType, parameters);
  const count = projects?.length ?? 0;
  // Удалённые расчёты выпадают из выбора сами.
  const selectedIds = picked.filter((id) => projects?.some((project) => project.id === id && hasResult(project)));
  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length >= COMPARE_LIMIT ? current : [...current, id],
    );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadDetail = async (projectId: string) => {
    const { data, error } = await api.GET('/projects/{projectId}', {
      params: { path: { projectId } },
    });
    if (error || !data) throw new Error('Не удалось открыть расчёт');
    return data;
  };

  const openResults = async (projectId: string, snapshotId?: string) => {
    setBusyId(projectId);
    setBusyAction('results');
    try {
      const detail = await loadDetail(projectId);
      loadProject({
        objectType: detail.objectType,
        parameters: detail.parameters,
        ...(detail.processes ? { processes: detail.processes } : {}),
      });
      navigate(
        `/calculate/${detail.objectType}/results/${snapshotId ?? detail.calculationId ?? 'demo'}`,
      );
    } catch {
      setToast({ tone: 'error', message: 'Не удалось открыть результаты. Попробуйте ещё раз.' });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const editForm = async (projectId: string) => {
    setBusyId(projectId);
    setBusyAction('form');
    try {
      const detail = await loadDetail(projectId);
      loadProject({
        objectType: detail.objectType,
        parameters: detail.parameters,
        ...(detail.processes ? { processes: detail.processes } : {}),
      });
      navigate(`/calculate/${detail.objectType}/form`);
    } catch {
      setToast({ tone: 'error', message: 'Не удалось открыть параметры.' });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const saveDraft = async () => {
    if (!draftReady || !objectType) return;
    try {
      // Снимок результата сохраняется вместе с проектом: повторное открытие
      // покажет тот же расчёт, даже если каталог или нормативы изменятся.
      // Без выбранного робота считать нечего — черновик сохраняется без результата.
      const calculation = solutionId
        ? await runCalculation({ objectType, solutionId, parameters, processes })
        : undefined;
      const detail = await createProject.mutateAsync({
        title: `Черновик · ${new Date().toLocaleDateString('ru-RU')}`,
        objectType,
        parameters,
        processes,
        ...(solutionId ? { solutionId } : {}),
        ...(calculation ? { calculation } : {}),
      });
      setToast({ tone: 'ok', message: 'Черновик сохранён' });
      navigate(`/calculate/${detail.objectType}/results/${detail.calculationId ?? 'demo'}`);
    } catch {
      setToast({ tone: 'error', message: 'Не удалось сохранить' });
    }
  };

  const copy = async (project: Project) => {
    try {
      await copyProject.mutateAsync(project.id);
      setToast({ tone: 'ok', message: 'Скопировано' });
    } catch {
      setToast({ tone: 'error', message: 'Не удалось скопировать' });
    }
  };

  const saveEdit = async (next: { title: string; status: Maturity }) => {
    if (!editing) return;
    try {
      await updateProject.mutateAsync({ projectId: editing.id, patch: next });
      setEditing(null);
      setToast({ tone: 'ok', message: 'Сохранено' });
    } catch {
      // Ошибку показывает сам диалог — окно остаётся открытым для повтора.
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteProject.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
      setToast({ tone: 'ok', message: 'Удалено' });
    } catch {
      setToast({ tone: 'error', message: 'Не удалось удалить' });
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Мои расчёты</h1>
          <p className="mt-1 max-w-[62ch] text-[13px] text-muted-foreground">
            Сохранённые расчёты окупаемости. Отметьте 2–{COMPARE_LIMIT} расчёта галочкой, чтобы сравнить показатели
            бок о бок; меню «⋯» — результаты, параметры, история и копия.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center"
            disabled={selectedIds.length < 2}
            onClick={() => navigate(`/projects/compare?ids=${selectedIds.map(encodeURIComponent).join(',')}`)}
          >
            <GitCompareArrows className="size-4" strokeWidth={1.8} aria-hidden />
            Сравнить{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </Button>
          {draftReady ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-center"
              onClick={() => void saveDraft()}
              disabled={createProject.isPending}
            >
              {createProject.isPending ? 'Сохраняем…' : 'Сохранить черновик'}
            </Button>
          ) : null}
          <Button asChild size="sm" className="justify-center">
            <Link to="/calculate/warehouse">
              <FilePlus2 className="size-4" strokeWidth={1.8} aria-hidden />
              Новый расчёт
            </Link>
          </Button>
        </div>
      </div>

      <section className="panel overflow-visible">
        {isLoading ? (
          <div className="grid gap-0" aria-hidden>
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="grid gap-3 border-b border-hairline px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_2.75rem] sm:px-5"
              >
                <div className="space-y-2">
                  <div className="h-4 w-[55%] animate-pulse rounded-md bg-muted" />
                  <div className="h-3 w-[32%] animate-pulse rounded-md bg-muted" />
                </div>
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] font-medium">Не удалось загрузить</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? 'Повтор…' : 'Повторить'}
            </Button>
          </div>
        ) : count === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Нет расчётов</p>
            <Button asChild size="sm" className="mt-5">
              <Link to="/calculate/warehouse">
                <FilePlus2 className="size-4" strokeWidth={1.8} aria-hidden />
                Новый расчёт
              </Link>
            </Button>
          </div>
        ) : (
          <ul>
            {(projects ?? []).map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                busy={busyId === project.id ? busyAction : null}
                picked={selectedIds.includes(project.id)}
                pickDisabled={!selectedIds.includes(project.id) && selectedIds.length >= COMPARE_LIMIT}
                onPick={() => togglePick(project.id)}
                onOpenResults={() => void openResults(project.id)}
                onEditForm={() => void editForm(project.id)}
                onRename={() => {
                  updateProject.reset();
                  setEditing({ id: project.id, title: project.title, status: project.status });
                }}
                onHistory={() => setViewing({ id: project.id, title: project.title })}
                onCopy={() => void copy(project)}
                onDelete={() =>
                  setPendingDelete({
                    id: project.id,
                    title: project.title,
                    status: project.status,
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {pendingDelete ? (
        <DeleteDialog
          pending={pendingDelete}
          busy={deleteProject.isPending}
          onCancel={() => {
            if (!deleteProject.isPending) setPendingDelete(null);
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {editing ? (
        <EditDialog
          editing={editing}
          busy={updateProject.isPending}
          error={updateProject.isError ? 'Не удалось сохранить. Попробуйте ещё раз.' : null}
          onCancel={() => {
            if (!updateProject.isPending) setEditing(null);
          }}
          onSave={(next) => void saveEdit(next)}
        />
      ) : null}

      {viewing ? (
        <HistoryDialog
          viewing={viewing}
          onClose={() => setViewing(null)}
          onOpen={(snapshotId) => {
            const projectId = viewing.id;
            setViewing(null);
            void openResults(projectId, snapshotId);
          }}
        />
      ) : null}

      <ActionToast toast={toast} />
    </DashboardLayout>
  );
}

export default ProjectsPage;
