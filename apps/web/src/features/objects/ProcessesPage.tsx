import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { SiteHeader } from '@/app/AppShell';
import { useSolutions } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataCard } from '@/shared/components';
import { cn } from '@/lib/utils';
import type { Solution } from '@/api/types';

/** Карточка рекомендованного робота — можно включить или исключить из расчёта. */
function RecommendedSolutionCard({
  solution,
  selected,
  onToggle,
}: {
  solution: Solution;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <DataCard selected={selected} onClick={onToggle} padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-accent-tint px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} className="pointer-events-none" tabIndex={-1} />
          <span className="text-[11.5px] font-medium text-primary">Рекомендуем</span>
        </div>
        {solution.score !== undefined ? (
          <span className="flex-none rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold tabular text-foreground">
            {solution.score} балл
          </span>
        ) : null}
      </div>

      <div className="flex gap-3 p-4">
        <div className="flex size-14 flex-none items-center justify-center rounded-lg bg-muted">
          <ImageIcon className="size-5 text-muted-foreground/40" strokeWidth={1.5} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="meta-label uppercase">{solution.vendor}</div>
          <h3 className="mt-0.5 truncate font-heading text-[15px] font-semibold leading-snug tracking-h2">
            {solution.name}
          </h3>
          <p className="mt-1 line-clamp-1 text-[12px] leading-[1.4] text-muted-foreground">
            {solution.useCase}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-hairline px-4 py-3">
        <div>
          <div className="font-heading text-[14px] font-semibold tabular tracking-h2">
            {solution.price}
          </div>
          <div className="meta-label mt-0.5">млн ₽</div>
        </div>
        <div>
          <div className="font-heading text-[14px] font-semibold tabular tracking-h2">
            {solution.payload}
          </div>
          <div className="meta-label mt-0.5">грузопод.</div>
        </div>
        <div>
          <div className="font-heading text-[14px] font-semibold tabular tracking-h2">
            {solution.speed}
          </div>
          <div className="meta-label mt-0.5">скорость</div>
        </div>
      </div>
    </DataCard>
  );
}

function SolutionCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="h-9 animate-pulse bg-muted" />
      <div className="space-y-2.5 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function ProcessesPage() {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const { data: solutions, isLoading } = useSolutions(objectType);
  const [selected, setSelected] = useState<string[]>([]);

  const sortedSolutions = useMemo(
    () => [...(solutions ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [solutions],
  );

  // По умолчанию включаем в расчёт всех роботов, которых мы порекомендовали.
  useEffect(() => {
    if (solutions) setSelected(solutions.map((solution) => solution.id));
  }, [solutions]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-[1380px] px-[18px] pb-[18px]">
        <div className="overflow-hidden rounded-3xl border border-border bg-background">
          <div className="px-6 py-8 sm:px-8">
            <h1 className="font-heading text-[26px] font-bold tracking-h1">
              Роботы для вашего объекта
            </h1>
            <p className="mt-2 max-w-[520px] text-[13px] leading-[1.5] text-muted-foreground">
              По параметрам объекта мы подобрали решения с наивысшим баллом
              соответствия. Уберите то, что не нужно считать.
            </p>

            <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {isLoading
                ? [0, 1, 2].map((key) => <SolutionCardSkeleton key={key} />)
                : sortedSolutions.map((solution) => (
                    <RecommendedSolutionCard
                      key={solution.id}
                      solution={solution}
                      selected={selected.includes(solution.id)}
                      onToggle={() => toggle(solution.id)}
                    />
                  ))}
            </div>

            {!isLoading && sortedSolutions.length === 0 ? (
              <div className={cn('rounded-xl border border-border p-8 text-center text-[13.5px] text-muted-foreground')}>
                Для этого типа объекта в каталоге пока нет решений.
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-5 sm:px-8">
            <Button variant="ghost" onClick={() => navigate(`/calculate/${objectType}/form`)}>
              Назад
            </Button>
            <Button
              size="lg"
              disabled={selected.length === 0}
              onClick={() => navigate(`/calculate/${objectType}/results/demo`)}
            >
              Рассчитать
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProcessesPage;
