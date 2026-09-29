import { Link } from 'react-router-dom';
import { useSession } from '@/api/auth';
import { useFavorites } from '@/api/account';
import { useChanges, useProjects, useSolutions } from '@/api/queries';
import type { Project, Solution } from '@/api/types';
import {
  CalendarClock,
  DatabaseZap,
  FilePlus2,
  FileText,
  GitCompareArrows,
  Heart,
  Layers,
  Timer,
  UserRound,
} from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import { robotPhoto } from '@/features/objects/previewImages';
import { categorize } from '@/features/catalog/solutionCategory';
import { EventDot, KpiTile, Panel, StatusPill } from './parts';

const OBJECT_LABEL: Record<string, string> = {
  warehouse: 'Склад',
  airport: 'Аэропорт',
  clinic: 'Медучреждение',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор каталога',
  user: 'Пользователь',
};

const paybackOf = (project: Project) => {
  const value = Number(project.payback.replace(',', '.'));
  return Number.isFinite(value) && project.payback.trim() !== '' ? value : null;
};

const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');

/** Показатели кабинета — только из расчётов и избранного самого пользователя. */
function summarize(projects: Project[]) {
  const calculated = projects.filter((project) => paybackOf(project) !== null);
  const fastest = calculated.reduce<Project | null>(
    (best, project) => (best === null || paybackOf(project)! < paybackOf(best)! ? project : best),
    null,
  );
  const latest = [...projects].sort((a, b) =>
    (b.calculatedAt ?? b.createdAt ?? '').localeCompare(a.calculatedAt ?? a.createdAt ?? ''),
  )[0];
  return { total: projects.length, calculated: calculated.length, fastest, latest };
}

