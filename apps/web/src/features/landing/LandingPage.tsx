import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Image as ImageIcon,
  ShieldCheck,
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/app/AppShell';
import { useObjectTypes } from '@/api/queries';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FAQ, PLANS, SOURCES } from './content';

/** Общая обёртка секции: воздух сверху и снизу, без разделительных линий. */
function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-[18px] py-10 md:py-14', className)}>
      <div className="mx-auto max-w-[1380px]">{children}</div>
    </section>
  );
}

/** Заголовок раздела: обычный регистр, без надзаголовков — вес несёт сам текст. */
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'font-heading text-[clamp(28px,3.6vw,44px)] font-semibold leading-[1.08] tracking-h1',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/**
 * Число «набегает» до целевого значения при появлении на экране.
 * Стартуем не с нуля, а с наименьшего числа той же разрядности (10 для
 * двузначных, 100 для трёхзначных), чтобы количество цифр не менялось
 * по ходу анимации и колонка не «дёргалась» по ширине.
 */
function CountUp({
  end,
  decimals = 0,
  duration = 1100,
  suffix = '',
}: {
  end: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const digits = Math.floor(Math.abs(end)).toString().length;
  const start = digits > 1 ? 10 ** (digits - 1) : 0;
  const [value, setValue] = useState(start);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(end);
      return;
    }

    let frame = 0;

    const observer = new IntersectionObserver(
      ([entry], obs) => {
        if (!entry?.isIntersecting) return;
        obs.disconnect();

        const startTime = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - (1 - progress) ** 3;
          setValue(start + (end - start) * eased);
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [end, start, duration]);

  return (
    <span ref={ref} className="tabular">
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Временные фото по смыслу — заменить на настоящие фото объектов. */
const PLACEHOLDER_PHOTOS: Record<string, string> = {
  warehouse: `${import.meta.env.BASE_URL}pics/placeholders/warehouse.jpg`,
  airport: `${import.meta.env.BASE_URL}pics/placeholders/airport.jpg`,
  clinic: `${import.meta.env.BASE_URL}pics/placeholders/clinic.jpg`,
};

/** Короткая, в три слова, суть каждого типа объекта — без выдуманных цифр. */
const SHORT_BLURB: Record<string, string> = {
  warehouse: 'Хранение и комплектация',
  airport: 'Багаж и логистика',
  clinic: 'Расходники и дезинфекция',
};

/**
 * Каталог объектов: заголовок слева, справа — ряд карточек по типам
 * площадок. Список типов открытый (грузится из API), но раскладка рассчитана
 * так, чтобы все карточки помещались на экране без прокрутки.
 */
function CatalogSection() {
  const { data: types, isLoading } = useObjectTypes();

  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,1.6fr)] lg:items-start">
        <div>
          <SectionTitle className="max-w-[9ch]">Каталог объектов</SectionTitle>
          <p className="mt-4 max-w-[26ch] text-[15px] leading-[1.5] text-muted-foreground">
            Широкий выбор объектов для вашего бизнеса
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {(isLoading ? Array.from<undefined>({ length: 3 }) : types)?.map((type, index) => (
            <Link key={type?.slug ?? index} to={type ? `/calculate/${type.slug}` : '#'}>
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-3xl bg-muted">
                {!type ? (
                  <div className="size-full animate-pulse bg-muted" />
                ) : PLACEHOLDER_PHOTOS[type.slug] ? (
                  <img
                    src={PLACEHOLDER_PHOTOS[type.slug]}
                    alt=""
                    aria-hidden
                    className="size-full object-cover grayscale"
                  />
                ) : (
                  <ImageIcon className="size-8 text-muted-foreground/40" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              {type ? (
                <div className="mt-3">
                  <h3 className="font-heading text-[20px] font-semibold">{type.title}</h3>
                  <p className="mt-1 text-[15px] text-muted-foreground">
                    {SHORT_BLURB[type.slug] ?? type.description}
                  </p>
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* 1 — ГЕРОЙ. Компактная скруглённая панель, целиком в первом экране, вплотную к шапке. */}
      <section className="px-[18px]">
        <div className="relative mx-auto max-w-[1380px] overflow-hidden rounded-3xl border border-border bg-background text-foreground">
          <div className="grid motion-safe:animate-[rise_.7s_cubic-bezier(.16,1,.3,1)_both] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
            <div className="px-8 py-14 sm:px-12 sm:py-16">
              <h1
                className="max-w-[22ch] font-heading font-semibold leading-[1.08] tracking-display"
                style={{ fontSize: 'clamp(28px, 3.4vw, 44px)' }}
              >
                Сколько стоят роботы и когда они окупятся
              </h1>

              <p className="mt-5 max-w-[42ch] text-[15px] leading-[1.6] text-muted-foreground">
                Впишите данные склада, аэропорта или клиники — получите точный
                расчёт по ценам настоящих поставщиков, а не по обещаниям
                продавца.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Button asChild size="lg">
                  <Link to="/calculate/warehouse">
                    Рассчитать объект
                    <ArrowUpRight className="size-4" strokeWidth={2.25} />
                  </Link>
                </Button>
                <Link
                  to="/methodology"
                  className="text-[14px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Как мы считаем
                </Link>
              </div>
            </div>

            <div className="relative h-[260px] overflow-hidden bg-background sm:h-[340px] lg:h-full">
              <img
                src={`${import.meta.env.BASE_URL}pics/roboarm3.png`}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full -translate-y-12 scale-x-[-1.6] scale-y-[1.6] object-contain object-bottom px-4 pt-4 sm:-translate-y-16 sm:px-6 sm:pt-6"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Метрики — вынесены в ряд под геро-панелью. */}
      <section className="px-[18px] pt-3">
        <div className="mx-auto grid max-w-[1380px] grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="flex items-center gap-1.5 font-heading text-[26px] font-semibold tracking-h1">
              <CountUp end={3.2} decimals={1} />
              <ArrowDownRight className="size-4 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">года медианная окупаемость</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="flex items-center gap-1.5 font-heading text-[26px] font-semibold tracking-h1">
              <CountUp end={252} />
              <ArrowUpRight className="size-4 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">решений в базе</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="font-heading text-[26px] font-semibold tracking-h1">
              <CountUp end={37} />
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">внедрений 2021–2026</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="font-heading text-[26px] font-semibold tracking-h1">
              <CountUp end={80} suffix=" млн ₽" />
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">средний CAPEX проекта</div>
          </div>
        </div>
      </section>

      {/* 2 — КАТАЛОГ ОБЪЕКТОВ. Типы площадок, под которые считаем расчёт. */}
      <CatalogSection />

      {/* 3 — РЕШЕНИЕ. Показываем сам продукт, а не описание продукта. */}
      <Section>
        <div className="rounded-3xl border border-border bg-background p-8 sm:p-12">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="flex flex-col">
              <SectionTitle>Сравните решения</SectionTitle>
              <p className="mt-5 max-w-[44ch] text-[15px] leading-[1.6] text-muted-foreground">
                Столько за семь лет теряет склад на 20 000 м², если не
                покупает роботов. Справа — настоящий расчёт, а не иллюстрация:
                каждую сумму можно раскрыть построчно.
              </p>
              <Link
                to="/calculate/warehouse/results/demo"
                className="mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-canvas px-5 py-2.5 text-[14px] font-medium text-primary hover:bg-accent-tint"
              >
                Открыть расчёт целиком
                <ArrowUpRight className="size-4" strokeWidth={2.25} />
              </Link>
            </div>

            <figure className="flex flex-col justify-center rounded-2xl bg-canvas p-6 sm:p-8">
              <div className="grid gap-3">
                {(
                  [
                    { label: 'Ничего не менять', value: '214,0 млн', delta: null, pct: 100, tone: 'base' },
                    { label: 'Купить роботов', value: '134,6 млн', delta: '−79,4', pct: 63, tone: 'primary' },
                    { label: 'Взять в аренду', value: '154,2 млн', delta: '−59,8', pct: 72, tone: 'muted' },
                  ] as const
                ).map((row) => (
                  <div key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-4">
                    <div className="relative h-12 overflow-hidden rounded-xl bg-border/25">
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 flex items-center rounded-xl px-4',
                          row.tone === 'primary' && 'bg-primary',
                          row.tone === 'base' && 'bg-border',
                          row.tone === 'muted' && 'border border-border bg-background',
                        )}
                        style={{ width: `${row.pct}%` }}
                      >
                        <span
                          className={cn(
                            'truncate text-[13.5px] font-medium',
                            row.tone === 'primary' ? 'text-primary-foreground' : 'text-foreground',
                          )}
                        >
                          {row.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-right font-heading text-[16px] font-bold tabular tracking-h1">
                        {row.value}
                      </span>
                      {row.delta && (
                        <span className="flex items-center gap-0.5 text-[12px] font-semibold text-status-operation">
                          <ArrowDownRight className="size-3" strokeWidth={2.5} />
                          {row.delta}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-6 border-t border-hairline pt-4 text-[13px] leading-[1.6] text-muted-foreground">
                Покупка окупается за 3,2 года — на 0,6 года раньше аренды.
              </p>
            </figure>
          </div>
        </div>
      </Section>

      {/* 4 — ДОВЕРИЕ. Одна мысль: у каждой цифры есть проверяемый источник. */}
      <Section>
        <div className="rounded-3xl border border-border bg-background p-8 sm:p-12">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-accent-tint text-primary">
                <ShieldCheck className="size-5" strokeWidth={2} aria-hidden />
              </div>
              <SectionTitle>Мы - независимый агрегатор</SectionTitle>
              <p className="mt-5 max-w-[42ch] text-[15px] leading-[1.6] text-muted-foreground">
                Мы зарабатываем на расчёте, а не на продаже техники. Поэтому
                честно показываем и вариант «ничего не покупать».
              </p>
            </div>

            <div>
              <div className="grid grid-cols-[1fr_120px] gap-3 px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <span></span>
                <span className="text-right">Обновлён</span>
              </div>

              <div className="grid gap-2">
                {SOURCES.map((source) => (
                  <div
                    key={source.title}
                    className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl border border-border bg-canvas px-5 py-3.5"
                  >
                    <span className="text-[14px] font-medium">{source.title}</span>
                    <span className="text-right meta-label">{source.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 6 — ЦЕНЫ И ГАРАНТИЯ. */}
      <Section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle>Расчёт бесплатный</SectionTitle>
          
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col gap-6 rounded-3xl border p-8',
                plan.featured
                  ? 'border-primary bg-primary text-primary-foreground shadow-lift'
                  : 'border-border bg-background',
              )}
            >
              <div>
                <h3 className="font-heading text-[16px] font-semibold">{plan.name}</h3>
                <div className="mt-4 font-heading text-[34px] font-semibold leading-none tabular tracking-h1">
                  {plan.price}
                </div>
                <div
                  className={cn(
                    'mt-2 text-[13px]',
                    plan.featured ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {plan.note}
                </div>
              </div>

              <ul className="grid gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-[14px] leading-[1.5]">
                    <Check className="mt-0.5 size-4 flex-none" strokeWidth={2.25} aria-hidden />
                    <span className={plan.featured ? '' : 'text-muted-foreground'}>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.featured ? 'default' : 'outline'}
                className={cn(
                  'mt-auto w-fit',
                  plan.featured && 'bg-background text-foreground hover:bg-background/90',
                )}
              >
                <Link to={plan.id === 'calc' ? '/calculate/warehouse' : '/login'}>
                  {plan.id === 'calc' ? 'Начать расчёт' : 'Обсудить'}
                </Link>
              </Button>
            </div>
          ))}
        </div>

        
      </Section>

      {/* 7 — ВОЗРАЖЕНИЯ. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <SectionTitle>Вопросы</SectionTitle>

          <Accordion type="single" collapsible className="grid gap-3">
            {FAQ.map((item) => (
              <AccordionItem
                key={item.q}
                value={item.q}
                className="rounded-2xl border border-border bg-background px-6"
              >
                <AccordionTrigger className="group flex w-full items-center justify-between gap-6 py-5 text-left">
                  <span className="font-heading text-[15px] font-semibold">{item.q}</span>
                  <ChevronDown
                    className="size-4 flex-none text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                    strokeWidth={2}
                    aria-hidden
                  />
                </AccordionTrigger>
                <AccordionContent className="max-w-[66ch] pb-5 text-[14px] leading-[1.65] text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* 8 — ФИНАЛЬНЫЙ ПРИЗЫВ. */}
      <Section>
        <div className="rounded-3xl bg-primary px-8 py-16 text-primary-foreground sm:px-14 md:py-20">
          <h2 className="max-w-[16ch] font-heading text-[clamp(28px,4.4vw,52px)] font-semibold leading-[1.05] tracking-display">
            Посчитайте свой объект
          </h2>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-5">
            <Button
              asChild
              size="lg"
              className="bg-background text-foreground hover:bg-background/90"
            >
              <Link to="/calculate/warehouse">
                Рассчитать объект
                <ArrowUpRight className="size-4" strokeWidth={2.25} />
              </Link>
            </Button>
            <p className="text-[13px] text-primary-foreground/75">
              Четыре минуты · без регистрации · черновик хранится 30 дней
            </p>
          </div>
        </div>
      </Section>

      <div className="mx-auto max-w-[1380px] px-[18px] pb-[18px]">
        <SiteFooter />
      </div>
    </div>
  );
}

export default LandingPage;
