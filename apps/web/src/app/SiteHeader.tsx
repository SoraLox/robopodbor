import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useSession } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { AccountMenu } from './AccountMenu';
import { BrandLink } from './BrandMark';
import { cn } from '@/lib/utils';

/** Пункт верхней навигации сайта. */
export interface SiteNavItem {
  to: string;
  label: string;
}

/**
 * Единый набор ссылок шапки. Меняется только здесь —
 * все страницы получают обновление через RootLayout.
 */
export const SITE_NAV = [
  { to: '/calculate/warehouse', label: 'Расчёт' },
  { to: '/catalog', label: 'Каталог' },
] as const satisfies readonly SiteNavItem[];

export type SiteNavPath = (typeof SITE_NAV)[number]['to'];

/** Строка выпадающего мобильного меню — тот же язык, что у AccountMenu. */
function MobileMenuRow({
  to,
  state,
  onClick,
  children,
}: {
  to: string;
  state?: unknown;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="menuitem"
      to={to}
      state={state}
      onClick={onClick}
      className="flex items-center rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium text-foreground transition-colors duration-100 hover:bg-[#FAFAFA]"
    >
      {children}
    </Link>
  );
}

/** Единственная шапка сайта — монтируется один раз в RootLayout. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { data: user } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(event.target as Node)) setMobileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  // На лендинге у верхнего края hero шапка прозрачная — плоскость
  // на весь экран. После скролла — белая заливка и hairline.
  const isLandingHero = location.pathname === '/' && !scrolled;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors',
        isLandingHero ? 'border-transparent bg-transparent' : 'border-hairline bg-background',
      )}
    >
      {/*
        Три зоны в одной линии: логотип / абсолютный центр навигации / действия.
        Абсолютный центр не зависит от ширины левого и правого блоков — иначе
        нав «уплывает» в сторону более лёгкого края и кажется кривым.
      */}
      <div className="px-5 sm:px-8">
        <div className="relative mx-auto flex h-14 max-w-site items-center">
          <BrandLink className="relative z-10" />

          <nav
            aria-label="Основная навигация"
            className="pointer-events-none absolute inset-x-0 hidden items-center justify-center sm:flex"
          >
            <ul className="pointer-events-auto flex items-center gap-7">
              {SITE_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'text-control transition-colors',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="relative z-10 ml-auto flex items-center gap-3 sm:gap-5">
            {/* От sm — ссылки как есть. На мобильном логин/регистрация занимали
                слишком много места и обрезались, поэтому там только меню. */}
            <div className="hidden items-center gap-5 sm:flex">
              {user ? (
                <AccountMenu />
              ) : (
                <>
                  <Link
                    to="/login"
                    state={{ mode: 'register' }}
                    className="text-control text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Регистрация
                  </Link>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/login" state={{ mode: 'login' }}>
                      Войти
                    </Link>
                  </Button>
                </>
              )}
            </div>

            {user ? <AccountMenu avatarClassName="sm:hidden" /> : null}

            {/*
              Мобильное меню: разделы сайта всегда здесь (на мобильном центральная
              навигация выше скрыта), вход/регистрация — только для гостя.
            */}
            <div ref={mobileRef} className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-haspopup="menu"
                aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
                className="flex size-9 items-center justify-center rounded-full border border-[#E5E5EA] text-foreground transition-colors hover:bg-[#FAFAFA]"
              >
                {mobileOpen ? (
                  <X className="size-[18px]" strokeWidth={2} aria-hidden />
                ) : (
                  <Menu className="size-[18px]" strokeWidth={2} aria-hidden />
                )}
              </button>

              {mobileOpen ? (
                <div
                  role="menu"
                  aria-label="Меню"
                  className="absolute right-0 top-full z-50 mt-3 w-[220px] overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex flex-col gap-0.5 py-0.5">
                    {SITE_NAV.map((item) => (
                      <MobileMenuRow key={item.to} to={item.to} onClick={() => setMobileOpen(false)}>
                        {item.label}
                      </MobileMenuRow>
                    ))}
                  </div>

                  {!user ? (
                    <>
                      <div className="mx-1 my-1.5 h-px bg-accent-tint" />
                      <div className="flex flex-col gap-0.5 py-0.5">
                        <MobileMenuRow
                          to="/login"
                          state={{ mode: 'register' }}
                          onClick={() => setMobileOpen(false)}
                        >
                          Регистрация
                        </MobileMenuRow>
                        <MobileMenuRow
                          to="/login"
                          state={{ mode: 'login' }}
                          onClick={() => setMobileOpen(false)}
                        >
                          Войти
                        </MobileMenuRow>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
