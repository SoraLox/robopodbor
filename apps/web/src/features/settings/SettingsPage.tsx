import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, KeyRound, LogOut, UserRound } from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import { useLogout, useSession } from '@/api/auth';
import { useChangePassword, useUpdateProfile } from '@/api/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор каталога',
  user: 'Пользователь',
};

const ROLE_NOTE: Record<string, string> = {
  admin: 'Расчёты, избранное, правка каталога решений, справочников и нормативов',
  user: 'Расчёты, сохранение и сравнение расчётов, избранные роботы',
};

const dateOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined;

const MIN_PASSWORD = 6;

/** Учётная запись: идентификационные данные, профиль, пароль, выход. */
export function SettingsPage() {
  const { data: user } = useSession();

  return (
    <DashboardLayout>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Учётная запись</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Данные для входа и идентификации. Имя и организация попадают в выгружаемые отчёты.
        </p>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <Section icon={UserRound} title="Идентификационные данные">
          <dl className="grid gap-px overflow-hidden rounded-[14px] border border-hairline bg-hairline sm:grid-cols-2">
            <Field label="ФИО" value={user?.name} />
            <Field label="Рабочая почта (логин)" value={user?.email} />
            <Field label="Организация" value={user?.organization} />
            <Field label="Роль" value={user ? ROLE_LABEL[user.role] ?? user.role : undefined} note={user ? ROLE_NOTE[user.role] : undefined} />
            <Field label="Дата регистрации" value={dateOf(user?.createdAt)} />
            <Field label="ID пользователя" value={user?.id} mono />
          </dl>
        </Section>

        {user ? <ProfileForm key={user.id} name={user.name} organization={user.organization ?? ''} /> : null}

        <PasswordForm changedAt={user?.passwordChangedAt} />

        <SessionSection />
      </div>
    </DashboardLayout>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel self-start p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-[#F2F2F2] text-foreground">
          <Icon className="size-4" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          {description ? <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, note, mono }: { label: string; value?: string; note?: string; mono?: boolean }) {
  return (
    <div className="bg-background p-3.5">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 break-words text-[14px] font-medium', mono && 'font-mono text-[12.5px]')}>
        {value ?? <span className="font-normal text-muted-foreground">не указано</span>}
      </dd>
      {note ? <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Saved({ children }: { children: ReactNode }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-status-operation">
      <CheckCircle2 className="size-4" strokeWidth={1.8} aria-hidden />
      {children}
    </span>
  );
}

function useFlag(timeoutMs = 3000) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = window.setTimeout(() => setOn(false), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [on, timeoutMs]);
  return [on, setOn] as const;
}

function ProfileForm({ name: initialName, organization: initialOrganization }: { name: string; organization: string }) {
  const update = useUpdateProfile();
  const nameId = useId();
  const orgId = useId();
  const [name, setName] = useState(initialName);
  const [organization, setOrganization] = useState(initialOrganization);
  const [saved, setSaved] = useFlag();
  const emptyName = name.trim().length === 0;
  const dirty = name.trim() !== initialName || organization.trim() !== initialOrganization;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (emptyName || !dirty) return;
    update.mutate({ name: name.trim(), organization: organization.trim() }, { onSuccess: () => setSaved(true) });
  };

  return (
    <Section icon={UserRound} title="Профиль" description="Как вас подписывать в расчётах и отчётах для инвесткомитета.">
      <form onSubmit={onSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={nameId} className="text-[12.5px] font-medium text-muted-foreground">
            ФИО
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={120}
            autoComplete="name"
            aria-invalid={emptyName}
            onChange={(event) => setName(event.target.value)}
          />
          {emptyName ? <p className="text-[12px] text-status-danger">Имя не может быть пустым</p> : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={orgId} className="text-[12.5px] font-medium text-muted-foreground">
            Организация
          </label>
          <Input
            id={orgId}
            value={organization}
            maxLength={200}
            autoComplete="organization"
            placeholder="например, ООО «Волга-Логистик»"
            onChange={(event) => setOrganization(event.target.value)}
          />
        </div>
        {update.isError ? (
          <p role="alert" className="text-[12.5px] text-status-danger">
            {update.error instanceof Error ? update.error.message : 'Не удалось сохранить'}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={!dirty || emptyName || update.isPending}>
            {update.isPending ? 'Сохраняем…' : 'Сохранить изменения'}
          </Button>
          {saved ? <Saved>Профиль сохранён</Saved> : null}
        </div>
      </form>
    </Section>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        className="pr-11"
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
        className="absolute inset-y-0 right-1 my-auto grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" strokeWidth={1.8} /> : <Eye className="size-4" strokeWidth={1.8} />}
      </button>
    </div>
  );
}

function PasswordForm({ changedAt }: { changedAt?: string }) {
  const change = useChangePassword();
  const currentId = useId();
  const nextId = useId();
  const repeatId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useFlag(4000);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = repeat.length > 0 && next !== repeat;
  const ready = current.length > 0 && next.length >= MIN_PASSWORD && next === repeat;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!ready) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setRepeat('');
          setTouched(false);
          setSaved(true);
        },
      },
    );
  };

  return (
    <Section
      icon={KeyRound}
      title="Смена пароля"
      description={
        changedAt
          ? `Пароль последний раз меняли ${dateOf(changedAt)}. После смены другие устройства выйдут из аккаунта.`
          : 'После смены пароля другие устройства выйдут из аккаунта.'
      }
    >
      <form onSubmit={onSubmit} className="grid gap-3" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor={currentId} className="text-[12.5px] font-medium text-muted-foreground">
            Текущий пароль
          </label>
          <PasswordInput
            id={currentId}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            invalid={touched && current.length === 0}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={nextId} className="text-[12.5px] font-medium text-muted-foreground">
              Новый пароль
            </label>
            <PasswordInput id={nextId} value={next} onChange={setNext} autoComplete="new-password" invalid={tooShort} />
            <p className={cn('text-[12px]', tooShort ? 'text-status-danger' : 'text-muted-foreground')}>
              Не короче {MIN_PASSWORD} символов
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={repeatId} className="text-[12.5px] font-medium text-muted-foreground">
              Повторите новый пароль
            </label>
            <PasswordInput id={repeatId} value={repeat} onChange={setRepeat} autoComplete="new-password" invalid={mismatch} />
            {mismatch ? <p className="text-[12px] text-status-danger">Пароли не совпадают</p> : null}
          </div>
        </div>
        {change.isError ? (
          <p role="alert" className="text-[12.5px] text-status-danger">
            {change.error instanceof Error ? change.error.message : 'Не удалось сменить пароль'}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={change.isPending}>
            {change.isPending ? 'Меняем…' : 'Сменить пароль'}
          </Button>
          {saved ? <Saved>Пароль изменён</Saved> : null}
        </div>
      </form>
    </Section>
  );
}

function SessionSection() {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Section icon={LogOut} title="Сеанс" description="Выход завершает сеанс на этом устройстве. Сохранённые расчёты и избранное останутся в аккаунте.">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
      >
        <LogOut className="size-4" strokeWidth={1.8} aria-hidden />
        Выйти из аккаунта
      </Button>
    </Section>
  );
}

export default SettingsPage;
