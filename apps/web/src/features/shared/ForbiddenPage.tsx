import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import { useSession } from '@/api/auth';

export function ForbiddenPage() {
  const { data: user } = useSession();

  return (
    <DashboardLayout>
      <div className="panel mx-auto max-w-[520px] p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-status-piloting" strokeWidth={1.6} />
        <h1 className="mt-4 text-[18px] font-semibold">Недостаточно прав</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Раздел доступен только администраторам каталога.
          {user ? ` Вы вошли как ${user.name} — роль «${user.role === 'admin' ? 'администратор' : 'пользователь'}».` : ''}
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Вернуться на панель
        </Link>
      </div>
    </DashboardLayout>
  );
}

export default ForbiddenPage;
