/*
  THESIS: первый экран — ясность, не реклама: вопрос про цену/окупаемость
  и одна кнопка уйти в расчёт. Справа — рука робота как визуальный якорь.
  SYSTEM: секции на одной вертикальной ступени (Section), двухколоночные блоки
  на одной сетке 5/7 (Split), заголовки — две роли: text-display-xl для
  первого и последнего экрана, text-title для остальных. Тёмная поверхность
  одна (surface-ink), форма у каждого появления своя: карточка с фото,
  полоса во всю ширину, карточка со свечением.
*/
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import { SiteFooter } from '@/app/AppShell';
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

/** Должно совпадать с imagesizes у preload в index.html, иначе браузер скачает картинку дважды. */
const HERO_IMAGE_SIZES = '(min-width: 1024px) 780px, (min-width: 640px) 58vw, 66vw';

/** Единственный стиль текстовой ссылки на странице. */
const TEXT_LINK =
  'inline-flex w-fit items-center gap-1.5 text-control text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground';

/** Короткая, в три слова, суть каждого типа объекта — без выдуманных цифр. */
const SHORT_BLURB: Record<string, string> = {
  warehouse: 'Хранение и комплектация',
  airport: 'Багаж и логистика',
  clinic: 'Расходники и дезинфекция',
};

/**
 * Типы объектов для лендинга. Если API недоступен (статический хостинг без
 * бэкенда, упавший воркер моков), первый экран не должен превращаться в три
 * серых полосы: показываем те же типы по названиям — без цифр, которых у нас
 * в этот момент нет. Воронка продолжает работать.
 */
type LandingObjectType = {
  slug: string;
  title: string;
  description?: string;
};

const FALLBACK_TYPES: LandingObjectType[] = [
  { slug: 'warehouse', title: 'Склад' },
  { slug: 'airport', title: 'Аэропорт' },
  { slug: 'clinic', title: 'Медучреждение' },
];

/** null — данные ещё едут; массив — есть что показать (настоящее или запасное). */
function useLandingTypes(): { options: LandingObjectType[] | null } {
  const { data, isError } = useObjectTypes();
  if (data) return { options: data };
  if (isError) return { options: FALLBACK_TYPES };
  return { options: null };
}

/** Секция на общей ступени: между соседними секциями ровно 2 × py. */
function Section({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <section className={cn('px-5 py-12 sm:px-8 md:py-16', className)}>
      <div className={cn('mx-auto max-w-site', innerClassName)}>{children}</div>
    </section>
  );
}

/** Общая сетка двухколоночных блоков: заголовок слева, содержание справа. */
function Split({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16',
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'max-w-[18ch] text-balance font-heading text-[1.875rem] font-bold leading-[1.08] tracking-h1 sm:text-[2.25rem] lg:text-[2.5rem]',
        className,
      )}
    >
      {children}
    </h2>
  );
}

type Plan = (typeof PLANS)[number];

function PlanCard({ plan }: { plan: Plan }) {
  const isFree = plan.id === 'calc';
  const href = isFree ? '/calculate/warehouse' : '/login';
  const cta = isFree ? 'Начать расчёт' : 'Обсудить';
  const featured = Boolean(plan.featured);
  const priced = plan.price.match(/^(.+)\s(₽)$/);

  return (
    <article
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-xl border p-6 sm:p-7',
        featured
          ? 'border-primary-bright bg-background shadow-lift'
          : 'border-hairline bg-background shadow-soft',
      )}
    >
      <h3 className="relative text-h3">{plan.name}</h3>

      <div className="relative mt-6 flex items-baseline gap-1.5 text-foreground">
        <span className="text-h1 tabular leading-none">{priced ? priced[1] : plan.price}</span>
        {priced ? <span className="text-body text-muted-foreground">{priced[2]}</span> : null}
      </div>
      <p className="relative mt-2 text-body text-muted-foreground">{plan.note}</p>

      <Button
        asChild
        variant={featured ? 'default' : 'outline'}
        className={cn(
          'relative mt-6 w-full',
          featured &&
            'bg-primary-bright hover:bg-[hsl(214_80%_46%)] focus-visible:outline-primary-bright',
        )}
      >
        <Link to={href}>{cta}</Link>
      </Button>

      <ul className="relative mt-6 flex flex-1 flex-col gap-3 border-t border-hairline pt-6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-body text-muted-foreground">
            <Check
              className={cn(
                'mt-[0.2em] size-4 flex-none',
                featured ? 'text-primary-bright' : 'text-foreground',
              )}
              strokeWidth={2}
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/**
 * Full-bleed hero. Текст и робот — две колонки одной max-w-site сетки;
 * паддинг снаружи, как у шапки, чтобы левый край совпал с логотипом.
 */
