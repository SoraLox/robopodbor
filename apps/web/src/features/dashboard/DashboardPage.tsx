import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/api/auth';
import { useChanges, useProjects, useSolutions } from '@/api/queries';
import type { Maturity, Project, Solution } from '@/api/types';
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  Gauge,
} from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import { DonutBreakdown } from '@/shared/charts';
// Декоративная 3D-рука тянет three.js + drei (~350 КБ gzip): грузим её отдельным
// чанком, чтобы KPI и графики дашборда не ждали WebGL.
const RobotArmHero = lazy(() => import('@/features/auth/components/RobotArmHero'));
import { EventDot, KpiTile, LegendRow, Panel, STATUS, StatusPill } from './parts';

const OBJECTS: Array<{ id: string; label: string }> = [
  { id: 'warehouse', label: 'Склады' },
  { id: 'airport', label: 'Аэропорты' },
  { id: 'clinic', label: 'Медучреждения' },
];

const FIT_LABEL: Record<string, string> = {
  declared: 'заявлено в каталоге',
  example: 'пример организатора',
  inferred: 'выведено по сценариям',
};

/*
  Строгая лестница по светлоте: соседние сегменты различаются не оттенком,
  а яркостью, иначе кольцо читается как одно пятно.
*/
const DONUT_COLORS = ['hsl(20 91% 40%)', 'hsl(20 88% 55%)', 'hsl(28 60% 66%)', 'hsl(240 6% 64%)'];
const donutColor = (index: number): string => DONUT_COLORS[index] ?? 'hsl(240 8% 76%)';

const paybackOf = (project: Project) => {
  const value = Number(project.payback.replace(',', '.'));
  return Number.isFinite(value) && project.payback.trim() !== '' ? value : null;
};

const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');

const plural = (n: number, forms: [string, string, string]) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
};

/** Сводка кабинета — только из проектов пользователя и каталога, без демо-цифр. */
function summarize(projects: Project[], solutions: Solution[]) {
  const calculated = projects.filter((project) => paybackOf(project) !== null);
  const paybacks = calculated.map((project) => paybackOf(project)!);
  const average = paybacks.length ? paybacks.reduce((a, b) => a + b, 0) / paybacks.length : null;
  const inSelection = solutions.filter((solution) => solution.objectTypes?.length);
  return {
    total: projects.length,
    calculated: calculated.length,
    average,
    inSelection: inSelection.length,
    byObject: OBJECTS.map((object) => ({
      ...object,
      projects: projects.filter((project) => project.objectType === object.id).length,
      robots: inSelection.filter((solution) => solution.objectTypes?.includes(object.id)).length,
      fit: Object.entries(FIT_LABEL).map(([fit, label]) => ({
        label,
        count: inSelection.filter(
          (solution) =>
            solution.objectTypes?.includes(object.id) &&
            (solution.objectFit as Record<string, string> | undefined)?.[object.id] === fit,
        ).length,
      })),
    })),
    byStatus: (Object.keys(STATUS) as Maturity[]).map((status) => ({
      status,
      count: projects.filter((project) => project.status === status).length,
    })),
  };
}

