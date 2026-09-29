import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useSession } from '@/api/auth';
import { useCreateProject, useProjects } from '@/api/queries';
import { useWizardStore } from '@/app/store';
import type { CalculationResult } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * «Сохранить расчёт» в личный кабинет. Гостя отправляем на вход и возвращаем
 * на этот же результат. Уже сохранённый расчёт (открыт из «Моих расчётов»)
 * показывает ссылку на список.
 */
export function SaveCalculationButton({
  data,
  objectType,
  calculationId,
}: {
  data: CalculationResult;
  objectType: string;
  calculationId: string;
}) {
  const { data: user } = useSession();
  const { data: projects } = useProjects(Boolean(user));
  const createProject = useCreateProject();
  const { parameters, processes, solutionId } = useWizardStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [savedId, setSavedId] = useState<string | null>(null);

  const alreadySaved = savedId !== null || Boolean(projects?.some((project) => project.id === calculationId));
  const base =
    'flex h-8 flex-none items-center gap-1 rounded-[8px] px-2 text-[11.5px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50';

  if (alreadySaved) {
    return (
      <Link to="/projects" className={cn(base, 'bg-status-operation-tint text-status-operation hover:opacity-90')} title="Открыть «Мои расчёты»">
        <BookmarkCheck className="size-4" strokeWidth={1.8} aria-hidden />
        Сохранён
      </Link>
    );
  }

  const save = () => {
    if (!user) {
      navigate('/login', { state: { from: pathname } });
      return;
    }
    const title = `${data.objectTitle || 'Расчёт'} · ${new Date().toLocaleDateString('ru-RU')}`;
    const primary = data.solutionId ?? solutionId ?? undefined;
    createProject.mutate(
      {
        title: title.slice(0, 200),
        objectType,
        parameters,
        processes,
        ...(primary ? { solutionId: primary } : {}),
        calculation: data,
        ...(data.modelVersion ? { modelVersion: data.modelVersion } : {}),
      },
      { onSuccess: (detail) => setSavedId(detail.id) },
    );
  };

  return (
    <button
      type="button"
      onClick={save}
      disabled={createProject.isPending}
      className={cn(base, 'bg-foreground text-white hover:bg-foreground/85')}
      aria-label={user ? 'Сохранить расчёт в личный кабинет' : 'Войдите, чтобы сохранить расчёт'}
      title={createProject.isError ? 'Не удалось сохранить — попробуйте ещё раз' : 'Сохранить в «Мои расчёты»'}
    >
      <Bookmark className="size-4" strokeWidth={1.8} aria-hidden />
      {createProject.isPending ? 'Сохраняем…' : createProject.isError ? 'Повторить' : 'Сохранить'}
    </button>
  );
}
