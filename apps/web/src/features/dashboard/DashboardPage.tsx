import { Link } from 'react-router-dom';
import { useSession } from '@/api/auth';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Gauge,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  RotateCcw,
  Timer,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import { DonutBreakdown, StackedBars, TrendLines } from '@/shared/charts';
import { RobotArmHero } from '@/features/auth/components/RobotArmHero';
import { cn } from '@/lib/utils';
import {
  categories,
  categoryTrend,
  events,
  kpis,
  recentCalculations,
  regions,
  requestFlow,
  tasks,
  topOrganizations,
} from './data';
import { EventDot, KpiTile, LegendRow, Panel, StatusPill } from './parts';

const KPI_ICONS = [ClipboardList, CheckCircle2, Gauge, Wallet];

/** Своя иконка на каждое состояние задачи. */
const TASK_ICONS = [ClipboardList, CheckCircle2, RotateCcw, TriangleAlert];


/** Затухание от акцента к светло-серому по мере убывания доли. */
/*
  Строгая лестница по светлоте: соседние сегменты различаются не оттенком,
  а яркостью, иначе кольцо читается как одно пятно. Последние доли были
  светлее предыдущих — ранжирование цвета ломалось на «Прочем».
*/
const DONUT_COLORS = [
  'hsl(20 91% 40%)',
  'hsl(20 88% 55%)',
  'hsl(28 60% 66%)',
  'hsl(240 6% 52%)',
  'hsl(240 6% 64%)',
  'hsl(240 8% 76%)',
];

const donutColor = (index: number): string =>
  DONUT_COLORS[index] ?? 'hsl(240 8% 76%)';

/* Только потоки за день: «в работе» — остаток, его сюда складывать нельзя. */
const FLOW_SERIES = [
  { key: 'done', name: 'Завершено за день' },
  { key: 'rejected', name: 'Отклонено за день' },
];

const TREND_SERIES = [
  { key: 'warehouse', name: 'Склады' },
  { key: 'airport', name: 'Аэропорты' },
];