export function DashboardPage() {
  const { data: projects = [], isLoading } = useProjects();
  const { data: solutions = [] } = useSolutions();
  const summary = summarize(projects, solutions);
  const recent = [...projects]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 8);
  const donut = summary.byObject.filter((item) => item.projects > 0);

  return (
    <DashboardLayout aside={<SideRail summary={summary} />}>
      {/* Заголовок раздела и дата */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Панель управления</h1>
        <span className="ml-auto flex items-center gap-2 meta-label">
          <CalendarDays className="size-3.5" strokeWidth={1.7} aria-hidden />
          {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
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
            Манипулятор занимает бо́льшую часть героя. На телефоне 3D скрыт:
            герой занимал полтора экрана до первой цифры.
          */}
          <div className="relative hidden h-[300px] md:block md:h-[520px] xl:h-[560px]">
            <Suspense fallback={null}>
              <RobotArmHero className="absolute inset-0 h-full w-full" />
            </Suspense>
          </div>
        </div>
      </section>

      {/* KPI */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <KpiTile
          label="Проекты"
          value={String(summary.total)}
          note="сохранённые расчёты"
          icon={ClipboardList}
        />
        <KpiTile
          label="С расчётом окупаемости"
          value={String(summary.calculated)}
          note={summary.total ? `из ${summary.total}` : 'пока нет проектов'}
          icon={CheckCircle2}
        />
        <KpiTile
          label="Средняя окупаемость"
          value={summary.average === null ? '—' : summary.average.toFixed(1).replace('.', ',')}
          {...(summary.average === null ? {} : { unit: 'лет' })}
          note="по проектам с расчётом"
          icon={Gauge}
        />
        <KpiTile
          label="Роботов в подборе"
          value={String(summary.inSelection)}
          note={`из ${solutions.length} в каталоге`}
          icon={Bot}
        />
      </div>

      {/* Проекты по объектам + каталог для подбора */}
      <div className="mb-4 grid gap-4 2xl:grid-cols-2">
        <Panel className="self-start" title="Проекты по типам объектов">
          {donut.length ? (
            <>
              <DonutBreakdown
                data={donut.map((item, index) => ({ name: item.label, value: item.projects, color: donutColor(index) }))}
                total={String(summary.total)}
                totalLabel={plural(summary.total, ['проект', 'проекта', 'проектов'])}
                height={196}
              />
              <div className="mt-2">
                {donut.map((item, index) => (
                  <LegendRow key={item.id} color={donutColor(index)} name={item.label} value={String(item.projects)} />
                ))}
              </div>
            </>
          ) : (
            <EmptyNote>
              {isLoading ? 'Загружаем проекты…' : 'Проектов пока нет — сохраните расчёт, и он появится здесь.'}
            </EmptyNote>
          )}
        </Panel>

        <Panel className="self-start" title="Каталог для подбора" action="Каталог" actionTo="/catalog">
          <ul className="grid gap-3">
            {summary.byObject.map((item) => (
              <li key={item.id} className="rounded-lg border border-hairline px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium">{item.label}</span>
                  <span className="tabular">
                    {item.robots} {plural(item.robots, ['робот', 'робота', 'роботов'])}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 meta-label">
                  {item.fit
                    .filter((fit) => fit.count > 0)
                    .map((fit) => (
                      <span key={fit.label}>
                        {fit.label}: {fit.count}
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Последние проекты */}
      <Panel
        title="Последние проекты"
        action="Все расчёты"
        actionTo="/projects"
        className="mb-4"
        bodyClassName="px-0 pb-2"
      >
        {recent.length ? (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Таблица последних проектов, прокручивается по горизонтали"
          >
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-y border-hairline bg-canvas/60">
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Проект</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Создан</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Объект</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Статус</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-right font-medium">Окупаемость</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-canvas/70">
                    <td className="px-4 py-3">
                      <Link
                        to={`/calculate/${row.objectType ?? 'warehouse'}/results/${row.id}`}
                        className="inline-flex min-h-[44px] items-center text-foreground hover:text-primary"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{dateOf(row.createdAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {OBJECTS.find((object) => object.id === row.objectType)?.label ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {paybackOf(row) === null ? '—' : `${row.payback} лет`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4">
            <EmptyNote>
              {isLoading ? 'Загружаем проекты…' : 'Здесь появятся сохранённые расчёты.'}
            </EmptyNote>
          </div>
        )}
      </Panel>
    </DashboardLayout>
  );
}

function EmptyNote({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed border-hairline px-4 py-6 text-center text-[12.5px] text-muted-foreground">
      {children}
    </p>
  );
}

function SideRail({ summary }: { summary: ReturnType<typeof summarize> }) {
  const { data: user } = useSession();
  const isAdmin = user?.role === 'admin';
  const { data: changes = [] } = useChanges(undefined, isAdmin);

  return (
    <>
      {isAdmin ? (
        <Panel title="Последние изменения" action="Журнал" actionTo="/admin">
          {changes.length ? (
            <ol className="space-y-3.5">
              {changes.slice(0, 6).map((change) => (
                <li key={change.id} className="flex gap-3 text-[12px]">
                  <span className="w-[62px] flex-none tabular text-meta-foreground">
                    {new Date(change.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <EventDot tone={change.action === 'delete' ? 'danger' : change.action === 'create' ? 'operation' : 'confirmed'} />
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug">{change.summary}</span>
                    {change.userEmail ? <span className="mt-0.5 block text-meta-foreground">{change.userEmail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyNote>Справочники ещё не правили.</EmptyNote>
          )}
        </Panel>
      ) : null}

      <Panel title="Проекты по статусам" action="Все расчёты" actionTo="/projects">
        <ul className="space-y-1">
          {summary.byStatus.map((item) => (
            <li key={item.status}>
              <Link
                to="/projects"
                className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-2 text-[12px] transition-colors hover:bg-canvas"
              >
                <span className="truncate">{STATUS[item.status].label}</span>
                <span className="ml-auto tabular font-medium">{item.count}</span>
              </Link>
            </li>
          ))}
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
