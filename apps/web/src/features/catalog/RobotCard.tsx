import { useState } from 'react';
import type { Maturity, Solution } from '@/api/types';
import { Checkbox } from '@/components/ui/checkbox';
import { robotPhoto } from '@/features/objects/previewImages';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './FavoriteButton';
import { categorize } from './solutionCategory';

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

const MATURITY_DOT: Record<Maturity, string> = {
  operation: 'bg-status-operation',
  piloting: 'bg-status-piloting',
  rnd: 'bg-status-rnd',
};

const MATURITY_TEXT: Record<Maturity, string> = {
  operation: 'text-status-operation',
  piloting: 'text-status-piloting',
  rnd: 'text-status-rnd',
};

/**
 * Карточка робота в каталоге: фото (или плейсхолдер), вендор, название,
 * задача, цена, зрелость и чекбокс сравнения.
 */
export function RobotCard({
  solution,
  selected,
  previewed,
  onOpenPreview,
  onToggleCompare,
}: {
  solution: Solution;
  selected: boolean;
  previewed: boolean;
  onOpenPreview: () => void;
  onToggleCompare: () => void;
}) {
  const category = categorize(solution);
  const Icon = category.icon;
  const photo = robotPhoto(solution);
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(photo) && !broken;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenPreview}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenPreview();
        }
      }}
      aria-pressed={previewed}
      aria-label={solution.name}
      className={cn(
        'group flex h-full cursor-pointer flex-col overflow-hidden rounded-[20px] border bg-white transition-colors',
        previewed
          ? 'border-foreground'
          : selected
            ? 'border-[#C7C7CC]'
            : 'border-[#E5E5EA] hover:border-[#C7C7CC]',
      )}
    >
      <div className="relative flex-none border-b border-[#E5E5EA] bg-[#FAFAFA]">
        {showPhoto ? (
          <img
            src={photo}
            alt=""
            decoding="async"
            loading="lazy"
            onError={() => setBroken(true)}
            className="aspect-[4/3] w-full object-contain object-center p-4"
          />
        ) : (
          <div
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 px-4"
            aria-hidden
          >
            <span className="flex size-12 items-center justify-center rounded-[14px] bg-[#F2F2F2] text-[#8E8E93]">
              <Icon className="size-6" strokeWidth={1.5} />
            </span>
            <span className="text-center text-[12px] font-medium text-[#8E8E93]">{category.label}</span>
          </div>
        )}

        <div
          className="absolute left-3 top-3"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleCompare}
            className="size-[18px] border-[#C7C7CC] bg-white/95 shadow-sm backdrop-blur-sm"
            aria-label={
              selected
                ? `Убрать ${solution.name} из сравнения`
                : `Добавить ${solution.name} в сравнение`
            }
          />
        </div>

        <div className="absolute right-3 top-3">
          <FavoriteButton solutionId={solution.id} solutionName={solution.name} />
        </div>

        {showPhoto ? (
          <span className="absolute bottom-2.5 left-2.5 rounded-[6px] bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
            {category.label}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-meta-foreground">
            {solution.vendor}
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium',
              MATURITY_TEXT[solution.maturity],
            )}
          >
            <span className={cn('size-1.5 rounded-full', MATURITY_DOT[solution.maturity])} aria-hidden />
            {MATURITY_LABEL[solution.maturity]}
          </span>
        </div>

        <h3 className="mt-1 font-heading text-[15px] font-semibold leading-snug tracking-h2 text-foreground line-clamp-2 sm:text-[16px]">
          {solution.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{solution.useCase}</p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="font-heading text-[18px] font-semibold tabular leading-none tracking-h2 text-foreground sm:text-[20px]">
            {solution.price}
            <span className="ml-1 text-[12px] font-medium text-muted-foreground">млн ₽</span>
          </div>
          <span
            className={cn(
              'text-[11.5px] font-medium',
              solution.confidence === 'confirmed' ? 'text-status-confirmed' : 'text-status-piloting',
            )}
          >
            {solution.confidence === 'confirmed' ? 'Подтверждено' : 'Проверить'}
          </span>
        </div>
      </div>
    </article>
  );
}

export function RobotCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-2.5 p-3.5">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-muted pt-1" />
      </div>
    </div>
  );
}
