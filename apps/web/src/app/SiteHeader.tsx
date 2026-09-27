import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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

/** Единственная шапка сайта — монтируется один раз в RootLayout. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { data: user } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

          <div className="relative z-10 ml-auto flex items-center gap-5">
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
        </div>
      </div>
    </header>
  );
}
