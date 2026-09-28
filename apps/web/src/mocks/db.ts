/**
 * Состояние мок-бэкенда: пользователи, сессии, проекты и расчёты. В браузере
 * хранится в localStorage (./persist) и переживает перезагрузку. Сессия
 * отдаётся httpOnly-cookie, поэтому фронт про токен ничего не знает и обязан
 * ходить с `credentials: 'include'`.
 */
import { DEFAULT_MODEL_VERSION } from '@domain/versions';
import type { CalculationResult, CalculationSnapshot, ProjectDetail, User } from '@/api/types';
import { loadMap, saveMap } from './persist';

interface Account {
  user: User;
  password: string;
}

const accounts = loadMap<Account>('accounts', [
  [
    'admin@robotopodbor.ru',
    {
      password: 'admin123',
      user: {
        id: 'u-admin',
        email: 'admin@robotopodbor.ru',
        name: 'Смирнова О. П.',
        organization: 'Роботоподбор',
        role: 'admin',
      },
    },
  ],
  [
    'krylov@volga-logistic.ru',
    {
      password: 'volga123',
      user: {
        id: 'u-1',
        email: 'krylov@volga-logistic.ru',
        name: 'Крылов А. В.',
        organization: 'ООО «Волга-Логистик»',
        role: 'user',
      },
    },
  ],
] as const);

/** sid → email. */
const sessions = loadMap<string>('sessions');

function persistSessions() {
  saveMap('sessions', sessions);
}

export function createAccount(email: string, password: string, organization?: string) {
  if (accounts.has(email)) return null;
  const user: User = {
    id: `u-${accounts.size + 1}`,
    email,
    name: email.split('@')[0] ?? email,
    role: 'user',
    ...(organization ? { organization } : {}),
  };
  accounts.set(email, { user, password });
  saveMap('accounts', accounts);
  return user;
}

export function verify(email: string, password: string) {
  const account = accounts.get(email);
  if (!account || account.password !== password) return null;
  return account.user;
}

export function openSession(email: string) {
  const sid = `sid-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  sessions.set(sid, email);
  persistSessions();
  return sid;
}

export function closeSession(sid: string | undefined) {
  if (sid) sessions.delete(sid);
  persistSessions();
}

export function userBySid(sid: string | undefined): User | null {
  if (!sid) return null;
  const email = sessions.get(sid);
  if (!email) return null;
  return accounts.get(email)?.user ?? null;
}

/** Проекты пользователя вместе с входными параметрами и сценариями. */
const projects = loadMap<ProjectDetail>('projects');

interface StoredSnapshot extends CalculationSnapshot {
  result: CalculationResult;
}

/** История расчётов по проектам и быстрый поиск снимка по id для GET /calculations/:id. */
const snapshots = loadMap<StoredSnapshot[]>('snapshots');
const snapshotById = new Map<string, StoredSnapshot>(
  [...snapshots.values()].flat().map((snapshot) => [snapshot.id, snapshot]),
);

function persistProjects() {
  saveMap('projects', projects);
  saveMap('snapshots', snapshots);
}

export function summaryOf({ result, ...summary }: StoredSnapshot): CalculationSnapshot {
  void result;
  return summary;
}

/** В моках каталог не версионируется журналом — версия данных фиксированная. */
const MOCK_DATA_VERSION = 'data-demo';

/** После удаления size уменьшается — id берём больше максимального, а не по размеру. */
function nextProjectId() {
  const numbers = [...projects.keys()].map(Number).filter(Number.isFinite);
  return String(Math.max(78459, ...numbers) + 1);
}

export const projectStore = {
  list: () => [...projects.values()],
  get: (id: string) => projects.get(id) ?? null,
  remove(id: string) {
    const removed = projects.delete(id);
    snapshots.delete(id);
    persistProjects();
    return removed;
  },
  update(id: string, patch: Partial<Pick<ProjectDetail, 'title' | 'status' | 'parameters' | 'processes' | 'solutionId'>>) {
    const project = projects.get(id);
    if (!project) return null;
    const next = { ...project, ...patch };
    projects.set(id, next);
    persistProjects();
    return next;
  },
  history: (id: string) => snapshots.get(id) ?? [],
  snapshot: (snapshotId: string) => snapshotById.get(snapshotId) ?? null,
  saveSnapshot(id: string, input: { calculation: CalculationResult; solutionId?: string; modelVersion?: string }) {
    const project = projects.get(id);
    if (!project) return null;
    const snapshot: StoredSnapshot = {
      id: `${id}-c${(snapshots.get(id)?.length ?? 0) + 1}`,
      createdAt: new Date().toISOString(),
      dataVersion: MOCK_DATA_VERSION,
      modelVersion: input.modelVersion ?? DEFAULT_MODEL_VERSION,
      payback: input.calculation.payback.value,
      result: input.calculation,
      ...(input.solutionId ?? project.solutionId ? { solutionId: input.solutionId ?? project.solutionId } : {}),
    };
    snapshots.set(id, [snapshot, ...(snapshots.get(id) ?? [])]);
    snapshotById.set(snapshot.id, snapshot);
    projects.set(id, {
      ...project,
      payback: snapshot.payback ?? project.payback,
      scenarios: input.calculation.scenarios,
      calculationId: id,
      dataVersion: snapshot.dataVersion,
      modelVersion: snapshot.modelVersion,
      calculatedAt: snapshot.createdAt,
      ...(snapshot.solutionId ? { solutionId: snapshot.solutionId } : {}),
    });
    persistProjects();
    return summaryOf(snapshot);
  },
  create(input: {
    title: string;
    objectType: string;
    parameters: Record<string, string>;
    processes?: string[];
    solutionId?: string;
    calculation?: CalculationResult;
    modelVersion?: string;
  }) {
    const id = nextProjectId();
    const detail: ProjectDetail = {
      id,
      title: input.title,
      meta: `РАСЧЁТ №${id} · ${new Date().toLocaleDateString('ru-RU')}`,
      payback: '—',
      status: 'piloting',
      createdAt: new Date().toISOString(),
      objectType: input.objectType,
      parameters: input.parameters,
      processes: input.processes ?? [],
      scenarios: input.calculation?.scenarios ?? [],
      calculationId: id,
      ...(input.solutionId ? { solutionId: input.solutionId } : {}),
    };
    projects.set(id, detail);
    persistProjects();
    if (input.calculation) {
      this.saveSnapshot(id, {
        calculation: input.calculation,
        ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
      });
    }
    return projects.get(id)!;
  },
  copy(sourceId: string) {
    const source = projects.get(sourceId);
    if (!source) return null;
    const id = nextProjectId();
    const detail: ProjectDetail = {
      ...source,
      id,
      title: `${source.title} (копия)`,
      meta: `РАСЧЁТ №${id} · ${new Date().toLocaleDateString('ru-RU')}`,
      createdAt: new Date().toISOString(),
      calculationId: id,
    };
    projects.set(id, detail);
    persistProjects();
    return detail;
  },
};

/** Расчёты мастера (POST /calculations) — открываются по id после перезагрузки. */
const calculations = loadMap<CalculationResult>('calculations');

export const calculationStore = {
  get: (id: string) => calculations.get(id) ?? null,
  save(result: Omit<CalculationResult, 'id'>) {
    const id = `calc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const stored = { ...result, id } as CalculationResult;
    calculations.set(id, stored);
    // Храним последние 50: в localStorage место ограничено.
    for (const key of [...calculations.keys()].slice(0, Math.max(0, calculations.size - 50))) calculations.delete(key);
    saveMap('calculations', calculations);
    return stored;
  },
};
