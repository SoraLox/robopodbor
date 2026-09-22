/*
  THESIS: первый экран — ясность, не реклама: вопрос про цену/окупаемость
  и одна кнопка уйти в расчёт. Справа — рука робота как визуальный якорь.
  OWN-WORLD: светлый full-bleed hero на весь viewport, ч/б + grainy blue
  wash в углу; Inter; чёрная кнопка с мягкой тенью (референс Sorcerer).
  STORY: посетитель сразу понимает цену и срок окупаемости роботов —
  и жмёт «Рассчитать».
  FIRST VIEWPORT: edge-to-edge плоскость во весь экран; заголовок; описание;
  одна CTA; робот справа.
  FORM: full-bleed сплит текст/изображение — не inset-карточка.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
*/
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
} from 'lucide-react';
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

/**
 * Секция на белом листе: воздуха много, рамок нет. Границы между смыслами
 * держит расстояние, а не карточка — карточная система снята намеренно.
 */
function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-[18px] py-16 md:py-24', className)}>
      <div className="mx-auto max-w-[1380px]">{children}</div>
    </section>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn('text-h1 max-w-[18ch] text-balance', className)}>{children}</h2>;
}

/**
 * Full-bleed hero. Текст — главный; робот — равновесный якорь справа.
 */
function HeroScreen() {
  return (
    <section
      className={cn(
        'hero-shell relative -mt-14 min-h-svh overflow-hidden pt-14',
        'motion-safe:animate-[rise_.7s_cubic-bezier(.16,1,.3,1)_both]',
      )}
    >
      <div className="hero-grain" aria-hidden />

      <div className="relative z-[1] grid min-h-[calc(100svh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/*
          Робот ~72% правой колонки, чуть вниз — основание обрезано.
        */}
        <div className="relative order-1 min-h-[42svh] overflow-hidden sm:min-h-[46svh] lg:order-2 lg:min-h-0">
          <img
            src={`${import.meta.env.BASE_URL}pics/roboarm3.webp`}
            alt=""
            aria-hidden
            width={1121}
            height={1403}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="pointer-events-none absolute bottom-0 right-[8%] w-[66%] max-w-none origin-bottom translate-y-[6%] scale-x-[-1] sm:w-[70%] sm:translate-y-[7%] lg:right-[10%] lg:w-[72%] lg:translate-y-[8%]"
          />
        </div>

        <div className="relative order-2 flex flex-col justify-center px-6 py-10 sm:px-10 lg:order-1 lg:px-16 lg:py-16 xl:px-24">
          <div className="mx-auto flex w-full max-w-[1380px] flex-col lg:mx-0 lg:max-w-[36rem]">
            <h1 className="max-w-[15ch] text-balance font-heading text-[2.5rem] font-bold leading-[1.05] tracking-display text-foreground sm:text-[3.25rem] lg:text-[3.75rem]">
              Сколько стоят роботы и когда они окупятся
            </h1>

            <p className="mt-5 max-w-[38ch] text-body-lg text-muted-foreground sm:text-[1.0625rem] sm:leading-relaxed">
              Впишите данные склада, аэропорта или клиники — получите точный
              расчёт по ценам настоящих поставщиков, а не по обещаниям продавца.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3">
              <Button
                asChild
                size="lg"
                className="hover:bg-primary hover:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.28)]"
              >
                <Link to="/calculate/warehouse">Рассчитать</Link>
              </Button>
              <Link
                to="/catalog"
                className="text-control text-foreground/70 transition-colors hover:text-foreground"
              >
                Каталог
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Вход в расчёт по типу объекта. Тёмная full-bleed глава после светлого hero:
 * крупные строки-ссылки без декоративной нумерации. Список открытый (из API).
 */
function CatalogSection() {
  const { options } = useLandingTypes();
  const rows = options ?? Array.from<LandingObjectType | undefined>({ length: 3 });

  return (
    <section className="hero-panel-chapter relative overflow-hidden">
      <div className="hero-grain" aria-hidden />

      <div className="relative z-10 mx-auto max-w-[1380px] px-6 py-12 sm:px-10 md:py-16 lg:px-16 xl:px-24">
        <header className="max-w-[36rem]">
          <h2 className="text-balance font-heading text-[1.625rem] font-bold leading-[1.1] tracking-h1 text-white sm:text-[1.875rem] lg:text-[2.125rem]">
            Расчёт строится от объекта
          </h2>
          <p className="mt-3 max-w-[44ch] text-body text-white/70 sm:text-body-lg">
            У склада, аэропорта и клиники разные процессы и статьи затрат.
            Выберите тип площадки — откроем сценарии на семь лет под ваши данные.
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
                      'group flex items-center gap-4 py-5 outline-none transition-colors duration-200 ease-out sm:gap-8',
                      '-mx-3 rounded-xl px-3',
                      'hover:bg-white/[0.045]',
                      'focus-visible:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                    )}
                  >
                    <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-8">
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
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* 1 — ПЕРВЫЙ ЭКРАН */}
      <HeroScreen />

      {/* 2 — КАТАЛОГ ОБЪЕКТОВ */}
      <CatalogSection />

      {/* 3 — РЕШЕНИЕ. Белый лист на сером холсте: суммы крупно, полосы тонкие. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="flex flex-col lg:pt-3">
            <SectionTitle>Сравните решения</SectionTitle>
            <p className="mt-5 max-w-[44ch] text-body-lg text-muted-foreground">
              Столько за семь лет теряет склад на 20 000 м², если не покупает
              роботов. Справа — настоящий расчёт, а не иллюстрация: каждую сумму
              можно раскрыть построчно.
            </p>
            <Link
              to="/calculate/warehouse/results/demo"
              className="mt-7 inline-flex w-fit items-center gap-2 text-control text-foreground underline-offset-4 hover:underline"
            >
              Открыть расчёт целиком
              <ArrowUpRight className="size-4" strokeWidth={2.25} />
            </Link>
          </div>

          <figure className="flex flex-col rounded-3xl bg-background p-6 shadow-soft sm:p-10">
            <div className="grid gap-8">
              {(
                [
                  { label: 'Ничего не менять', value: '214,0 млн', delta: null, pct: 100, tone: 'base' },
                  { label: 'Купить роботов', value: '134,6 млн', delta: '−79,4', pct: 63, tone: 'primary' },
                  { label: 'Взять в аренду', value: '154,2 млн', delta: '−59,8', pct: 72, tone: 'muted' },
                ] as const
              ).map((row) => (
                /*
                  Подпись и сумма — в одной строке, полоса под ними. На узком
                  экране подпись переносится, сумма не сжимается.
                */
                <div key={row.label} className="grid gap-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                    <span className="text-body text-foreground">{row.label}</span>
                    <span className="flex items-baseline gap-1.5 whitespace-nowrap sm:gap-2.5">
                      <span className="font-heading text-[1.375rem] font-bold leading-none tracking-h1 tabular sm:text-[1.75rem]">
                        {row.value}
                      </span>
                      {row.delta && (
                        <span className="flex items-center gap-0.5 text-meta text-status-operation">
                          <ArrowDownRight className="size-3" strokeWidth={2.5} aria-hidden />
                          {row.delta}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="relative h-1 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full',
                        row.tone === 'primary' && 'bg-primary',
                        row.tone === 'base' && 'bg-foreground/30',
                        row.tone === 'muted' && 'bg-foreground/18',
                      )}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <figcaption className="mt-8 border-t border-border/70 pt-5 text-meta text-muted-foreground">
              Покупка окупается за <span className="tabular">3,2</span> года — на
              0,6 года раньше аренды. Средний CAPEX проекта в базе —{' '}
              <span className="tabular">80</span> млн ₽.
            </figcaption>
          </figure>
        </div>
      </Section>

      {/* 4 — ДОВЕРИЕ. Одна мысль: у каждой цифры есть проверяемый источник. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            <SectionTitle>Мы — независимый агрегатор</SectionTitle>
            <p className="mt-5 max-w-[42ch] text-body-lg text-muted-foreground">
              Мы зарабатываем на расчёте, а не на продаже техники. Поэтому честно
              показываем и вариант «ничего не покупать».
            </p>
          </div>

          <div className="min-w-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 pb-3 text-meta text-meta-foreground">
              <span>Источник данных</span>
              <span className="text-right">Обновлён</span>
            </div>

            <div className="border-t border-hairline">
              {SOURCES.map((source) => (
                <div
                  key={source.title}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-4"
                >
                  <span className="min-w-0 text-body">{source.title}</span>
                  <span className="whitespace-nowrap text-right text-meta text-meta-foreground">
                    {source.note}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 5 — ЦЕНЫ. Выделенный тариф берёт тёмную панель — то же пятно, что в герое. */}
      <Section>
        <SectionTitle>Расчёт бесплатный</SectionTitle>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col gap-7 overflow-hidden rounded-3xl p-8',
                plan.featured ? 'hero-panel' : 'bg-canvas',
              )}
            >
              {plan.featured ? <div className="hero-grain" aria-hidden /> : null}

              <div className="relative z-10">
                <h3 className={cn('text-h3', plan.featured && 'text-white')}>{plan.name}</h3>
                <div
                  className={cn(
                    'mt-5 text-display tabular',
                    plan.featured ? 'text-white' : 'text-foreground',
                  )}
                >
                  {plan.price}
                </div>
                <div
                  className={cn(
                    'mt-2 text-meta',
                    plan.featured ? 'text-white/60' : 'text-meta-foreground',
                  )}
                >
                  {plan.note}
                </div>
              </div>

              <ul className="relative z-10 grid gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-body">
                    <Check
                      className={cn(
                        'mt-1 size-4 flex-none',
                        plan.featured ? 'text-white' : 'text-foreground',
                      )}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className={plan.featured ? 'text-white/80' : 'text-muted-foreground'}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.featured ? 'default' : 'outline'}
                className={cn(
                  'relative z-10 mt-auto w-fit rounded-[14px]',
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

      {/* 6 — ВОЗРАЖЕНИЯ. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <SectionTitle>Вопросы</SectionTitle>

          <Accordion type="single" collapsible className="border-t border-hairline">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-b border-hairline">
                <AccordionTrigger className="group flex w-full items-center justify-between gap-6 py-6 text-left">
                  <span className="text-h3">{item.q}</span>
                  <ChevronDown
                    className="size-4 flex-none text-meta-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
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
        </div>
      </Section>

      {/* 7 — ФИНАЛЬНЫЙ ПРИЗЫВ. */}
      <Section className="pt-0">
        <div className="hero-panel relative overflow-hidden rounded-3xl px-8 py-20 sm:px-14 md:py-28">
          <div className="hero-grain" aria-hidden />
          <div className="relative z-10">
            <h2 className="max-w-[16ch] text-balance text-display text-white">Посчитайте свой объект</h2>
            <p className="mt-5 max-w-[42ch] text-body-lg text-white/60">
              Бесплатно и без регистрации. Отчёт — в PDF и Excel.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-9 rounded-[14px] bg-background text-foreground hover:bg-background/90"
            >
              <Link to="/calculate/warehouse">
                Рассчитать объект
                <ArrowUpRight className="size-4" strokeWidth={2.25} />
              </Link>
            </Button>
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
