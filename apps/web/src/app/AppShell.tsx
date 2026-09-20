import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const SITE_NAV = [
  { to: '/calculate/warehouse', label: 'Расчёт' },
  { to: '/catalog', label: 'Каталог' },
];

/** Единственная шапка сайта — одна и та же на лендинге и на всех внутренних экранах. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b bg-canvas/85 backdrop-blur-md transition-colors',
        scrolled ? 'border-border' : 'border-transparent',
      )}
    >
      <div className="mx-auto grid max-w-[1380px] grid-cols-2 items-center gap-x-8 gap-y-1.5 px-[18px] py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link to="/" className="order-1 justify-self-start font-heading text-[15px] font-semibold">
          РОБОПОДБОР<span className="text-primary">.</span>
        </Link>
        <Link
          to="/login"
          className="order-2 justify-self-end rounded-full px-5 py-2 text-[14px] font-medium text-foreground transition-colors hover:bg-background hover:shadow-soft sm:order-3"
        >
          Войти
        </Link>
        <nav className="order-3 col-span-2 flex flex-wrap justify-center gap-1 text-[14px] font-medium sm:order-2 sm:col-span-1">
          {SITE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-2 transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-soft'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

export interface AppShellProps {
  children: ReactNode;
}

/** Каркас внутренних экранов: та же шапка SiteHeader, карточка контента, подвал. */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto grid max-w-[1380px] gap-[18px] px-[18px] pb-[18px]">
        <div>{children}</div>
        <SiteFooter />
      </div>
    </div>
  );
}

const FOOTER_COLUMNS = [
  {
    title: 'Продукт',
    links: [
      { to: '/calculate/warehouse', label: 'Рассчитать объект' },
      { to: '/catalog', label: 'Каталог' },
      { to: '/catalog/compare', label: 'Сравнение решений' },
    ],
  },
  {
    title: 'Компания',
    links: [
      { to: '/methodology', label: 'Методика расчёта' },
      { to: '/admin', label: 'Источники данных' },
    ],
  },
  {
    title: 'Аккаунт',
    links: [
      { to: '/login', label: 'Войти' },
      { to: '/dashboard', label: 'Личный кабинет' },
      { to: '/projects', label: 'Проекты' },
    ],
  },
  {
    title: 'Правовое',
    links: [{ to: '/privacy', label: 'Политика конфиденциальности' }],
  },
];

/** Общий подвал: одинаковый на лендинге и внутренних экранах. */
export function SiteFooter() {
  return (
    <footer className="rounded-3xl border border-border bg-background">
      <div className="grid gap-10 px-6 py-10 sm:px-10 sm:py-12 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,0.85fr))]">
        <div>
          <Link to="/" className="font-heading text-[15px] font-semibold">
            РОБОПОДБОР<span className="text-primary">.</span>
          </Link>
          <p className="mt-3 max-w-[26ch] text-[13px] leading-[1.6] text-muted-foreground">
            Независимый расчёт окупаемости роботов для склада, аэропорта и
            клиники.
          </p>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title}>
            <div className="meta-label">{column.title}</div>
            <ul className="mt-3 grid gap-2.5">
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-[13.5px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-6 py-5 sm:px-10">
        <div className="meta-label">© 2026 РОБОПОДБОР. Все права защищены</div>
        <div className="meta-label">Данные о 37 внедрениях · 2021–2026</div>
      </div>
    </footer>
  );
}
