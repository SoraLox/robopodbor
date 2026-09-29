import type { MouseEvent } from 'react';
import { Heart } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '@/api/auth';
import { useFavorites, useToggleFavorite } from '@/api/account';
import { cn } from '@/lib/utils';

/**
 * «В избранное» для робота каталога. Гостя ведём на вход и возвращаем обратно:
 * избранное хранится в личном кабинете.
 */
export function FavoriteButton({
  solutionId,
  solutionName,
  variant = 'icon',
  className,
}: {
  solutionId: string;
  solutionName: string;
  variant?: 'icon' | 'button';
  className?: string;
}) {
  const { data: user } = useSession();
  const { data: favorites = [] } = useFavorites();
  const toggle = useToggleFavorite();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const active = favorites.includes(solutionId);

  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (!user) {
      navigate('/login', { state: { from: `${pathname}${search}` } });
      return;
    }
    toggle.mutate({ id: solutionId, favorite: !active });
  };

  const label = active ? `Убрать ${solutionName} из избранного` : `Сохранить ${solutionName} в избранное`;

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors',
          active
            ? 'border-status-danger/30 bg-status-danger-tint text-status-danger'
            : 'border-[#E5E5EA] bg-white text-foreground hover:border-[#C7C7CC]',
          className,
        )}
      >
        <Heart className={cn('size-4', active && 'fill-current')} strokeWidth={1.8} aria-hidden />
        {active ? 'В избранном' : 'В избранное'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(event) => event.stopPropagation()}
      aria-pressed={active}
      aria-label={label}
      title={active ? 'В избранном' : 'В избранное'}
      className={cn(
        'grid size-8 place-items-center rounded-full bg-white/95 shadow-sm backdrop-blur-sm transition-colors',
        active ? 'text-status-danger' : 'text-[#8E8E93] hover:text-foreground',
        className,
      )}
    >
      <Heart className={cn('size-4', active && 'fill-current')} strokeWidth={1.8} aria-hidden />
    </button>
  );
}
