import { Suspense } from 'react';
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
      {/*
        Пустая заглушка, а не спиннер: чанк маршрута обычно приезжает за
        десятки миллисекунд, и крутилка успела бы только мигнуть. Высота
        держит скролл, aria-busy сообщает о загрузке скринридеру.
      */}
      <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
        <Outlet />
      </Suspense>
    </>
  );
}
