import { AppShell } from '@/app/AppShell';
import { SectionHeading, StatusBadge } from '@/shared/components';
import { ComparisonTable, type ComparisonColumn } from '@/shared/components';

const BLOCKS = [
  {
    title: 'Что считает платформа',
    text: 'TCO на горизонте 7 лет для трёх сценариев: «как есть», покупка и RaaS. Внутри каждого — CAPEX, OPEX по годам, остаточный ФОТ и сервисный контракт. Ставка дисконтирования и инфляция ФОТ задаются в допущениях расчёта.',
  },
  {
    title: 'Откуда берутся цифры',
    text: 'Прайс-листы вендоров и тарифы региона отмечаются как подтверждённые. Значения из отраслевого бенчмарка и экспертные оценки помечаются отдельно — их видно в структуре затрат и в выгрузке.',
  },
  {
    title: 'Чего платформа не делает',
    text: 'Не заменяет проектное обследование объекта и не согласовывает поставку. Расчёт нужен, чтобы принять решение о бюджете и защитить его на инвесткомитете.',
  },
];

const COLUMNS: ComparisonColumn[] = [
  { key: 'param', header: 'Параметр', width: 'minmax(0, 1.4fr)' },
  { key: 'value', header: 'Значение', width: '150px', align: 'right' },
  { key: 'source', header: 'Статус', width: '150px', align: 'right' },
];

const ASSUMPTIONS = [
  { id: 'rate', param: 'Ставка дисконтирования', value: '16%', confirmed: true },
  { id: 'wage', param: 'Инфляция ФОТ', value: '9% в год', confirmed: true },
  { id: 'horizon', param: 'Горизонт расчёта', value: '7 лет', confirmed: true },
  { id: 'service', param: 'Сервисный контракт', value: '7% от CAPEX в год', confirmed: false },
  { id: 'raas', param: 'Тариф RaaS', value: 'бенчмарк 2025', confirmed: false },
  { id: 'shift', param: 'Стоимость смены оператора', value: 'бенчмарк 2025', confirmed: false },
];

export function MethodologyPage() {
  return (
    <AppShell>
      <div className="px-5 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading size="h1">Методика расчёта</SectionHeading>
          <p className="max-w-[420px] text-xs leading-[1.5] text-muted-foreground">
            Модель одинакова для всех типов объектов, различаются только справочники
            решений и нормативная база.
          </p>
        </div>

        <div className="grid gap-[18px] border-t border-border pt-5 md:grid-cols-3">
          {BLOCKS.map((block, index) => (
            <article key={block.title}>
              <div className="flex items-center gap-2.5">
                <div
                  className={index === 0 ? 'h-3 w-[3px] bg-primary' : 'h-3 w-[3px] bg-border'}
                  aria-hidden
                />
                <h3 className="font-heading text-base font-semibold uppercase tracking-h2">
                  {block.title}
                </h3>
              </div>
              <p className="ml-[14px] mt-2.5 text-xs leading-[1.55] text-muted-foreground">
                {block.text}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="border-t border-border">
        <SectionHeading className="px-5 pb-3 pt-4" meta="ПРИМЕНЯЮТСЯ КО ВСЕМ СЦЕНАРИЯМ">
          Допущения по умолчанию
        </SectionHeading>

        <ComparisonTable
          columns={COLUMNS}
          rows={ASSUMPTIONS.map((row) => ({
            id: row.id,
            cells: {
              param: <span className="text-[13px]">{row.param}</span>,
              value: <span className="text-[13px] font-semibold tabular">{row.value}</span>,
              source: (
                <StatusBadge variant={row.confirmed ? 'confirmed' : 'needs-review'} />
              ),
            },
          }))}
        />
      </div>
    </AppShell>
  );
}

export default MethodologyPage;
