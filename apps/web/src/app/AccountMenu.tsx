import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '@/api/auth';
import {
  BadgeCheck,
  FileText,
  IdCard,
  Info,
  LogOut,
  Plus,
  ToggleLeft,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** «Крылов А. В.» → «КА»: инициалы для аватара. */
function initialsOf(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function MenuRow({
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
  trailing?: React.ReactNode;
}) {
  const className = cn(
    'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-[14.5px] font-medium text-neutral-900 transition-colors',
    active ? 'bg-neutral-100' : 'hover:bg-neutral-50',
  );
  const content = (
    <>
      <Icon className="size-[18px] flex-none text-neutral-900" strokeWidth={2} aria-hidden />
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

/**
 * Меню профиля: аватар-триггер + выпадающая карточка.
 * Используется только из SiteHeader — единая точка входа на всех страницах.
 */
export function AccountMenu({ avatarClassName }: { avatarClassName?: string }) {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  if (!user) return null;

  const roleLabel = user.role === 'admin' ? 'ADMIN' : 'USER';

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Меню профиля"
        className={cn(
          'flex size-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#60a5fa_0%,#a78bfa_50%,#f472b6_100%)] text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] ring-2 ring-white transition-transform hover:scale-[1.04]',
          avatarClassName,
        )}
      >
        {initialsOf(user.name)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-[28px] border border-black/5 bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.14)]"
        >
          {/* Профиль: имя, почта, крупный аватар */}
          <div className="flex items-start justify-between gap-3 px-3.5 pb-4 pt-3">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold leading-tight text-neutral-900">
                {user.name}
              </div>
              <div className="mt-0.5 truncate text-[13.5px] text-neutral-400">{user.email}</div>
            </div>
            <span className="flex size-12 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#60a5fa_0%,#a78bfa_50%,#f472b6_100%)] text-[14px] font-bold text-white shadow-[0_2px_10px_rgba(0,0,0,0.14)] ring-4 ring-white">
              {initialsOf(user.name)}
            </span>
          </div>

          <div className="mx-2 h-px bg-neutral-100" />

          <div className="flex flex-col gap-0.5 py-2">
            <MenuRow
              icon={BadgeCheck}
              label="Профиль"
              to="/dashboard"
              active
              onClick={() => setOpen(false)}
            />
            <MenuRow
              icon={FileText}
              label="Мои проекты"
              to="/projects"
              onClick={() => setOpen(false)}
              trailing={
                <Link
                  to="/calculate/warehouse"
                  aria-label="Новый расчёт"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                  }}
                  className="ml-auto flex size-6 flex-none items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-neutral-200"
                >
                  <Plus className="size-3.5" strokeWidth={2.4} aria-hidden />
                </Link>
              }
            />
            <div className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-[14.5px] font-medium text-neutral-900">
              <IdCard className="size-[18px] flex-none text-neutral-900" strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1 truncate">Роль</span>
              <span
                className={cn(
                  'ml-auto inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                  user.role === 'admin'
                    ? 'bg-emerald-400 text-emerald-950'
                    : 'bg-neutral-100 text-neutral-500',
                )}
              >
                {roleLabel}
              </span>
            </div>
            <MenuRow
              icon={ToggleLeft}
              label="Настройки"
              to="/settings"
              onClick={() => setOpen(false)}
            />
          </div>

          <div className="mx-2 h-px bg-neutral-100" />

          <div className="flex flex-col gap-0.5 py-2">
            <MenuRow
              icon={Info}
              label="Методика расчёта"
              to="/methodology"
              onClick={() => setOpen(false)}
            />
            <MenuRow
              icon={LogOut}
              label="Выйти"
              onClick={() => {
                setOpen(false);
                logout.mutate(undefined, { onSuccess: () => navigate('/') });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
