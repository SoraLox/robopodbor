import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLink } from './BrandMark';

export { SiteHeader, SITE_NAV, type SiteNavItem, type SiteNavPath } from './SiteHeader';

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Каркас внутренних экранов: контент + подвал.
 * Шапка монтируется один раз в RootLayout — сюда её не дублируем.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      {/* Та же сетка, что у SiteHeader / лендинга: gutters px-5/sm:px-8 + max-w-site */}
      <div className="px-5 sm:px-8">
        <div className="mx-auto grid max-w-site gap-[18px]">
          <div className="min-w-0">{children}</div>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

const FOOTER_COLUMNS = [
  {
    title: 'Продукт',
    links: [
      { to: '/calculate/warehouse', label: 'Рассчитать объект' },
      { to: '/catalog', label: 'Каталог решений' },
      { to: '/catalog/compare', label: 'Сравнение решений' },
      { to: '/methodology', label: 'Методика расчёта' },
    ],
  },
  {
    title: 'Аккаунт',
    links: [
      { to: '/login', label: 'Войти' },
      { to: '/dashboard', label: 'Личный кабинет' },
      { to: '/projects', label: 'Мои расчёты' },
    ],
  },
];

/**
 * Общий подвал: белая скруглённая карточка.
 * Бренд слева, колонки ссылок справа, юридическая строка под разделителем.
 */
export function SiteFooter() {
  return (
    <footer>
      <div className="rounded-xl border border-hairline bg-background px-6 py-10 shadow-soft sm:px-10 sm:py-12 md:px-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-20">
          <div className="max-w-[20rem] shrink-0">
            <BrandLink />
            <p className="mt-5 text-body text-muted-foreground">
              Независимый расчёт окупаемости роботов для склада, аэропорта и клиники. Мы не продаём
              технику и не берём процент с внедрения.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-x-12 gap-y-8 sm:gap-x-16 lg:gap-x-24">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <div className="text-control font-semibold text-foreground">{column.title}</div>
                <ul className="mt-4 grid gap-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-body text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-hairline pt-6 sm:mt-12 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-meta text-muted-foreground">© 2026 РОБОПОДБОР</p>
          <Link
            to="/privacy"
            className="text-meta text-muted-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            Политика конфиденциальности
          </Link>
        </div>
      </div>
    </footer>
  );
}
