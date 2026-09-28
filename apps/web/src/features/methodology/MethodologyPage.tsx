import { AppShell } from '@/app/AppShell';
import { SectionHeading } from '@/shared/components';
import { cn } from '@/lib/utils';

const BLOCKS = [
  {
    title: 'Что считает платформа',
    text: 'Полную стоимость владения на горизонт из паспорта объекта для трёх сценариев: как есть, купить, арендовать. Сколько роботов нужно, сколько постов они закрывают, сколько стоят оборудование, внедрение, обслуживание и электроэнергия.',
  },
  {
    title: 'Откуда берутся цифры',
    text: 'Цены и характеристики роботов — из каталога роботов и каталога организатора, паспорт объекта — из ваших данных или датасета организатора. Если данных нет, берём явное допущение, и отчёт перечисляет каждое.',
  },
  {
    title: 'Чего платформа не делает',
    text: 'Не приезжает к вам на объект и не согласовывает поставку техники. Не дисконтирует денежные потоки и не учитывает налоги — это экспресс-оценка для защиты бюджета, а не финансовая модель проекта.',
  },
];

/** Значения по умолчанию модели economics.ts: термин, число и что оно означает простыми словами. */
const ASSUMPTIONS = [
  {
    id: 'wage',
    term: 'Рост зарплат',
    value: '9% в год',
    text: 'На столько ежегодно дорожает труд сотрудников. Это часть стоимости варианта «ничего не менять».',
    confirmed: true,
  },
  {
    id: 'horizon',
    term: 'Срок расчёта',
    value: 'из паспорта',
    text: 'Горизонт окупаемости задаётся в паспорте объекта: в датасете организатора 5 лет для склада и 7 — для аэропорта и клиники.',
    confirmed: true,
  },
  {
    id: 'posts',
    term: 'Сколько людей замещает робот',
    value: '1 пост в смену',
    text: 'Робот закрывает один пост в каждой смене; на складе штат на пост учитывает потери рабочего времени. Остальной персонал остаётся.',
    confirmed: false,
  },
  {
    id: 'service',
    term: 'Внедрение и обслуживание',
    value: '15% и 7% цены',
    text: 'Внедрение, интеграция и зарядка — 15% цены оборудования разово, обслуживание — 7% в год, если в карточке робота нет своих цифр.',
    confirmed: false,
  },
  {
    id: 'raas',
    term: 'Аренда робота',
    value: '2,5% цены в месяц',
    text: 'Оценка рынка: платёж включает сервис, внедрение оплачивается отдельно.',
    confirmed: false,
  },
  {
    id: 'energy',
    term: 'Электроэнергия',
    value: '7 ₽ за кВт·ч',
    text: 'Один тариф для всех регионов. Если у робота в карточке нет мощности, электроэнергия не учитывается — отчёт об этом предупреждает.',
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
            Меняются только замещаемые роли персонала и потоки, по которым считается число роботов.
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
