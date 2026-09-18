import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useLogout, useSession } from '@/api/auth';
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  FileText,
  Home,
  Layers,
  LibraryBig,
  Menu,
  Search,
  X,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/dashboard', label: 'Главная', icon: Home },
  { to: '/projects', label: 'Расчёты', icon: FileText, badge: 12 },
  { to: '/catalog', label: 'Каталог решений', icon: Layers },
  { to: '/admin', label: 'Справочники', icon: LibraryBig },
  { to: '/methodology', label: 'Методика', icon: BarChart3 },
  { to: '/calculate/warehouse', label: 'Новый расчёт', icon: Building2 },
];

export interface DashboardLayoutProps {
  children: ReactNode;
  /** Правый рельс: события, задачи, быстрые действия. */
  aside?: ReactNode;
}

/** Каркас рабочей области: боковое меню, шапка с поиском, контент и рельс. */
export function DashboardLayout({ children, aside }: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

        {/* Мобильное меню: без него с телефона из раздела было не уйти */}
        {menuOpen ? (
          <MobileMenu onClose={() => setMenuOpen(false)} />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />

          <div className="flex min-w-0 flex-1 flex-col items-start gap-4 p-4 xl:flex-row xl:gap-5 xl:p-5">
            <main className="min-w-0 w-full flex-1">{children}</main>
            {/*
              Рельс не прячем: ниже 1536 он переезжает под контент сеткой,
              иначе «Мои задачи» и «Быстрые действия» просто пропадали.
            */}
            {aside ? (
              <aside className="grid w-full flex-none gap-4 sm:grid-cols-2 xl:sticky xl:top-5 xl:w-[290px] xl:grid-cols-1">
                {aside}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Выдвижное меню — полноценный диалог: ловушка фокуса, закрытие по Escape,
 * заблокированная прокрутка фона. Без этого оверлей был просто картинкой:
 * фокус оставался на body, фон скроллился, а крестик перекрывался панелью.
 */
function MobileMenu({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;

      const items = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Меню разделов"
      className="fixed inset-0 z-50 lg:hidden"
    >
      <button
        type="button"
        aria-label="Закрыть меню"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40"
      />
      <div ref={panel} className="absolute inset-y-0 left-0 flex">
        <Sidebar onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}

function Sidebar({
  onNavigate,
  onClose,
}: { onNavigate?: () => void; onClose?: () => void } = {}) {
  return (
    <div className="flex w-[232px] flex-none flex-col border-r border-border bg-background">
      <Link to="/" className="flex items-start gap-3 border-b border-border px-5 py-4">
        <ShieldCheck className="mt-0.5 size-6 flex-none text-primary" strokeWidth={1.7} />
        <span className="text-[13px] font-semibold leading-tight">
          Роботоподбор
          <span className="mt-0.5 block text-[11px] font-normal text-meta-foreground">
            платформа подбора решений
          </span>
        </span>
      </Link>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="mx-2 mt-2 flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-[12px] text-muted-foreground hover:bg-canvas hover:text-foreground lg:hidden"
        >
          <X className="size-4" strokeWidth={1.7} aria-hidden />
          Закрыть меню
        </button>
      ) : null}

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                // Активный пункт держится не только подложкой: у неё контраст
                // 1.09:1, поэтому состояние несёт ещё и оранжевая планка слева.
                'flex min-h-[44px] items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-[13px] transition-colors',
                isActive
                  ? 'border-l-primary bg-accent-tint font-medium text-foreground'
                  : 'border-l-transparent text-muted-foreground hover:bg-canvas hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn('size-[18px] flex-none', isActive && 'text-primary')}
                  strokeWidth={1.7}
                />
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto text-[11px] tabular text-meta-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <div className="text-[11px] leading-snug text-meta-foreground">
          Данные о 37 внедрениях
          <span className="mt-1 block">2021–2026</span>
        </div>
        <div className="mt-2 text-[11px] text-meta-foreground">v 0.1.0</div>
      </div>
    </div>
  );
}

/** Профиль с рабочим выходом: раньше шеврон обещал меню, которого не было. */
function UserMenu() {
  const { data: user } = useSession();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  const initials = (user?.name ?? 'Гость')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');

  return (
    <div className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="flex min-h-[44px] items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2 hover:bg-canvas"
      >
        <span className="grid size-9 place-items-center rounded-lg bg-accent-tint text-[12px] font-semibold text-primary">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium">{user?.name ?? 'Гость'}</span>
          <span className="block text-[11px] text-meta-foreground">
            {user?.role === 'admin' ? 'Администратор каталога' : 'Пользователь'}
          </span>
        </span>
        <ChevronDown className="size-4 text-meta-foreground" strokeWidth={1.7} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-[220px] rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          <Link
            role="menuitem"
            to="/projects"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center rounded-md px-3 text-[13px] hover:bg-canvas"
          >
            Мои расчёты
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              logout.mutate();
            }}
            className="flex min-h-[44px] w-full items-center rounded-md px-3 text-left text-[13px] hover:bg-canvas"
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopBar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 xl:gap-4 xl:px-5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Открыть меню"
        aria-expanded={menuOpen}
        className="grid size-11 flex-none place-items-center rounded-lg text-muted-foreground hover:bg-canvas hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:hidden"
      >
        {menuOpen ? <X className="size-5" strokeWidth={1.7} /> : <Menu className="size-5" strokeWidth={1.7} />}
      </button>
      <label className="relative min-w-0 flex-1 max-w-[720px]">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-meta-foreground"
          strokeWidth={1.7}
        />
        <span className="sr-only">Поиск по расчётам, решениям и организациям</span>
        <input
          type="search"
          placeholder="Поиск"
          size={1}
          className={cn(
            'h-11 w-full rounded-lg border border-border bg-canvas pl-10 pr-4 text-[13px]',
            'placeholder:text-meta-foreground focus-visible:border-primary focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-primary/25',
          )}
        />
      </label>

      <Link
        to="/admin"
        className="relative grid size-11 flex-none place-items-center rounded-lg text-muted-foreground hover:bg-canvas hover:text-foreground"
      >
        <Bell className="size-[18px]" strokeWidth={1.7} aria-hidden />
        <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-[18px] text-primary-foreground">
          3
        </span>
        <span className="sr-only">Уведомления: 3 новых</span>
      </Link>

      <UserMenu />
    </header>
  );
}
