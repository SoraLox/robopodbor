import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/api/auth';
import type { UserRole } from '@/api/types';

export interface RequireAuthProps {
  children: ReactNode;
  /** Если указана — проверяется роль, а не только факт входа. */
  role?: UserRole;
}

/**
 * Закрывает роут. Пока сессия проверяется — держим экран, чтобы не мигать
 * редиректом. Гость уходит на вход, пользователь без нужной роли — на отказ.
 */
export function RequireAuth({ children, role }: RequireAuthProps) {
  const location = useLocation();
  const { data: user, isPending } = useSession();

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <span className="text-[13px] text-muted-foreground">Проверяем доступ…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