export function DashboardPage() {
  const { data: user } = useSession();
  const isAdmin = user?.role === 'admin';

  return (
    <DashboardLayout aside={<SideRail />}>
      {/* Заголовок раздела и период */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Панель управления</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 meta-label">
            <CalendarDays className="size-3.5" strokeWidth={1.7} aria-hidden />
            15 сентября 2026
          </span>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12px] hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Последние 15 дней
            <ChevronDown className="size-3.5 text-meta-foreground" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {/* Герой с манипулятором */}
      <section className="panel mb-4 overflow-hidden">
        <div className="grid items-stretch gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,64%)]">
          <div className="px-5 py-6 md:py-7 md:pl-7">
            <h2 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[26px]">
              Окупаемость роботов —
              <br />
              без презентации вендора
            </h2>
            <p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
              Считаем расходы, сравниваем покупку с арендой и готовим
              документы для инвесткомитета — на одном экране.
            </p>
            <Link
              to="/calculate/warehouse"
              className="mt-6 inline-flex items-center gap-2.5 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              Начать расчёт
              <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          </div>

          {/*
            Манипулятор занимает бо́льшую часть героя. Подложки нет: серый
            прямоугольник встык к белой карточке читался как недочищенный фон.
          */}
          {/*
            На телефоне 3D скрыт: герой занимал полтора экрана до первой
            цифры, а three.js грузился ради декора на мобильном трафике.
          */}
          <div className="relative hidden h-[300px] md:block md:h-[520px] xl:h-[560px]">
            <RobotArmHero className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      </section>

      {/* KPI */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {kpis.map((kpi, index) => (
          <KpiTile
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            {...(kpi.unit ? { unit: kpi.unit } : {})}
            delta={kpi.delta}
            tone={kpi.tone}
            trend={kpi.trend}
            icon={KPI_ICONS[index] ?? ClipboardList}
          />
        ))}
      </div>

      {/* Динамика + распределение */}
      <div className="mb-4 grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Panel
          className="self-start"
          title="Динамика расчётов"
          meta={
            <div className="flex flex-wrap items-center gap-4">
              {FLOW_SERIES.map((series, index) => (
                <span key={series.key} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: `hsl(var(--chart-${index + 1}))` }}
                    aria-hidden
                  />
                  {series.name}
                </span>
              ))}
            </div>
          }
        >
          <StackedBars data={requestFlow} series={FLOW_SERIES} height={268} />
        </Panel>

        <Panel className="self-start" title="Распределение по отраслям">
          <DonutBreakdown
            data={categories.map((item, index) => ({
              ...item,
              color: donutColor(index),
            }))}
            total="6"
            totalLabel="отраслей"
            height={196}
          />
          <div className="mt-2">
            {categories.map((item, index) => (
              <LegendRow
                key={item.name}
                color={donutColor(index)}
                name={item.name}
                value={`${item.value} %`}
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* Последние расчёты */}
      <Panel
        title="Последние расчёты"
        action="Все расчёты"
        actionTo="/projects"
        className="mb-4"
        bodyClassName="px-0 pb-2"
      >
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Таблица последних расчётов, прокручивается по горизонтали"
        >
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-hairline bg-canvas/60">
                <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">№ расчёта</th>
                <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Дата</th>
                <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Организация</th>
                <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Отрасль</th>
                <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Статус</th>
                <th scope="col" className="table-head px-4 py-2.5 text-right font-medium">CAPEX</th>
              </tr>
            </thead>
            <tbody>
              {recentCalculations.map((row) => (
                <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-canvas/70">
                  <td className="px-4 py-3">
                    <Link
                      to={`/calculate/warehouse/results/${row.id}`}
                      className="inline-flex min-h-[44px] items-center tabular text-foreground hover:text-primary"
                    >
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular text-muted-foreground">{row.date}</td>
                  <td className="px-4 py-3">{row.org}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">{row.capex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Нижний ряд */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel title="Топ организаций" action="Организации" actionTo="/projects" bodyClassName="px-0 pb-2">
          <RankTable
            label="Топ организаций"
            head={['Наименование', 'Расчётов', 'CAPEX, млн ₽']}
            rows={topOrganizations.map((o) => [o.name, String(o.count), o.sum])}
          />
        </Panel>

        <Panel
          className="self-start"
          title="Динамика по отраслям"
          meta={
            <div className="flex items-center gap-4">
              {TREND_SERIES.map((series, index) => (
                <span key={series.key} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: `hsl(var(--chart-${index + 1}))` }}
                    aria-hidden
                  />
                  {series.name}
                </span>
              ))}
            </div>
          }
        >
          <TrendLines data={categoryTrend} series={TREND_SERIES} height={208} />
        </Panel>

        <Panel
          title="Статистика по регионам"
          {...(isAdmin ? { action: 'Справочники', actionTo: '/admin' } : {})}
          bodyClassName="px-0 pb-2"
        >
          <RankTable
            label="Статистика по регионам"
            head={['Регион', 'Расчётов', 'CAPEX, млрд ₽']}
            rows={regions.map((r) => [r.name, String(r.count), r.sum])}
          />
        </Panel>
      </div>
    </DashboardLayout>
  );
}

function RankTable({
  head,
  rows,
  label,
}: {
  head: string[];
  rows: string[][];
  label: string;
}) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-hairline bg-canvas/60">
            {head.map((title, index) => (
              <th
                key={title}
                scope="col"
                className={cn(
                  'table-head px-4 py-2.5 font-medium',
                  index === 0 ? 'text-left' : 'text-right',
                )}
              >
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells) => (
            <tr key={cells.join('|')} className="border-b border-hairline last:border-0">
              {cells.map((cell, index) => (
                <td
                  key={cell + String(index)}
                  className={cn(
                    'px-4 py-2.5',
                    index === 0 ? 'text-left' : 'text-right tabular',
                    index === 0 ? '' : 'text-muted-foreground',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SideRail() {
  const { data: user } = useSession();
  const isAdmin = user?.role === 'admin';

  return (
    <>
      <Panel title="Последние события" {...(isAdmin ? { action: 'Журнал', actionTo: '/admin' } : {})}>
        <ol className="space-y-3.5">
          {events.map((event) => (
            <li key={event.time} className="flex gap-3 text-[12px]">
              <span className="w-[38px] flex-none tabular text-meta-foreground">{event.time}</span>
              <EventDot tone={event.tone} />
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{event.title}</span>
                <span className="mt-0.5 block text-meta-foreground">{event.note}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Мои задачи" action="Все задачи" actionTo="/projects">
        <ul className="space-y-1">
          {tasks.map((task, index) => {
            const Icon = TASK_ICONS[index] ?? Timer;
            return (
            <li key={task.label}>
              <Link
                to="/projects"
                className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-2 text-[12px] transition-colors hover:bg-canvas"
              >
                <Icon className="size-4 flex-none text-meta-foreground" strokeWidth={1.7} aria-hidden />
                <span className="truncate">{task.label}</span>
                <span className="ml-auto tabular font-medium">{task.count}</span>
              </Link>
            </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Быстрые действия">
        <div className="space-y-2">
          <Link
            to="/calculate/warehouse"
            className="flex items-center gap-2.5 rounded-lg bg-primary px-3 py-2.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <FilePlus2 className="size-4" strokeWidth={1.8} aria-hidden />
            Создать расчёт
          </Link>
          {[
            { to: '/catalog', label: 'Подобрать решение', icon: Building2 },
            { to: '/methodology', label: 'Посмотреть методику', icon: FileSpreadsheet },
            ...(isAdmin ? [{ to: '/admin', label: 'Открыть справочники', icon: FolderOpen }] : []),
          ].map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[12px] transition-colors hover:border-primary/40 hover:bg-canvas"
            >
              <action.icon className="size-4 text-meta-foreground" strokeWidth={1.7} aria-hidden />
              {action.label}
            </Link>
          ))}
        </div>
      </Panel>
    </>
  );
}

export default DashboardPage;
