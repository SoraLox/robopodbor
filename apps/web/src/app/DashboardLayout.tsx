import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '@/api/auth';
import {
  DatabaseZap,
  FileText,
  Heart,
  Home,
  Info,
  Layers,
  LibraryBig,
  Menu,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuRowPlus, menuRowClassName } from './menuRow';

const PRIMARY_NAV = [
  { to: '/dashboard', label: 'Обзор', icon: Home, end: true },
  { to: '/projects', label: 'Мои расчёты', icon: FileText, plus: true },
  { to: '/favorites', label: 'Избранные роботы', icon: Heart },
  { to: '/catalog', label: 'Каталог решений', icon: Layers },
  { to: '/settings', label: 'Учётная запись', icon: UserRound },
] as const;

/** Только администратору: правка каталога и справочников. */
const ADMIN_NAV = [
  { to: '/admin/catalog', label: 'Редактор каталога', icon: DatabaseZap },
  { to: '/admin', label: 'Справочники и журнал', icon: LibraryBig, end: true },
] as const;

const SECONDARY_NAV = [
  { to: '/methodology', label: 'Методика расчёта', icon: Info },
] as const;

export interface DashboardLayoutProps {
  children: ReactNode;
  /** Правый рельс: события, задачи, быстрые действия. */
  aside?: ReactNode;
}

/**
 * Каркас рабочей области: боковое меню, контент и рельс.
 * Сайтовая шапка — только SiteHeader в RootLayout, второй полосы сверху нет.
 */
export function DashboardLayout({ children, aside }: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen items-start">
        <div className="hidden p-4 lg:block xl:p-5">
          <Sidebar />
        </div>

        {menuOpen ? (
          <MobileMenu onClose={() => setMenuOpen(false)} />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-4 p-4 xl:flex-row xl:gap-5 xl:p-5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              className="grid size-11 flex-none place-items-center rounded-[12px] border border-[#E5E5EA] bg-white text-foreground hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 lg:hidden"
            >
              <Menu className="size-5" strokeWidth={1.75} />
            </button>

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
      <div ref={panel} className="absolute inset-y-0 left-0 flex p-3">
        <Sidebar onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}

function Sidebar({
  onNavigate,
  onClose,
}: { onNavigate?: () => void; onClose?: () => void } = {}) {
  const { data: user } = useSession();
  const primary = PRIMARY_NAV;
  const isAdmin = user?.role === 'admin';

  return (
    <div
      className={cn(
        'w-[248px] flex-none',
        !onClose &&
          'sticky top-[calc(3.5rem+1rem)] self-start xl:top-[calc(3.5rem+1.25rem)]',
      )}
    >
      <div className="overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={cn(menuRowClassName(false), 'mb-0.5 lg:hidden')}
          >
            <X className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Закрыть</span>
          </button>
        ) : null}

        <nav aria-label="Разделы кабинета" className="flex flex-col gap-0.5 py-1.5">
          {primary.map((item) => {
            const withPlus = 'plus' in item && item.plus;
            return (
              <div key={item.to} className="relative">
                <NavLink
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(menuRowClassName(isActive), withPlus && 'pr-9')
                  }
                >
                  <item.icon
                    className="size-4 flex-none text-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </NavLink>
                {withPlus ? (
                  <div className="pointer-events-auto absolute inset-y-0 right-2.5 flex items-center">
                    <MenuRowPlus
                      to="/calculate/warehouse"
                      label="Новый расчёт"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNavigate?.();
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {isAdmin ? (
          <>
            <div className="mx-1 h-px bg-accent-tint" />
            <nav aria-label="Администрирование" className="flex flex-col gap-0.5 py-1.5">
              <div className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#8E8E93]">
                Администрирование
              </div>
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  onClick={onNavigate}
                  className={({ isActive }) => menuRowClassName(isActive)}
                >
                  <item.icon className="size-4 flex-none text-foreground" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </>
        ) : null}

        <div className="mx-1 h-px bg-accent-tint" />

        <nav aria-label="Справка" className="flex flex-col gap-0.5 py-1.5">
          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => menuRowClassName(isActive)}
            >
              <item.icon
                className="size-4 flex-none text-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
