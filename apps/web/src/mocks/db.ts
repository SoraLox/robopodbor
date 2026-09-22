/**
 * Состояние мок-бэкенда: пользователи, сессии и проекты живут в памяти
 * процесса. Сессия отдаётся httpOnly-cookie, поэтому фронт про токен
 * ничего не знает и обязан ходить с `credentials: 'include'`.
 */
import type { ProjectDetail, User } from '@/api/types';
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

export const projectStore = {
  list: () => [...projects.values()],
  get: (id: string) => projects.get(id) ?? null,
  remove: (id: string) => projects.delete(id),
  create(input: {
    title: string;
    objectType: string;
    parameters: Record<string, string>;
    processes?: string[];
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
    };
    projects.set(id, detail);
    return detail;
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
