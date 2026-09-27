/**
 * Состояние мок-бэкенда: пользователи, сессии и проекты живут в памяти
 * процесса. Сессия отдаётся httpOnly-cookie, поэтому фронт про токен
 * ничего не знает и обязан ходить с `credentials: 'include'`.
 */
import { DEFAULT_MODEL_VERSION } from '@domain/versions';
import type { CalculationResult, CalculationSnapshot, ProjectDetail, User } from '@/api/types';
import { demoCalculation, projects as seedProjects } from './fixtures';

interface Account {
  user: User;
  password: string;
}

const accounts = new Map<string, Account>([
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
]);

/**
 * sid → email.
 *
 * Состояние мока живёт в модуле и стирается при перезагрузке страницы,
 * а cookie у браузера остаётся — получалось, что после F5 пользователь
 * «разлогинивался». Поэтому в браузере зеркалим карту в sessionStorage.
 * Настоящему бэкенду это не нужно: у него сессии в своём хранилище.
 */
const SESSION_KEY = 'msw:sessions';

function restoreSessions(): Map<string, string> {
  if (typeof sessionStorage === 'undefined') return new Map();
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Map(Object.entries(JSON.parse(raw) as Record<string, string>)) : new Map();
  } catch {
    return new Map();
  }
}

const sessions = restoreSessions();

function persistSessions() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(sessions)));
  } catch {
    // Приватный режим или переполнение — сессия просто не переживёт F5.
  }
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
const projects = new Map<string, ProjectDetail>(
  seedProjects.map((project) => [
    project.id,
    {
      ...project,
      objectType: 'warehouse',
      parameters: {
        area: '20000',
        shifts: '3',
        staff: '64',
        flow: '1850',
        horizon: '7',
        region: 'Нижегородская обл.',
      },
      processes: ['transport', 'storage', 'picking'],
      scenarios: demoCalculation.scenarios,
      calculationId: project.id,
    },
  ]),
);

interface StoredSnapshot extends CalculationSnapshot {
  result: CalculationResult;
}

/** История расчётов по проектам и быстрый поиск снимка по id для GET /calculations/:id. */
const snapshots = new Map<string, StoredSnapshot[]>();
const snapshotById = new Map<string, StoredSnapshot>();

export function summaryOf({ result, ...summary }: StoredSnapshot): CalculationSnapshot {
  void result;
  return summary;
}

/** В моках каталог не версионируется журналом — версия данных фиксированная. */
const MOCK_DATA_VERSION = 'data-demo';

export const projectStore = {
  list: () => [...projects.values()],
  get: (id: string) => projects.get(id) ?? null,
  remove: (id: string) => projects.delete(id),
  update(id: string, patch: Partial<Pick<ProjectDetail, 'title' | 'status' | 'parameters' | 'processes' | 'solutionId'>>) {
    const project = projects.get(id);
    if (!project) return null;
    const next = { ...project, ...patch };
    projects.set(id, next);
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
      calculationId: id,
      dataVersion: snapshot.dataVersion,
      modelVersion: snapshot.modelVersion,
      calculatedAt: snapshot.createdAt,
      ...(snapshot.solutionId ? { solutionId: snapshot.solutionId } : {}),
    });
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
    const id = String(78460 + projects.size);
    const detail: ProjectDetail = {
      id,
      title: input.title,
      meta: `РАСЧЁТ №${id} · ${new Date().toLocaleDateString('ru-RU')}`,
      payback: '3.2',
      status: 'piloting',
      objectType: input.objectType,
      parameters: input.parameters,
      processes: input.processes ?? [],
      scenarios: demoCalculation.scenarios,
      calculationId: 'demo',
      ...(input.solutionId ? { solutionId: input.solutionId } : {}),
    };
    projects.set(id, detail);
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
    const id = String(78460 + projects.size);
    const detail: ProjectDetail = {
      ...source,
      id,
      title: `${source.title} (копия)`,
      meta: `РАСЧЁТ №${id} · ${new Date().toLocaleDateString('ru-RU')}`,
      calculationId: id,
    };
    projects.set(id, detail);
    return detail;
  },
};
