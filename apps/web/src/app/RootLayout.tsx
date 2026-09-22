import { Outlet } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';

/**
 * Корневой каркас приложения: SiteHeader на каждом маршруте без исключения.
 * Страницы не монтируют шапку сами — только контент через Outlet.
 */
export function RootLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
    </>
  );
}
