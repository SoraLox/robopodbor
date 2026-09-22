import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '@/api/auth';
import {
  BarChart3,
  Building2,
  FileText,
  Home,
  Layers,
  LibraryBig,
  Menu,
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

/**
 * Каркас рабочей области: боковое меню, контент и рельс.
 * Сайтовая шапка — только SiteHeader в RootLayout, второй полосы сверху нет.
 */
export function DashboardLayout({ children, aside }: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <div className="hidden lg:flex">
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
              className="grid size-11 flex-none place-items-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-canvas hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:hidden"
            >
              <Menu className="size-5" strokeWidth={1.7} />
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
  const { data: user } = useSession();
  // «Справочники» ведёт на /admin, который теперь требует роль admin —
  // обычному пользователю показывать пункт, ведущий на «доступ запрещён», незачем.
  const items = NAV.filter((item) => item.to !== '/admin' || user?.role === 'admin');

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
        {items.map((item) => (
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
