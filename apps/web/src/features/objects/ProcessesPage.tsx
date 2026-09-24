import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useSolutions } from '@/api/queries';
import type { Solution } from '@/api/types';
import { getFitTone } from '@/features/catalog/fitTone';
import { SolutionPreviewCard } from '@/features/objects/SolutionPreviewCard';
import { WIZARD_COMPANION_ID } from '@/features/objects/WizardCard';
import { cn } from '@/lib/utils';

/**
 * Контент шага 3 внутри WizardCard (без собственной оболочки).
 * Превью порталится в #wizard-companion рядом с карточкой.
 */
function SolutionRow({
  solution,
  selected,
  onSelect,
}: {
  solution: Solution;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = solution.score !== undefined ? getFitTone(solution.score) : null;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors duration-100',
        selected ? 'border-foreground' : 'border-[#E5E5EA] hover:border-[#C7C7CC]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">
          {solution.name}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-snug text-[#8E8E93]">
          {solution.vendor}
        </span>
      </span>

      <span className="flex flex-none flex-col items-end gap-0.5">
        {solution.score !== undefined ? (
          <span className={cn('text-[15px] font-semibold tabular-nums leading-none', tone?.text)}>
            {solution.score}
          </span>
        ) : null}
        <span className="text-[11px] tabular-nums leading-none text-[#8E8E93]">
          {solution.price} млн ₽
        </span>
      </span>
    </button>
  );
}

function RowSkeleton() {
  return <div className="h-[52px] animate-pulse rounded-[12px] bg-[#F2F2F2]" />;
}

export function ProcessesPage({ active = true }: { active?: boolean } = {}) {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const { data: solutions, isLoading } = useSolutions(objectType);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [companion, setCompanion] = useState<HTMLElement | null>(null);

  const rows = useMemo(() => {
    const list = solutions ?? [];
    return [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [solutions]);

  useLayoutEffect(() => {
    setCompanion(document.getElementById(WIZARD_COMPANION_ID));
  }, []);

  useEffect(() => {
    if (!active) setPreviewOpen(false);
  }, [active]);

  const selectedSolution = rows.find((row) => row.id === selectedId) ?? null;

  const openPreview = (id: string) => {
    if (previewOpen && selectedId === id) {
      setPreviewOpen(false);
      return;
    }
    setSelectedId(id);
    setPreviewOpen(true);
  };

  const goCalculate = () => {
    if (!selectedId) return;
    setPreviewOpen(false);
    navigate(`/calculate/${objectType}/calculating`);
  };

  const preview =
    companion &&
    createPortal(
      <SolutionPreviewCard
        solution={selectedSolution}
        open={active && previewOpen && Boolean(selectedSolution)}
        onClose={() => setPreviewOpen(false)}
      />,
      companion,
    );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 [scrollbar-width:thin]"
          role="radiogroup"
          aria-label="Робот для расчёта"
        >
          {isLoading ? (
            <div className="grid gap-2">
              {[0, 1, 2, 3].map((key) => (
                <RowSkeleton key={key} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#8E8E93]">
              Для этого типа объекта в каталоге пока нет решений.
            </p>
          ) : (
            <div className="grid gap-2">
              {rows.map((solution) => (
                <SolutionRow
                  key={solution.id}
                  solution={solution}
                  selected={solution.id === selectedId}
                  onSelect={() => openPreview(solution.id)}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!selectedId}
          onClick={goCalculate}
          className="mt-auto flex h-11 w-full flex-none items-center justify-center rounded-[10px] bg-foreground text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#8E8E93] disabled:opacity-100"
        >
          Рассчитать
        </button>
      </div>

      {preview}
    </>
  );
}

export default ProcessesPage;
