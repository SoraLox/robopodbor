import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import { SiteFooter } from '@/app/AppShell';
import { RobotArmHero } from '@/features/auth/components/RobotArmHero';
import { ScenarioBars } from '@/features/results/ScenarioBars';
import { KpiBlock } from '@/shared/components';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { demoCalculation } from '@/mocks/fixtures';
import { cn } from '@/lib/utils';
import { EFFECTS, FAQ, PLANS, PROBLEMS, SOURCES, STEPS } from './content';

const NAV = [
  { to: '/calculate/warehouse', label: 'Расчёт' },
  { to: '/catalog', label: 'Каталог' },
  { to: '/methodology', label: 'Методика' },
];

/** Общая обёртка секции: воздух сверху и волосяная линия-разделитель. */
function Section({
  children,
  className,
  divided = true,
}: {
  children: React.ReactNode;
  className?: string;
  divided?: boolean;
}) {
  return (
    <section
      className={cn(
        'px-[18px] py-20 md:py-28',
        divided && 'border-t border-border',
        className,
      )}
    >
      <div className="mx-auto max-w-[1180px]">{children}</div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-8 px-[18px] py-3">
          <Link to="/" className="font-heading text-sm font-bold tracking-[0.02em]">
            РОБОПОДБОР<span className="text-primary">.</span>
          </Link>
          <nav className="flex flex-wrap gap-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            to="/login"
            className="ml-auto text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* 1 — ГЕРОЙ. Одна мысль: за сколько окупится роботизация вашего объекта. */}
      <section className="px-[18px] pb-16 pt-6 md:pb-24 md:pt-10">
        <div className="mx-auto grid max-w-[1180px] items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="motion-safe:animate-[rise_.7s_cubic-bezier(.16,1,.3,1)_both]">
            <h1
              className="font-heading font-bold uppercase leading-[0.92] tracking-[-0.045em]"
              style={{ fontSize: 'clamp(42px, 6.4vw, 88px)' }}
            >
              Окупится ли
              <br />
              робот у вас
            </h1>

            <p className="mt-7 max-w-[54ch] text-[15px] leading-[1.6] text-muted-foreground">
              Платформа считает срок окупаемости, CAPEX и OPEX по вашему складу,
              аэропорту или клинике и сравнивает покупку с арендой — на данных
              о реальных внедрениях, а не на обещаниях поставщика.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Button asChild size="lg" className="text-[13px]">
                <Link to="/calculate/warehouse">
                  Рассчитать объект
                  <ArrowUpRight className="size-4" strokeWidth={2.5} />
                </Link>
              </Button>
              <Link
                to="/methodology"
                className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Как мы считаем
              </Link>
            </div>
          </div>

          <div className="motion-safe:animate-[fade_.9s_.15s_ease-out_both]">
            <RobotArmHero className="h-[420px] w-full" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <KpiBlock
                variant="filled"
                size="sm"
                label="Медианная окупаемость"
                value="3.2"
                unit="года"
                trend="down"
                className="rounded-xl"
              />
              <KpiBlock
                variant="outline"
                size="sm"
                label="Решений в базе"
                value="252"
                unit="поз."
                trend="up"
                className="rounded-xl border border-border"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2 — ПРОБЛЕМА. Что стоит на кону, если считать по презентации вендора. */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <h2 className="font-heading text-[clamp(28px,3.4vw,44px)] font-bold uppercase leading-[1.02] tracking-[-0.035em]">
            Восемьдесят
            <br />
            миллионов
            <br />
            вслепую
          </h2>

          <div>
            <dl className="border-t border-border">
              {PROBLEMS.map((problem) => (
                <div key={problem.title} className="border-b border-hairline py-6">
                  <dt className="font-heading text-[17px] font-semibold uppercase tracking-h2">
                    {problem.title}
                  </dt>
                  <dd className="mt-2 max-w-[62ch] text-sm leading-[1.6] text-muted-foreground">
                    {problem.text}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-7 max-w-[62ch] text-[15px] leading-[1.6]">
              Средний CAPEX проекта роботизации — 80 млн ₽ и горизонт семь лет.
              Это решение принимают один раз.
            </p>
          </div>
        </div>
      </Section>

      {/* 3 — РЕШЕНИЕ. Показываем сам продукт, а не описание продукта. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <h2 className="font-heading text-[clamp(28px,3.4vw,44px)] font-bold uppercase leading-[1.02] tracking-[-0.035em]">
              Три сценария
              <br />
              на одном экране
            </h2>
            <p className="mt-6 max-w-[46ch] text-sm leading-[1.6] text-muted-foreground">
              Оставить как есть, купить или арендовать. Платформа считает полную
              стоимость владения на семь лет по каждому варианту и показывает,
              какой окупится раньше и на сколько.
            </p>
            <Link
              to="/calculate/warehouse/results/demo"
              className="mt-7 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary underline-offset-4 hover:text-primary-hover hover:underline"
            >
              Открыть демо-расчёт
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          </div>

          {/* Реальный компонент результата с демо-данными */}
          <figure className="border-t border-border pt-7">
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <figcaption className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                Склад 20 000 м², три смены
              </figcaption>
              <span className="meta-label">TCO, 7 ЛЕТ · МЛН ₽</span>
            </div>
            <ScenarioBars scenarios={demoCalculation.scenarios} />
            <p className="mt-6 border-t border-hairline pt-4 text-xs text-muted-foreground">
              Покупка с господдержкой окупается за 3.2 года — на 0.6 года раньше
              аренды и на 79.4 млн ₽ дешевле, чем ничего не менять.
            </p>
          </figure>
        </div>
      </Section>

      {/* 4 — ПРОВОДНИК. Право говорить: независимость и происхождение данных. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <h2 className="font-heading text-[clamp(28px,3.4vw,44px)] font-bold uppercase leading-[1.02] tracking-[-0.035em]">
              Мы не продаём
              <br />
              роботов
            </h2>
            <p className="mt-6 max-w-[46ch] text-sm leading-[1.6] text-muted-foreground">
              У платформы нет процента с внедрения и нет любимого поставщика.
              Каждое значение в расчёте ссылается на источник, а надёжность
              источника видна прямо в таблице.
            </p>
          </div>

          <div>
            <ul className="border-t border-border">
              {SOURCES.map((source) => (
                <li
                  key={source.title}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-hairline py-4"
                >
                  <span className="text-sm font-medium">{source.title}</span>
                  <span className="meta-label">{source.note.toUpperCase()}</span>
                  <span
                    className={cn(
                      'ml-auto text-[11px] font-semibold uppercase tracking-[0.08em]',
                      source.confirmed
                        ? 'text-status-confirmed'
                        : 'text-status-piloting',
                    )}
                  >
                    {source.confirmed ? 'Подтверждено' : 'Требует проверки'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 5 — ПЛАН. Ровно три шага; нумерация здесь несёт смысл последовательности. */}
      <Section>
        <h2 className="font-heading text-[clamp(28px,3.4vw,44px)] font-bold uppercase leading-[1.02] tracking-[-0.035em]">
          Четыре минуты, три шага
        </h2>

        <ol className="mt-12 border-t border-border">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="grid items-baseline gap-x-8 gap-y-2 border-b border-hairline py-8 md:grid-cols-[64px_minmax(0,0.9fr)_minmax(0,1.2fr)_110px]"
            >
              <span
                className={cn(
                  'font-heading text-[28px] font-bold tabular leading-none',
                  index === 0 ? 'text-primary' : 'text-border',
                )}
              >
                {index + 1}
              </span>
              <h3 className="font-heading text-xl font-semibold uppercase tracking-h2">
                {step.title}
              </h3>
              <p className="max-w-[56ch] text-sm leading-[1.6] text-muted-foreground">
                {step.text}
              </p>
              <span className="meta-label md:text-right">
                {step.duration.toUpperCase()}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {/* 6 — ДОВЕРИЕ. Сначала голос клиента, затем медиана по базе внедрений. */}
      <Section>
        <figure className="mx-auto max-w-[900px] text-center">
          <blockquote className="font-heading text-[clamp(22px,2.9vw,38px)] font-semibold uppercase leading-[1.18] tracking-[-0.025em]">
            «Расчёт закрыл главный вопрос совета директоров: почему не нанять ещё
            тридцать человек. Цифры по семи годам оказались убедительнее
            презентации вендора»
          </blockquote>
          <figcaption className="mt-8 text-sm">
            <span className="font-semibold">А. Крылов</span>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Директор логистики, «Волга-Логистик»
            </span>
          </figcaption>
        </figure>

        <div className="mt-20 grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          {EFFECTS.map((effect, index) => (
            <div
              key={effect.label}
              className={cn(
                'py-8 pr-6',
                index > 0 && 'lg:border-l lg:border-l-hairline lg:pl-6',
              )}
            >
              <div className="font-heading text-[clamp(30px,3.6vw,44px)] font-bold leading-none tabular tracking-[-0.04em]">
                {effect.value}
              </div>
              <div className="mt-3 max-w-[22ch] text-xs leading-[1.5] text-muted-foreground">
                {effect.label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 meta-label">МЕДИАНА ПО 37 ВНЕДРЕНИЯМ · 2021–2026</p>
      </Section>

      {/* 7 — ЦЕНЫ И ГАРАНТИЯ. */}
      <Section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-heading text-[clamp(28px,3.4vw,44px)] font-bold uppercase leading-[1.02] tracking-[-0.035em]">
            Расчёт бесплатный
          </h2>
          <p className="max-w-[44ch] text-sm leading-[1.6] text-muted-foreground">
            Платим мы только за то, что делает человек: проверку допущений
            и сопровождение защиты бюджета.
          </p>
        </div>

        <div className="mt-12 grid border-t border-border lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col gap-6 py-9 pr-8',
                index > 0 && 'lg:border-l lg:border-l-hairline lg:pl-8',
                plan.featured && 'lg:pl-8',
              )}
            >
              <div>
                <h3
                  className={cn(
                    'font-heading text-base font-semibold uppercase tracking-h2',
                    plan.featured && 'text-primary',
                  )}
                >
                  {plan.name}
                </h3>
                <div className="mt-4 font-heading text-[34px] font-bold leading-none tabular tracking-[-0.04em]">
                  {plan.price}
                </div>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {plan.note}
                </div>
              </div>

              <ul className="grid gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-[13px] leading-[1.5]">
                    <Check
                      className={cn(
                        'mt-0.5 size-3.5 flex-none',
                        plan.featured ? 'text-primary' : 'text-muted-foreground',
                      )}
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    <span className={plan.featured ? '' : 'text-muted-foreground'}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.featured ? 'default' : 'outline'}
                size="sm"
                className="mt-auto w-fit"
              >
                <Link to={plan.id === 'calc' ? '/calculate/warehouse' : '/login'}>
                  {plan.id === 'calc' ? 'Начать расчёт' : 'Обсудить'}
                </Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-10 max-w-[70ch] border-t border-border pt-6 text-sm leading-[1.6]">
          Если наш расчёт разойдётся с коммерческим предложением поставщика больше
          чем на 15% — разберём расхождение построчно и бесплатно.
        </p>
      </Section>

      {/* 8 — ВОЗРАЖЕНИЯ. */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <h2 className="font-heading text-[clamp(28px,3.4vw,44px)] font-bold uppercase leading-[1.02] tracking-[-0.035em]">
            Вопросы
          </h2>

          <Accordion type="single" collapsible className="border-t border-border">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-b border-hairline">
                <AccordionTrigger className="group flex w-full items-center justify-between gap-6 py-6 text-left">
                  <span className="font-heading text-[17px] font-semibold uppercase tracking-h2">
                    {item.q}
                  </span>
                  <ChevronDown
                    className="size-4 flex-none text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                    strokeWidth={2}
                    aria-hidden
                  />
                </AccordionTrigger>
                <AccordionContent className="max-w-[68ch] pb-6 text-sm leading-[1.65] text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* 9 — ФИНАЛЬНЫЙ ПРИЗЫВ. */}
      <section className="mt-6 bg-foreground px-[18px] py-24 text-background md:py-32">
        <div className="mx-auto max-w-[1180px]">
          <h2 className="max-w-[16ch] font-heading text-[clamp(32px,5vw,68px)] font-bold uppercase leading-[0.98] tracking-[-0.04em]">
            Посчитайте свой объект
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
            <Button asChild size="lg" className="text-[13px]">
              <Link to="/calculate/warehouse">
                Рассчитать объект
                <ArrowUpRight className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
            <p className="text-xs text-background/60">
              Четыре минуты · без регистрации · черновик хранится 30 дней
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] px-[18px]">
        <SiteFooter />
      </div>
    </div>
  );
}

export default LandingPage;
