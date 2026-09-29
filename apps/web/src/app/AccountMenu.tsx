import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '@/api/auth';
import { DatabaseZap, FileText, Heart, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuRow, MenuRowPlus } from './menuRow';

/** «Крылов А. В.» → «КА»: инициалы для аватара. */
function initialsOf(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Меню профиля: аватар-триггер + выпадающая карточка.
 * Блок с именем и почтой — сама кнопка «Профиль».
 */
export function AccountMenu({ avatarClassName }: { avatarClassName?: string }) {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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

  const onDashboard = pathname === '/dashboard';

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Меню профиля"
        className={cn(
          'flex size-8 items-center justify-center rounded-full bg-primary-bright text-[11px] font-semibold tracking-tight text-white transition-opacity hover:opacity-90',
          avatarClassName,
        )}
      >
        {initialsOf(user.name)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-5 w-[248px] overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
        >
          <Link
            role="menuitem"
            to="/dashboard"
            aria-current={onDashboard ? 'page' : undefined}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-2.5 rounded-[12px] border px-2 py-2 transition-colors duration-100',
              onDashboard
                ? 'border-foreground bg-white'
                : 'border-transparent hover:border-[#E5E5EA] hover:bg-[#FAFAFA]',
            )}
          >
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-primary-bright text-[11px] font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
                {user.name}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] leading-snug text-[#8E8E93]">
                {user.email}
              </div>
            </div>
          </Link>

          <div className="mx-1 my-1.5 h-px bg-accent-tint" />

          <div className="flex flex-col gap-1 py-0.5">
            <MenuRow
              icon={FileText}
              label="Мои расчёты"
              to="/projects"
              active={pathname === '/projects'}
              onClick={() => setOpen(false)}
              trailing={
                <MenuRowPlus
                  to="/calculate/warehouse"
                  label="Новый расчёт"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                  }}
                />
              }
            />
            <MenuRow
              icon={Heart}
              label="Избранные роботы"
              to="/favorites"
              active={pathname === '/favorites'}
              onClick={() => setOpen(false)}
            />
            {user.role === 'admin' ? (
              <MenuRow
                icon={DatabaseZap}
                label="Редактор каталога"
                to="/admin/catalog"
                active={pathname === '/admin/catalog'}
                onClick={() => setOpen(false)}
              />
            ) : null}
          </div>

          <div className="mx-1 my-1.5 h-px bg-accent-tint" />

          <div className="flex flex-col gap-1 py-0.5">
            <MenuRow
              icon={UserRound}
              label="Учётная запись"
              to="/settings"
              active={pathname === '/settings'}
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
