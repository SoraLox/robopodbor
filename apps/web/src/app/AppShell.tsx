import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export {
  SiteHeader,
  SITE_NAV,
  type SiteNavItem,
  type SiteNavPath,
} from './SiteHeader';

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
      <div className="mx-auto grid max-w-site gap-[18px] px-[18px] pb-[18px]">
        <div className="min-w-0">{children}</div>
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
      { to: '/methodology', label: 'Методика' },
    ],
  },
  {
    title: 'Ресурсы',
    links: [
      { to: '/methodology', label: 'Документация' },
      { to: '/admin', label: 'Источники данных' },
      { to: '/catalog', label: 'Каталог решений' },
      { to: '/login', label: 'Поддержка' },
    ],
  },
  {
    title: 'Компания',
    links: [
      { to: '/', label: 'О продукте' },
      { to: '/login', label: 'Войти' },
      { to: '/dashboard', label: 'Личный кабинет' },
      { to: '/projects', label: 'Проекты' },
    ],
  },
];

/** Марка бренда: чёрный скруглённый квадрат с двумя диагональными штрихами. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
    >
      <rect width="28" height="28" rx="7" fill="currentColor" />
      <path
        d="M8.5 18.5L13.5 9.5M14.5 18.5L19.5 9.5"
        stroke="#fff"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Общий подвал: белая скруглённая карточка + водяной знак бренда снизу.
 * Композиция по референсу Nexiron — бренд слева, три колонки справа,
 * юридическая строка под разделителем.
 */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden pb-[4.75rem] sm:pb-[5.25rem] md:pb-24">
      <div className="relative z-10 rounded-[40px] border border-[#E8E8E8] bg-background px-8 py-10 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-8px_rgba(0,0,0,0.08)] sm:px-12 sm:py-12 md:px-14 md:py-14">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between lg:gap-20 xl:gap-28">
          <div className="max-w-[280px] shrink-0 sm:max-w-[300px]">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 text-foreground"
            >
              <BrandMark className="size-7 shrink-0 text-foreground" />
              <span className="font-heading text-[15px] font-semibold tracking-[-0.02em]">
                РОБОПОДБОР
              </span>
            </Link>
            <p className="mt-5 text-[14px] leading-[1.6] text-muted-foreground">
              РОБОПОДБОР помогает командам превратить сложные данные об объекте
              в ясный расчёт окупаемости — всё нужное в одном месте
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3 sm:gap-x-12 md:gap-x-14 lg:gap-x-[4.5rem]">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <div className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
                  {column.title}
                </div>
                <ul className="mt-[18px] grid gap-[14px]">
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      <Link
                        to={link.to}
                        className="text-[14px] leading-none text-muted-foreground transition-colors hover:text-foreground"
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

        <div className="mt-11 flex flex-col gap-4 border-t border-accent-tint pt-6 sm:mt-12 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:pt-7">
          <p className="text-[13px] leading-none text-muted-foreground">
            © 2026 РОБОПОДБОР. Все права защищены
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              to="/privacy"
              className="text-[13px] leading-none text-muted-foreground underline decoration-muted-foreground decoration-1 underline-offset-[3px] transition-colors hover:text-foreground"
            >
              Условия использования
            </Link>
            <Link
              to="/privacy"
              className="text-[13px] leading-none text-muted-foreground underline decoration-muted-foreground decoration-1 underline-offset-[3px] transition-colors hover:text-foreground"
            >
              Политика конфиденциальности
            </Link>
          </div>
        </div>
      </div>

      {/* Водяной знак: видна только верхняя половина букв под карточкой */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex justify-center overflow-hidden leading-none"
      >
        <span className="translate-y-[46%] select-none whitespace-nowrap font-heading text-[clamp(5.5rem,15.5vw,9.25rem)] font-bold leading-none tracking-[-0.05em] text-[#D0D0D0]">
          РОБОПОДБОР
        </span>
      </div>
    </footer>
  );
}
