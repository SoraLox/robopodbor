import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLogin, useRegister } from '@/api/auth';
import { ArrowUpRight } from 'lucide-react';
import { SiteFooter } from '@/app/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KpiBlock, SectionHeading } from '@/shared/components';
import { RobotArmHero } from './components/RobotArmHero';

const loginSchema = z.object({
  email: z.string().min(1, 'Укажите почту').email('Неверный формат почты'),
  password: z.string().min(6, 'Минимум 6 символов'),
  organization: z.string().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const login = useLogin();
  const registerUser = useRegister();
  const active = mode === 'login' ? login : registerUser;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', organization: '' },
  });

  /** Куда вернуть после входа: откуда пришёл гость, иначе на панель. */
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const onSubmit = handleSubmit(async (values) => {
    await active.mutateAsync(values);
    navigate(from, { replace: true });
  });

  return (
    <div className="mx-auto grid max-w-[1380px] gap-[18px] p-[18px]">
      <div>
        <header className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3">
          <Link to="/" className="font-heading text-[13px] font-bold tracking-[0.02em]">
            РОБОТОПОДБОР<span className="text-primary">.</span>
          </Link>
          <Link
            to="/"
            className="ml-auto text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            На главную
          </Link>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Форма входа */}
          <div className="border-b border-border px-5 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-10">
            <SectionHeading size="display">Подбор</SectionHeading>
            <p className="ml-3.5 mt-4 max-w-[440px] text-[12.5px] leading-[1.55] text-muted-foreground">
              Платформа считает срок окупаемости, CAPEX и OPEX по вашему объекту и
              сравнивает покупку с арендой RaaS — на данных о реальных внедрениях,
              а не на обещаниях вендоров.
            </p>

            <form onSubmit={onSubmit} className="ml-3.5 mt-8 grid max-w-[380px] gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">Рабочая почта</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="a.krylov@volga-logistic.ru"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-[11px] text-destructive">{errors.email.message}</p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-[11px] text-destructive">{errors.password.message}</p>
                ) : null}
              </div>

              {mode === 'register' ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="organization">Организация</Label>
                  <Input
                    id="organization"
                    placeholder="ООО «Волга-Логистик»"
                    {...register('organization')}
                  />
                </div>
              ) : null}

              {active.isError ? (
                <p role="alert" className="text-[12px] text-status-danger">
                  {active.error instanceof Error ? active.error.message : 'Не удалось войти'}
                </p>
              ) : null}

              <Button type="submit" size="lg" disabled={active.isPending} className="mt-2 w-fit">
                {active.isPending
                  ? 'Проверяем…'
                  : mode === 'login'
                    ? 'Войти'
                    : 'Зарегистрироваться'}
                <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
              </Button>

              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="w-fit text-[12px] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {mode === 'login'
                  ? 'Нет учётной записи — зарегистрироваться'
                  : 'Уже есть учётная запись — войти'}
              </button>

              <div className="mt-2 rounded-lg border border-border bg-canvas p-3 text-[11px] leading-relaxed text-muted-foreground">
                Демо-доступы: <b>krylov@volga-logistic.ru / volga123</b> — пользователь,
                <br />
                <b>admin@robotopodbor.ru / admin123</b> — администратор каталога.
                <br />
                Расчёт можно пройти и{' '}
                <Link to="/calculate/warehouse" className="text-primary hover:underline">
                  без входа
                </Link>
                .
              </div>
            </form>
          </div>

          {/* Hero: 3D-манипулятор, следящий за курсором */}
          <div className="relative">
            <RobotArmHero className="h-[560px] w-full" />

            <div className="grid grid-cols-2 border-t border-border">
              <div className="border-r border-hairline">
                <KpiBlock
                  size="sm"
                  label="Медианная окупаемость"
                  value="3.2"
                  unit="года"
                  trend="down"
                />
              </div>
              <div>
                <KpiBlock
                  size="sm"
                  label="Решений в базе"
                  value="252"
                  unit="поз."
                  trend="up"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

export default LoginPage;
