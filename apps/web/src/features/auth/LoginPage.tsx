import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLogin, useRegister } from '@/api/auth';
import { ArrowUpRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/app/AppShell';
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
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto grid max-w-[1380px] gap-[18px] p-[18px]">
        <div className="grid overflow-hidden rounded-3xl border border-border bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Форма входа */}
          <div className="px-6 py-10 sm:px-10 lg:py-14">
            <SectionHeading size="display">Подбор</SectionHeading>
            <p className="mt-4 max-w-[440px] text-[14px] leading-[1.6] text-muted-foreground">
              Впишите данные своего объекта — получите точный расчёт
              окупаемости на цифрах настоящих поставщиков, а не на обещаниях
              продавца.
            </p>

            <form onSubmit={onSubmit} className="mt-8 grid max-w-[380px] gap-4">
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
                  <p className="text-[13px] text-destructive">{errors.email.message}</p>
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
                  <p className="text-[13px] text-destructive">{errors.password.message}</p>
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
                <p role="alert" className="text-[13px] text-status-danger">
                  {active.error instanceof Error ? active.error.message : 'Не удалось войти'}
                </p>
              ) : null}

              <Button type="submit" size="lg" disabled={active.isPending} className="mt-2 w-fit">
                {active.isPending
                  ? 'Проверяем…'
                  : mode === 'login'
                    ? 'Войти'
                    : 'Зарегистрироваться'}
                <ArrowUpRight className="size-4" strokeWidth={2.25} />
              </Button>

              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="w-fit text-[13px] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {mode === 'login'
                  ? 'Нет учётной записи — зарегистрироваться'
                  : 'Уже есть учётная запись — войти'}
              </button>

              <div className="mt-2 rounded-2xl bg-canvas p-4 text-[13px] leading-relaxed text-muted-foreground">
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
          <div className="relative bg-canvas">
            <RobotArmHero className="h-[420px] w-full lg:h-full" />

            <div className="absolute inset-x-6 bottom-6 grid grid-cols-2 gap-3">
              <div className="overflow-hidden rounded-2xl border border-border bg-background/90 backdrop-blur-sm">
                <KpiBlock size="sm" label="Медианная окупаемость" value="3.2" unit="года" trend="down" />
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-background/90 backdrop-blur-sm">
                <KpiBlock size="sm" label="Решений в базе" value="252" unit="поз." trend="up" />
              </div>
            </div>
          </div>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}

export default LoginPage;
