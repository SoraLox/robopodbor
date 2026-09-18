import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/calculate/warehouse', label: 'Новый расчёт' },
  { to: '/projects', label: 'Мои расчёты' },
  { to: '/catalog', label: 'Каталог' },
  { to: '/methodology', label: 'Методика' },
  { to: '/admin', label: 'Справочники' },
];

export interface AppShellProps {
  children: ReactNode;
}

/** Каркас внутренних экранов: шапка с навигацией, карточка контента, подвал. */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="mx-auto grid max-w-[1380px] gap-[18px] px-[18px] pb-[18px]">
      <div>
        <header className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3">
          <Link to="/" className="font-heading text-[13px] font-bold tracking-[0.02em]">
            РОБОТОПОДБОР<span className="text-primary">.</span>
          </Link>

          <nav className="flex flex-wrap gap-4 text-[10px] font-semibold uppercase tracking-[0.12em]">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'pb-0.5 transition-colors',
                    isActive
                      ? 'border-b-2 border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto meta-label">ООО «ВОЛГА-ЛОГИСТИК» / А. КРЫЛОВ</div>
        </header>

        {children}
      </div>

      <SiteFooter />
    </div>
  );
}

/** Общий подвал: одинаковый на лендинге и внутренних экранах. */
export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center gap-4 border-t border-border px-1 py-4">
      <div className="font-heading text-[11px] font-bold tracking-[0.02em] text-muted-foreground">
        РОБОТОПОДБОР<span className="text-primary">.</span>
      </div>
      <nav className="flex flex-wrap gap-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <Link to="/methodology" className="hover:text-foreground">
          Методика
        </Link>
        <Link to="/catalog" className="hover:text-foreground">
          Каталог
        </Link>
        <Link to="/admin" className="hover:text-foreground">
          Источники данных
        </Link>
      </nav>
      <div className="ml-auto meta-label">ДАННЫЕ О 37 ВНЕДРЕНИЯХ · 2021–2026</div>
    </footer>
  );
}
