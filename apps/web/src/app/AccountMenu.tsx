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
    'flex w-full items-center gap-2.5 rounded-[12px] border px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-100',
    active
      ? 'border-foreground bg-white text-foreground'
      : 'border-transparent text-foreground hover:border-[#E5E5EA] hover:bg-[#FAFAFA]',
  );
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

/**
 * Меню профиля: аватар-триггер + выпадающая карточка.
 * Визуально в одном языке с WizardCard / выбором объекта.
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

  const roleLabel = user.role === 'admin' ? 'Admin' : 'User';

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Меню профиля"
        className={cn(
          'flex size-7 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold tracking-tight text-white transition-opacity hover:opacity-90',
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
          <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-1.5">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-white">
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
          </div>

          <div className="mx-1 h-px bg-accent-tint" />

          <div className="flex flex-col gap-0.5 py-1.5">
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
                  className="ml-auto flex size-5 flex-none items-center justify-center rounded-[6px] bg-[#F2F2F2] text-foreground transition-colors hover:bg-[#E5E5EA]"
                >
                  <Plus className="size-3" strokeWidth={2.25} aria-hidden />
                </Link>
              }
            />
            <div className="flex w-full items-center gap-2.5 rounded-[12px] border border-transparent px-2.5 py-1.5 text-[13px] font-medium text-foreground">
              <IdCard className="size-4 flex-none text-foreground" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 truncate">Роль</span>
              <span
                className={cn(
                  'ml-auto inline-flex flex-none items-center rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold',
                  user.role === 'admin'
                    ? 'bg-foreground text-white'
                    : 'bg-[#F2F2F2] text-[#8E8E93]',
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

          <div className="mx-1 h-px bg-accent-tint" />

          <div className="flex flex-col gap-0.5 py-1.5">
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
