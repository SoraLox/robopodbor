import { DashboardLayout } from '@/app/DashboardLayout';
import { useSession } from '@/api/auth';
import { SectionHeading } from '@/shared/components';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор каталога',
  user: 'Пользователь',
};

/** Пока минимально: учётные данные только на просмотр. Расширять по мере надобности. */
export function SettingsPage() {
  const { data: user } = useSession();

  const fields = [
    { label: 'Имя', value: user?.name ?? '—' },
    { label: 'Рабочая почта', value: user?.email ?? '—' },
    { label: 'Организация', value: user?.organization ?? '—' },
    { label: 'Роль', value: user ? (ROLE_LABEL[user.role] ?? user.role) : '—' },
  ];

  return (
    <DashboardLayout>
      <div className="border-b border-border px-5 py-3.5">
        <h1 className="font-heading text-[22px] font-bold uppercase leading-none tracking-h1">
          Настройки
        </h1>
        <div className="mt-1.5 meta-label">УЧЁТНАЯ ЗАПИСЬ</div>
      </div>

      <SectionHeading className="px-5 pb-3 pt-4">Данные аккаунта</SectionHeading>

      <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-hairline sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label} className="bg-background p-4">
            <dt className="meta-label">{field.label}</dt>
            <dd className="mt-1 text-[14px] font-medium">{field.value}</dd>
          </div>
        ))}
      </dl>

      <p className="px-5 py-4 text-[12.5px] leading-relaxed text-muted-foreground">
        Смена пароля, уведомления и другие параметры появятся в следующих версиях.
      </p>
    </DashboardLayout>
  );
}

export default SettingsPage;
