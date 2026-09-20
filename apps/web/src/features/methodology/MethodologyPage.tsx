import { AppShell } from '@/app/AppShell';
import { SectionHeading } from '@/shared/components';
import { cn } from '@/lib/utils';

const BLOCKS = [
  {
    title: 'Что считает платформа',
    text: 'Полную стоимость владения на семь лет для трёх сценариев: как есть, купить, арендовать. По каждому — оборудование, обслуживание, зарплаты и все остальные расходы по годам.',
  },
  {
    title: 'Откуда берутся цифры',
    text: 'Цены на технику и тарифы на электричество — из проверенных источников, это видно в таблице. Если точных данных нет, берём отраслевую оценку и помечаем её отдельно.',
  },
  {
    title: 'Чего платформа не делает',
    text: 'Не приезжает к вам на объект и не согласовывает поставку техники. Она нужна для одного: получить цифры, с которыми можно защитить бюджет.',
  },
];

/** Значения по умолчанию: термин, число и что оно означает простыми словами. */
const ASSUMPTIONS = [
  {
    id: 'rate',
    term: 'Скидка на будущие деньги',
    value: '16%',
    text: 'Рубль через пять лет мы считаем немного дешевле сегодняшнего — так в расчёт закладываются инфляция и риск.',
    confirmed: true,
  },
  {
    id: 'wage',
    term: 'Рост зарплат',
    value: '9% в год',
    text: 'На столько ежегодно дорожает труд сотрудников. Это часть стоимости варианта «нанять больше людей».',
    confirmed: true,
  },
  {
    id: 'horizon',
    term: 'Срок расчёта',
    value: '7 лет',
    text: 'Столько лет вперёд мы считаем расходы и экономию — обычный срок службы техники до замены.',
    confirmed: true,
  },
  {
    id: 'service',
    term: 'Обслуживание техники',
    value: '7% от цены в год',
    text: 'Средние расходы на ремонт, запчасти и визиты техника — по данным вендоров за 2026 год.',
    confirmed: false,
  },
  {
    id: 'raas',
    term: 'Аренда робота',
    value: 'оценка рынка, 2025',
    text: 'Точной цены аренды по вашему региону может не быть — берём среднюю по рынку и помечаем как оценку.',
    confirmed: false,
  },
  {
    id: 'shift',
    term: 'Смена оператора склада',
    value: 'оценка рынка, 2025',
    text: 'Стоимость одной рабочей смены сотрудника — тоже оценка, если точных данных по региону нет.',
    confirmed: false,
  },
];

export function MethodologyPage() {
  return (
    <AppShell>
      <div className="px-5 py-8 sm:px-8">
        <div className="mb-8 max-w-[640px]">
          <SectionHeading size="h1">Как мы считаем</SectionHeading>
          <p className="mt-3 text-[15px] leading-[1.6] text-muted-foreground">
            Модель одна для любого объекта — склад, аэропорт, клиника.
            Меняются только каталог решений и справочник цен.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {BLOCKS.map((block) => (
            <div key={block.title} className="rounded-2xl border border-border bg-background p-6">
              <h3 className="font-heading text-[16px] font-semibold">{block.title}</h3>
              <p className="mt-2.5 text-[14px] leading-[1.6] text-muted-foreground">
                {block.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border px-5 py-8 sm:px-8">
        <div className="mb-6 max-w-[640px]">
          <h2 className="font-heading text-[20px] font-semibold">Значения по умолчанию</h2>
          <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">
            Вот что мы подставляем в расчёт, если вы ничего не меняли. Любое
            из этих чисел можно поправить в своём проекте.
          </p>
        </div>

        <div className="grid gap-3">
          {ASSUMPTIONS.map((row) => (
            <div
              key={row.id}
              className="grid items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-background px-6 py-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]"
            >
              <div>
                <div className="text-[13px] text-muted-foreground">{row.term}</div>
                <div className="font-heading text-[20px] font-semibold tabular tracking-h1">
                  {row.value}
                </div>
              </div>

              <p className="text-[13.5px] leading-[1.55] text-muted-foreground">{row.text}</p>

              <span
                className={cn(
                  'inline-flex w-fit items-center rounded-full px-3 py-1 text-[12px] font-medium',
                  row.confirmed
                    ? 'bg-status-confirmed-tint text-status-confirmed'
                    : 'bg-status-piloting-tint text-status-piloting',
                )}
              >
                {row.confirmed ? 'Подтверждено' : 'Требует проверки'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default MethodologyPage;
