import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLogin, useRegister } from '@/api/auth';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { SiteHeader } from '@/app/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const REMEMBERED_EMAIL_KEY = 'robopodbor:remembered-email';

const baseFields = {
  email: z.string().min(1, 'Укажите почту').email('Неверный формат почты'),
  password: z.string().min(6, 'Минимум 6 символов'),
};

const loginSchema = z.object({
  ...baseFields,
  rememberMe: z.boolean().optional(),
});

const registerSchema = z
  .object({
    ...baseFields,
    confirmPassword: z.string().min(1, 'Повторите пароль'),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Нужно принять условия обработки данных' }),
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;
type FormValues = LoginValues & Partial<RegisterValues>;

const demoAccounts = [
  { label: 'Пользователь', email: 'krylov@volga-logistic.ru', password: 'volga123' },
  { label: 'Администратор', email: 'admin@robotopodbor.ru', password: 'admin123' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialMode = (location.state as { mode?: 'login' | 'register' } | null)?.mode ?? 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);

  const login = useLogin();
  const registerUser = useRegister();
  const active = mode === 'login' ? login : registerUser;

  const schema = mode === 'login' ? loginSchema : registerSchema;
  const rememberedEmail = useMemo(() => {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setFocus,
    formState: { errors, touchedFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: {
      email: rememberedEmail,
      password: '',
      confirmPassword: '',
      acceptTerms: false,
      rememberMe: Boolean(rememberedEmail),
    },
  });

  useEffect(() => {
    setFocus('email');
  }, [setFocus]);

  // Страница логина всегда на весь экран без скролла документа.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // Кнопки «Регистрация»/«Войти» в шапке всегда ведут на /login с разным
  // state.mode — без этого эффекта переключение не подхватывалось, если
  // пользователь уже был на странице входа (роут не размонтируется).
  useEffect(() => {
    const nextMode = (location.state as { mode?: 'login' | 'register' } | null)?.mode;
    if (nextMode && nextMode !== mode) setMode(nextMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    if (!demoOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (demoRef.current && !demoRef.current.contains(event.target as Node)) {
        setDemoOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [demoOpen]);

  const password = watch('password') ?? '';

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setResetSent(false);
    setDemoOpen(false);
    reset({
      email: watch('email'),
      password: '',
      confirmPassword: '',
      acceptTerms: false,
      rememberMe: watch('rememberMe'),
    });
  };

  const fillDemo = (account: (typeof demoAccounts)[number]) => {
    if (mode !== 'login') setMode('login');
    setValue('email', account.email, { shouldValidate: true });
    setValue('password', account.password, { shouldValidate: true });
    setDemoOpen(false);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (values.rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // localStorage недоступен (приватный режим) — не критично для входа
    }
    await active.mutateAsync(values);
    navigate(from, { replace: true });
  });
  const fieldClass =
    'h-10 rounded-[10px] border-0 bg-[#F3F3F3] px-4 text-[14px] text-foreground shadow-none placeholder:text-[#B0B0B0] hover:border-0 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0';

  const hintClass = 'flex h-5 items-center gap-1 text-[11px] leading-none';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-canvas">
      <SiteHeader />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
        <div className="relative hidden min-h-0 w-1/2 p-3 lg:block xl:p-4">
          <div className="hero-panel relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-[28px] p-10 xl:p-12">
            <div className="hero-grain" aria-hidden />

            <div className="relative z-10 flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[12px] font-medium text-white">252 решения в базе</span>
            </div>

            <div className="relative z-10 grid max-w-[420px] gap-3 pb-2">
              <h1 className="font-heading text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-white xl:text-[2rem]">
                Расчёт окупаемости,
                <br />всегда под рукой
              </h1>
              <p className="max-w-[36ch] text-[14px] leading-relaxed text-white/55">
                РОБОПОДБОР хранит ваши объекты, расчёты и сравнения решений в одном месте —
                без повторного ввода данных.
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-0 w-full flex-col overflow-hidden bg-white px-6 py-5 sm:px-12 lg:w-1/2 lg:px-14">
          <div ref={demoRef} className="absolute right-2 top-2 z-20">
            <button
              type="button"
              onClick={() => setDemoOpen((value) => !value)}
              aria-expanded={demoOpen}
              aria-label="Демо-доступы"
              title="Демо-доступы"
              className="grid size-7 place-items-center rounded-full bg-white text-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.14)]"
            >
              <MoreHorizontal className="size-3.5" strokeWidth={2.25} />
            </button>
            {demoOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-10 w-[220px] rounded-[12px] border border-black/5 bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.22)]">
                <p className="px-2 pb-2 pt-1 text-[11px] font-medium tracking-[-0.01em] text-meta-foreground">
                  Демо-доступ
                </p>
                <div className="grid gap-1">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className="flex h-9 w-full items-center rounded-[10px] bg-[#F3F3F3] px-3 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-[#EBEBEB]"
                    >
                      {account.label}
                    </button>
                  ))}
                </div>
                <p className="px-2 pb-1 pt-2.5 text-[11px] leading-snug text-meta-foreground">
                  Или{' '}
                  <Link
                    to="/calculate/warehouse"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    без входа
                  </Link>
                </p>
              </div>
            ) : null}
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-[360px] flex-1 flex-col justify-center">
            <h2 className="shrink-0 font-heading text-[1.625rem] font-bold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[1.875rem]">
              {mode === 'login' ? 'Вход в кабинет' : 'Регистрация'}
            </h2>

            <form onSubmit={onSubmit} noValidate className="mt-5 grid w-full shrink-0 gap-1">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="email"
                  className="flex h-4 items-center text-[13px] font-medium text-foreground"
                >
                  Рабочая почта
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  placeholder="a.krylov@volga-logistic.ru"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={fieldClass}
                  {...register('email')}
                />
                <div className={hintClass}>
                  {errors.email ? (
                    <p id="email-error" role="alert" className="flex items-center gap-1 text-destructive">
                      <X className="size-3 flex-none" strokeWidth={2.5} />
                      {errors.email.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-1.5">
                <div className="flex h-4 items-center justify-between">
                  <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
                    Пароль
                  </Label>
                  {mode === 'login' ? (
                    <button
                      type="button"
                      onClick={() => setResetSent(true)}
                      className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Забыли пароль?
                    </button>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className={cn(fieldClass, 'pr-11')}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    onKeyUp={(event) => setCapsLockOn(event.getModifierState?.('CapsLock') ?? false)}
                    onBlur={() => setCapsLockOn(false)}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-meta-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div className={hintClass}>
                  {capsLockOn ? (
                    <p className="flex items-center gap-1 text-status-piloting">
                      <AlertTriangle className="size-3 flex-none" strokeWidth={2.25} />
                      Включён Caps Lock
                    </p>
                  ) : errors.password ? (
                    <p id="password-error" role="alert" className="flex items-center gap-1 text-destructive">
                      <X className="size-3 flex-none" strokeWidth={2.5} />
                      {errors.password.message}
                    </p>
                  ) : null}
                </div>
              </div>

              {mode === 'register' ? (
                <div className="grid gap-1.5">
                  <Label
                    htmlFor="confirmPassword"
                    className="flex h-4 items-center text-[13px] font-medium text-foreground"
                  >
                    Повторите пароль
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className={cn(fieldClass, 'pr-11')}
                      aria-invalid={Boolean(errors.confirmPassword)}
                      aria-describedby={
                        errors.confirmPassword ? 'confirm-password-error' : undefined
                      }
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      aria-label={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      aria-pressed={showConfirmPassword}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-meta-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                    {!errors.confirmPassword &&
                    touchedFields.confirmPassword &&
                    password &&
                    watch('confirmPassword') === password ? (
                      <Check
                        className="absolute inset-y-0 right-11 my-auto size-4 text-status-confirmed"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </div>
                  <div className={hintClass}>
                    {errors.confirmPassword ? (
                      <p
                        id="confirm-password-error"
                        role="alert"
                        className="flex items-center gap-1 text-destructive"
                      >
                        <X className="size-3 flex-none" strokeWidth={2.5} />
                        {errors.confirmPassword.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {mode === 'login' ? (
                <label className="mb-2 flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-foreground">
                  <Checkbox
                    checked={Boolean(watch('rememberMe'))}
                    onCheckedChange={(checked) => setValue('rememberMe', checked === true)}
                  />
                  Запомнить меня
                </label>
              ) : (
                <div className="mb-2 grid gap-1">
                  <label className="flex cursor-pointer items-start gap-2.5 text-[12px] text-muted-foreground">
                    <Checkbox
                      className="mt-0.5"
                      checked={Boolean(watch('acceptTerms'))}
                      aria-invalid={Boolean(errors.acceptTerms)}
                      onCheckedChange={(checked) =>
                        setValue('acceptTerms', checked === true)
                      }
                    />
                    <span>
                      Согласен(на) с{' '}
                      <Link to="/privacy" className="text-foreground hover:underline">
                        обработкой персональных данных
                      </Link>
                    </span>
                  </label>
                  {errors.acceptTerms ? (
                    <p role="alert" className="flex items-center gap-1 text-[11px] text-destructive">
                      <X className="size-3 flex-none" strokeWidth={2.5} />
                      {errors.acceptTerms.message}
                    </p>
                  ) : null}
                </div>
              )}

              {resetSent ? (
                <p className="mb-2 flex items-center gap-1.5 rounded-[10px] bg-status-confirmed-tint px-3 py-2 text-[12px] text-status-confirmed">
                  <Check className="size-3.5 flex-none" strokeWidth={2.5} />
                  Инструкция отправлена, если почта зарегистрирована
                </p>
              ) : null}

              {active.isError ? (
                <p role="alert" className="mb-2 flex items-center gap-1.5 text-[12px] text-status-danger">
                  <X className="size-3.5 flex-none" strokeWidth={2.5} />
                  {active.error instanceof Error ? active.error.message : 'Не удалось войти'}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={active.isPending}
                className="h-10 w-full rounded-[10px] text-[14px] font-semibold shadow-[0_10px_28px_-4px_rgba(0,0,0,0.4)] hover:shadow-[0_14px_32px_-6px_rgba(0,0,0,0.45)]"
              >
                {active.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Проверяем…
                  </>
                ) : mode === 'login' ? (
                  'Войти'
                ) : (
                  'Продолжить'
                )}
              </Button>

              <p className="mt-3 text-center text-[13px] text-muted-foreground">
                {mode === 'login' ? 'Нет учётной записи?' : 'Уже есть учётная запись?'}{' '}
                <button
                  type="button"
                  onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                  className="font-medium text-foreground hover:underline"
                >
                  {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
                </button>
              </p>
            </form>
          </div>

          {mode === 'login' ? (
            <p className="mx-auto mt-auto max-w-[360px] shrink-0 pb-1 pt-3 text-center text-[11px] leading-relaxed text-[#B0B0B0]">
              Продолжая, вы соглашаетесь с{' '}
              <Link
                to="/privacy"
                className="underline-offset-2 hover:text-muted-foreground hover:underline"
              >
                Политикой конфиденциальности
              </Link>{' '}
              РОБОПОДБОР.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