export function DashboardPage() {
  const { data: user } = useSession();
  const { data: projects = [], isLoading } = useProjects();
  const { data: favoriteIds = [] } = useFavorites();
  const { data: solutions = [] } = useSolutions();
  const summary = summarize(projects);
  const recent = [...projects].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 6);
  const favorites = favoriteIds.flatMap((id) => solutions.find((solution) => solution.id === id) ?? []);

  return (
    <DashboardLayout aside={<SideRail />}>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
          {user ? `Здравствуйте, ${user.name}` : 'Личный кабинет'}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Ваши сохранённые расчёты окупаемости и избранные роботы из каталога.
        </p>
      </div>

      {/* Показатели: что сохранено и какой лучший результат */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <KpiTile
          label="Сохранённые расчёты"
          value={String(summary.total)}
          note={
            summary.total
              ? `с результатом: ${summary.calculated}, черновиков: ${summary.total - summary.calculated}`
              : 'сохраните расчёт с экрана результатов'
          }
          icon={FileText}
        />
        <KpiTile
          label="Избранные роботы"
          value={String(favorites.length)}
          note={favorites.length ? 'сохранены из каталога' : 'нажмите ♥ на карточке в каталоге'}
          icon={Heart}
        />
        <KpiTile
          label="Самая быстрая окупаемость"
          value={summary.fastest ? summary.fastest.payback : '—'}
          {...(summary.fastest ? { unit: 'лет' } : {})}
          note={summary.fastest ? summary.fastest.title : 'появится после первого расчёта'}
          icon={Timer}
        />
        <KpiTile
          label="Последний расчёт"
          value={summary.latest ? dateOf(summary.latest.calculatedAt ?? summary.latest.createdAt) : '—'}
          note={summary.latest ? summary.latest.title : 'расчётов пока нет'}
          icon={CalendarClock}
        />
      </div>

      {/* Последние расчёты */}
      <Panel title="Последние расчёты" action="Все расчёты" actionTo="/projects" className="mb-4" bodyClassName="px-0 pb-2">
        {recent.length ? (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Таблица последних расчётов, прокручивается по горизонтали">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-y border-hairline bg-canvas/60">
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Расчёт</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Объект</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-left font-medium">Создан</th>
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
                    <td className="px-4 py-3 text-muted-foreground">{OBJECT_LABEL[row.objectType ?? ''] ?? '—'}</td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{dateOf(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular">{paybackOf(row) === null ? '—' : `${row.payback} лет`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4">
            <EmptyNote>{isLoading ? 'Загружаем расчёты…' : 'Здесь появятся сохранённые расчёты.'}</EmptyNote>
          </div>
        )}
      </Panel>

      {/* Избранные роботы */}
      <Panel title="Избранные роботы" action="Все избранные" actionTo="/favorites" className="mb-4">
        {favorites.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {favorites.slice(0, 6).map((solution) => (
              <FavoriteTile key={solution.id} solution={solution} />
            ))}
          </ul>
        ) : (
          <EmptyNote>Сохраняйте роботов из каталога сердечком — здесь их можно будет сравнить.</EmptyNote>
        )}
      </Panel>
    </DashboardLayout>
  );
}

function FavoriteTile({ solution }: { solution: Solution }) {
  const photo = robotPhoto(solution);
  const Icon = categorize(solution).icon;
  return (
    <li>
      <Link
        to={`/catalog?robot=${encodeURIComponent(solution.id)}`}
        className="flex items-center gap-3 rounded-[14px] border border-hairline p-2 transition-colors hover:border-[#C7C7CC]"
      >
        <span className="grid size-12 flex-none place-items-center overflow-hidden rounded-[10px] bg-[#FAFAFA]">
          {photo ? (
            <img src={photo} alt="" loading="lazy" className="size-full object-contain p-1" />
          ) : (
            <Icon className="size-5 text-[#8E8E93]" strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{solution.name}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {solution.vendor}
            {solution.price && solution.price !== '—' ? ` · ${solution.price} млн ₽` : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

function EmptyNote({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed border-hairline px-4 py-6 text-center text-[12.5px] text-muted-foreground">
      {children}
    </p>
  );
}

const actionClass =
  'flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[12px] transition-colors hover:border-primary/40 hover:bg-canvas';

function SideRail() {
  const { data: user } = useSession();
  const isAdmin = user?.role === 'admin';
  const { data: changes = [] } = useChanges(undefined, isAdmin);

  return (
    <>
      {user ? (
        <Panel title="Учётная запись" action="Изменить" actionTo="/settings">
          <dl className="grid gap-2 text-[12.5px]">
            <div>
              <dt className="text-[11px] text-muted-foreground">ФИО</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Почта</dt>
              <dd className="break-all font-medium">{user.email}</dd>
            </div>
            {user.organization ? (
              <div>
                <dt className="text-[11px] text-muted-foreground">Организация</dt>
                <dd className="font-medium">{user.organization}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] text-muted-foreground">Роль</dt>
              <dd className="font-medium">{ROLE_LABEL[user.role] ?? user.role}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      <Panel title="Быстрые действия">
        <div className="space-y-2">
          <Link
            to="/calculate/warehouse"
            className="flex items-center gap-2.5 rounded-lg bg-primary px-3 py-2.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <FilePlus2 className="size-4" strokeWidth={1.8} aria-hidden />
            Новый расчёт
          </Link>
          <Link to="/projects" className={actionClass}>
            <GitCompareArrows className="size-4 text-meta-foreground" strokeWidth={1.7} aria-hidden />
            Сравнить расчёты
          </Link>
          <Link to="/catalog" className={actionClass}>
            <Layers className="size-4 text-meta-foreground" strokeWidth={1.7} aria-hidden />
            Подобрать робота в каталоге
          </Link>
          <Link to="/settings" className={actionClass}>
            <UserRound className="size-4 text-meta-foreground" strokeWidth={1.7} aria-hidden />
            Сменить пароль
          </Link>
          {isAdmin ? (
            <Link to="/admin/catalog" className={actionClass}>
              <DatabaseZap className="size-4 text-meta-foreground" strokeWidth={1.7} aria-hidden />
              Редактировать каталог решений
            </Link>
          ) : null}
        </div>
      </Panel>

      {isAdmin ? (
        <Panel title="Последние правки каталога" action="Журнал" actionTo="/admin">
          {changes.length ? (
            <ol className="space-y-3.5">
              {changes.slice(0, 5).map((change) => (
                <li key={change.id} className="flex gap-3 text-[12px]">
                  <span className="w-[42px] flex-none tabular text-meta-foreground">
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
            <EmptyNote>Каталог и справочники ещё не правили.</EmptyNote>
          )}
        </Panel>
      ) : null}
    </>
  );
}

export default DashboardPage;
