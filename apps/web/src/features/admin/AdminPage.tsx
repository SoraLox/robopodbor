import { AppShell } from '@/app/AppShell';
import {
  ComparisonTable,
  SectionHeading,
  StatusBadge,
  type ComparisonColumn,
} from '@/shared/components';

const COLUMNS: ComparisonColumn[] = [
  { key: 'title', header: 'Справочник', width: 'minmax(0, 1.5fr)' },
  { key: 'scope', header: 'Что покрывает', width: 'minmax(0, 1.4fr)' },
  { key: 'updated', header: 'Обновлён', width: '120px', align: 'right' },
  { key: 'status', header: 'Статус', width: '140px', align: 'right' },
];

const SOURCES = [
  {
    id: 'price',
    title: 'Прайс-листы вендоров',
    scope: 'Цены на технику и системы управления парком',
    updated: '17.09.2026',
    confirmed: true,
  },
  {
    id: 'tariff',
    title: 'Тарифы электроэнергии',
    scope: 'Стоимость кВт·ч по регионам присутствия',
    updated: '01.09.2026',
    confirmed: true,
  },
  {
    id: 'registry',
    title: 'Реестр Минпромторга',
    scope: 'Признак российского происхождения решения',
    updated: '28.08.2026',
    confirmed: true,
  },
  {
    id: 'bench',
    title: 'Отраслевой бенчмарк',
    scope: 'Стоимость смены, тариф RaaS, сервисный контракт',
    updated: '2025 год',
    confirmed: false,
  },
  {
    id: 'cases',
    title: 'База внедрений',
    scope: '37 проектов 2021–2026, фактическая окупаемость',
    updated: '12.09.2026',
    confirmed: true,
  },
];

export function AdminPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-stretch border-b border-border">
        <div className="flex flex-col justify-center px-5 py-3.5">
          <h1 className="font-heading text-[22px] font-bold uppercase leading-none tracking-h1">
            Справочники
          </h1>
          <div className="mt-1.5 meta-label">
            ИСТОЧНИКИ ДАННЫХ РАСЧЁТА · 5 СПРАВОЧНИКОВ
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <p className="max-w-[560px] text-xs leading-[1.55] text-muted-foreground">
          Каждое значение в расчёте ссылается на справочник. Подтверждённые источники
          можно защищать на комитете как есть; помеченные «требует проверки» стоит
          уточнить у поставщика.
        </p>
      </div>

      <SectionHeading className="px-5 pb-3" meta="ОБНОВЛЯЮТСЯ ЦЕНТРАЛИЗОВАННО">
        Источники
      </SectionHeading>

      <ComparisonTable
        columns={COLUMNS}
        rows={SOURCES.map((source) => ({
          id: source.id,
          cells: {
            title: <span className="text-[13px] font-semibold">{source.title}</span>,
            scope: (
              <span className="text-[11.5px] text-muted-foreground">{source.scope}</span>
            ),
            updated: <span className="meta-label">{source.updated}</span>,
            status: (
              <StatusBadge variant={source.confirmed ? 'confirmed' : 'needs-review'} />
            ),
          },
        }))}
      />
    </AppShell>
  );
}

export default AdminPage;
