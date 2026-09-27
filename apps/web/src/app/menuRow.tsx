import { Link } from 'react-router-dom';
import { Plus, type LucideIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Общий класс ряда меню профиля и сайдбара кабинета. */
export function menuRowClassName(active?: boolean) {
  return cn(
    'flex w-full items-center gap-2.5 rounded-[12px] border px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-100',
    active
      ? 'border-foreground bg-white text-foreground'
      : 'border-transparent text-foreground hover:border-[#E5E5EA] hover:bg-[#FAFAFA]',
  );
}

export function MenuRow({
  icon: Icon,
  label,
  to,
  onClick,
  active,
  trailing,
}: {
  icon: LucideIcon;
  label: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  trailing?: ReactNode;
}) {
  const className = menuRowClassName(active);
  const content = (
    <>
      <Icon className="size-4 flex-none text-foreground" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );

  if (to) {
    return (
      <Link role="menuitem" to={to} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/** Светлый бейдж справа в ряду — как «User» в меню профиля. */
export function MenuRowBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto inline-flex flex-none items-center rounded-[6px] bg-[#F2F2F2] px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[#8E8E93]">
      {children}
    </span>
  );
}

/** Квадратная микрокнопка «+» внутри ряда. */
export function MenuRowPlus({
  to,
  label,
  onClick,
}: {
  to: string;
  label: string;
  onClick?: (event: MouseEvent) => void;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      onClick={onClick}
      className="flex size-5 flex-none items-center justify-center rounded-[6px] bg-[#F2F2F2] text-foreground transition-colors hover:bg-[#E5E5EA]"
    >
      <Plus className="size-3" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