function HeroScreen() {
  return (
    <section
      className={cn(
        'hero-shell relative z-0 -mt-14 min-h-svh overflow-x-clip pt-14',
        'motion-safe:animate-[rise_.7s_cubic-bezier(.16,1,.3,1)_both]',
      )}
    >
      <div className="hero-grain" aria-hidden />

      <div className="relative z-[2] px-5 sm:px-8">
        <div className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-site lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 xl:gap-20">
          <div className="relative order-2 flex flex-col justify-center py-12 sm:py-14 lg:order-1 lg:pb-28 lg:pt-12">
            <div className="flex w-full max-w-[32rem] flex-col">
              <h1 className="max-w-[15ch] text-balance font-heading text-[2.5rem] font-bold leading-[1.05] tracking-display text-foreground sm:text-[3.25rem] lg:text-[3.75rem]">
                Сколько стоят роботы и когда они окупятся
              </h1>

              <p className="mt-6 max-w-[38ch] text-body-lg text-muted-foreground sm:text-[1.0625rem] sm:leading-relaxed">
                Введите параметры склада, аэропорта или клиники — получите расчёт окупаемости по
                каталогу реальных решений с указанием источника каждой цифры
              </p>

              <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary-bright hover:bg-[hsl(214_80%_46%)] focus-visible:outline-primary-bright"
                >
                  <Link to="/calculate/warehouse">Рассчитать окупаемость</Link>
                </Button>
                <Link
                  to="/catalog"
                  className="text-control text-foreground/70 underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Каталог
                </Link>
              </div>
            </div>
          </div>

          <div
            className="relative order-1 min-h-[40svh] sm:min-h-[44svh] lg:order-2 lg:min-h-0"
            aria-hidden
          >
            <img
              src={`${import.meta.env.BASE_URL}pics/roboarm3.webp`}
              srcSet={`${import.meta.env.BASE_URL}pics/roboarm3-560.webp 560w, ${import.meta.env.BASE_URL}pics/roboarm3.webp 1121w`}
              sizes={HERO_IMAGE_SIZES}
              alt=""
              width={1121}
              height={1403}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="pointer-events-none absolute bottom-0 right-0 z-[1] h-[min(96svh,980px)] w-auto max-w-[min(110%,780px)] origin-bottom translate-y-[1%] scale-x-[-1] object-contain object-bottom"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Вход в расчёт по типу объекта. Слева — фото объекта, справа — текст и список.
 */
function CatalogSection() {
  const { options } = useLandingTypes();
  const rows = options ?? Array.from<LandingObjectType | undefined>({ length: 3 });

  return (
    <section className="relative z-10 -mt-10 bg-background px-5 pb-16 pt-0 sm:-mt-12 sm:px-8 md:-mt-14 md:pb-24">
      <div className="relative mx-auto max-w-site">
        <div className="hero-panel-catalog relative overflow-hidden rounded-[28px] p-5 sm:p-6 md:p-7">
          <div className="hero-grain" aria-hidden />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <div className="mx-auto size-[300px] shrink-0 overflow-hidden rounded-[22px] bg-black/30 sm:size-[340px] lg:mx-0 lg:size-[360px]">
              <img
                src={`${import.meta.env.BASE_URL}pics/warehouse2.webp`}
                alt=""
                width={480}
                height={480}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col px-1 sm:px-2 md:px-3">
              <header className="max-w-[36rem]">
                <h2 className="text-balance font-heading text-[1.625rem] font-bold leading-[1.1] tracking-h1 text-white sm:text-[1.875rem] lg:text-[2.125rem]">
                  Расчёт строится от объекта
                </h2>
                <p className="mt-3 max-w-[44ch] text-body text-white/70 sm:text-body-lg">
                  У склада, аэропорта и клиники разные процессы и статьи затрат. Выберите тип
                  площадки — откроем сценарии на семь лет под ваши данные.
                </p>
              </header>

              <nav aria-label="Типы объектов" className="mt-8 md:mt-10">
                <ul className="border-t border-white/15">
                  {rows.map((type, index) => {
                    if (!type) {
                      return (
                        <li
                          key={index}
                          className="flex items-center justify-between gap-6 border-b border-white/15 py-5"
                        >
                          <span className="h-6 w-32 animate-pulse rounded bg-white/10" />
                          <span className="hidden h-3.5 w-40 animate-pulse rounded bg-white/10 sm:block" />
                        </li>
                      );
                    }

                    return (
                      <li key={type.slug} className="border-b border-white/15">
                        <Link
                          to={`/calculate/${type.slug}`}
                          className={cn(
                            'group flex items-center gap-4 py-5 outline-none transition-colors duration-200 ease-out sm:gap-6',
                            '-mx-3 rounded-xl px-3',
                            'hover:bg-white/[0.045]',
                            'focus-visible:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                          )}
                        >
                          <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-6">
                            <span className="block font-heading text-[1.25rem] font-semibold leading-tight tracking-h2 text-white sm:text-[1.375rem]">
                              {type.title}
                            </span>
                            <span className="mt-1 block text-body text-white/55 transition-colors duration-200 group-hover:text-white/75 sm:mt-0">
                              {SHORT_BLURB[type.slug] ?? type.description}
                            </span>
                          </div>

                          <span className="flex shrink-0 items-center gap-1.5 text-control text-white/55 transition-colors duration-200 group-hover:text-white">
                            <span className="hidden sm:inline">Рассчитать</span>
                            <ArrowUpRight
                              className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                              strokeWidth={2.25}
                              aria-hidden
                            />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const SCENARIOS = [
  {
    label: 'Ничего не менять',
    value: '214,0',
    delta: null,
    pct: 100,
    bar: 'bg-foreground/45',
  },
  {
    label: 'Купить роботов',
    value: '134,6',
    delta: '−79,4',
    pct: 63,
    bar: 'bg-primary',
  },
  {
    label: 'Взять в аренду',
    value: '154,2',
    delta: '−59,8',
    pct: 72,
    bar: 'bg-foreground/25',
  },
] as const;

function ComparisonSection() {
  return (
    <Section>
      <Split>
        <div>
          <SectionTitle>Сравните решения</SectionTitle>
          <p className="mt-4 max-w-[38ch] text-lead text-muted-foreground">
            Столько стоит склад на <span className="whitespace-nowrap tabular">20 000 м²</span> за
            семь лет в каждом сценарии. Это настоящий расчёт, а не иллюстрация: каждую сумму можно
            раскрыть построчно.
          </p>
          <Link to="/calculate/warehouse/results/demo" className={cn(TEXT_LINK, 'mt-6')}>
            Открыть расчёт целиком
            <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
          </Link>
        </div>

        <figure className="lg:pt-2">
          <div className="grid gap-6">
            {SCENARIOS.map((row) => (
              <div key={row.label} className="grid gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-body text-foreground">{row.label}</span>
                  <span className="flex shrink-0 items-baseline gap-2.5">
                    {row.delta ? (
                      <span className="text-label tabular text-positive">{row.delta} млн</span>
                    ) : null}
                    <span className="text-h2 tabular">
                      {row.value}
                      <span className="ml-1 text-body text-muted-foreground">млн ₽</span>
                    </span>
                  </span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-accent-tint">
                  <div
                    className={cn('absolute inset-y-0 left-0 rounded-full', row.bar)}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <figcaption className="mt-6 max-w-[62ch] text-meta text-muted-foreground">
            Покупка окупается за <span className="tabular">3,2</span> года, на{' '}
            <span className="tabular">0,6</span> года раньше аренды. Средний CAPEX проекта в базе
            составляет <span className="whitespace-nowrap tabular">80 млн ₽</span>.
          </figcaption>
        </figure>
      </Split>
    </Section>
  );
}

/** Доверие: полоса во всю ширину — глава посреди светлой страницы, а не ещё одна карточка. */
function TrustSection() {
  return (
    <section className="surface-ink relative overflow-hidden px-5 py-20 sm:px-8 md:py-28">
      <div className="hero-grain" aria-hidden />

      <div className="relative z-10 mx-auto max-w-site">
        <Split>
          <div>
            <SectionTitle className="text-white">Мы не&nbsp;продаём технику</SectionTitle>
            <p className="mt-4 max-w-[38ch] text-lead text-white/70">
              Зарабатываем на расчёте, а не на продаже и не берём процент с внедрения. Поэтому
              честно показываем и вариант «ничего не покупать».
            </p>
            <Button asChild variant="inverse" className="mt-8">
              <Link to="/methodology">
                Как считаем
                <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
              </Link>
            </Button>
          </div>

          <div className="min-w-0 lg:pt-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/15 pb-3 text-meta text-white/55">
              <span>Источник данных</span>
              <span className="text-right">Обновлён</span>
            </div>

            <ul className="m-0 list-none p-0" aria-label="Источники данных расчёта">
              {SOURCES.map((source) => (
                <li
                  key={source.title}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-white/15 py-4"
                >
                  <span className="relative top-0.5 grid size-6 flex-none place-items-center rounded-full bg-white">
                    <Check
                      className="size-3.5 text-primary-bright"
                      strokeWidth={3}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 text-body text-white">{source.title}</span>
                  <span className="whitespace-nowrap text-right text-meta tabular text-white/55">
                    {source.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Split>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <Section>
      <SectionTitle>Расчёт бесплатный</SectionTitle>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </Section>
  );
}

function FaqSection() {
  return (
    <Section>
      <Split>
        <SectionTitle>Вопросы</SectionTitle>

        <Accordion type="single" collapsible className="border-t border-hairline">
          {FAQ.map((item) => (
            <AccordionItem key={item.q} value={item.q} className="border-b border-hairline">
              <AccordionTrigger className="group flex w-full items-center justify-between gap-6 py-6 text-left">
                <span className="text-h3">{item.q}</span>
                <ChevronDown
                  className="size-4 flex-none text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                  strokeWidth={2}
                  aria-hidden
                />
              </AccordionTrigger>
              <AccordionContent className="max-w-[66ch] pb-6 text-body text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Split>
    </Section>
  );
}

/** Финал повторяет масштаб первого экрана: страница начинается и заканчивается одним вопросом. */
function FinalCtaSection() {
  return (
    <Section>
      <div className="surface-ink-glow relative overflow-hidden rounded-xl px-6 py-20 sm:px-14 md:py-28">
        <div className="hero-grain" aria-hidden />
        <div className="relative z-10 mx-auto flex max-w-[40rem] flex-col items-center text-center">
          <h2 className="max-w-[16ch] text-balance font-heading text-[2.5rem] font-bold leading-[1.05] tracking-display text-white sm:max-w-none sm:text-[3.25rem] lg:text-[3.75rem]">
            Посчитайте свой объект
          </h2>
          <p className="mt-5 max-w-[36ch] text-balance text-lead text-white/70">
            Бесплатно и без регистрации. Отчёт выгружается в PDF и Excel.
          </p>
          <Button asChild size="lg" variant="inverse" className="mt-10">
            <Link to="/calculate/warehouse">
              Начать расчёт
              <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <HeroScreen />
      <CatalogSection />
      <ComparisonSection />
      <TrustSection />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />

      <div className="px-5 sm:px-8">
        <div className="mx-auto max-w-site">
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
