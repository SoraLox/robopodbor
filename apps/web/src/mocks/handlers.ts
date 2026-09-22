import { http, HttpResponse } from 'msw';
import {
  demoCalculation,
  objectParameters,
  objectTypes,
  solutions as seedSolutions,
  taxonomy,
} from './fixtures';
import {
  closeSession,
  createAccount,
  openSession,
  projectStore,
  userBySid,
  verify,
} from './db';
import type { Solution } from '@/api/types';

/**
 * Пути заданы через `*` — один набор обработчиков подходит и браузеру,
 * и Node в тестах, где fetch требует абсолютный URL.
 *
 * Сессия живёт в httpOnly-cookie `sid`: фронт её не читает, а только
 * шлёт запросы с `credentials: 'include'`.
 */

const SESSION_COOKIE = 'sid';

function sidOf(cookies: Record<string, string>) {
  return cookies[SESSION_COOKIE];
}

function setSessionCookie(sid: string) {
  return {
    'Set-Cookie': `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
  };
}

/** Мутабельная копия каталога: админка правит её через API. */
const catalog = new Map<string, Solution>(seedSolutions.map((s) => [s.id, s]));

export const handlers = [
  // ─── Аутентификация ───────────────────────────────────────────────
  http.post('*/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      password: string;
      organization?: string;
    };
    const user = createAccount(body.email, body.password, body.organization);
    if (!user) {
      return HttpResponse.json({ message: 'Пользователь уже существует' }, { status: 409 });
    }
    return HttpResponse.json(user, { status: 201, headers: setSessionCookie(openSession(body.email)) });
  }),

  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    const user = verify(body.email, body.password);
    if (!user) {
      return HttpResponse.json({ message: 'Неверная почта или пароль' }, { status: 401 });
    }
    return HttpResponse.json(user, { headers: setSessionCookie(openSession(body.email)) });
  }),

  http.post('*/api/auth/logout', ({ cookies }) => {
    closeSession(sidOf(cookies));
    return new HttpResponse(null, {
      status: 204,
      headers: { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0` },
    });
  }),

  http.get('*/api/auth/session', ({ cookies }) => {
    const user = userBySid(sidOf(cookies));
    if (!user) return HttpResponse.json({ message: 'Нет сессии' }, { status: 401 });
    return HttpResponse.json(user);
  }),

  // ─── Объекты ──────────────────────────────────────────────────────
  http.get('*/api/object-types', () => HttpResponse.json(objectTypes)),

  http.get('*/api/object-types/:slug/parameters', ({ params }) => {
    const slug = String(params.slug);
    return HttpResponse.json(objectParameters[slug] ?? objectParameters.warehouse);
  }),

  http.post('*/api/object-types/:slug/parameters/import', async ({ params, request }) => {
    const slug = String(params.slug);
    const fields = objectParameters[slug] ?? objectParameters.warehouse ?? [];
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return HttpResponse.json({ message: 'Файл не передан' }, { status: 422 });
    }

    // Мок разбирает CSV «ключ;значение»; xlsx отдаёт значения по умолчанию.
    const values: Record<string, string> = {};
    const skipped: string[] = [];
    if (/\.(csv|txt)$/i.test(file.name)) {
      const text = await file.text();
      for (const line of text.split(/\r?\n/)) {
        const [key, value] = line.split(/[;,\t]/);
        if (!key || value === undefined) continue;
        const field = fields.find((f) => f.id === key.trim() || f.label === key.trim());
        if (field) values[field.id] = value.trim();
        else skipped.push(key.trim());
      }
    } else {
      for (const field of fields) {
        if (field.defaultValue) values[field.id] = field.defaultValue;
      }
    }

    if (Object.keys(values).length === 0) {
      return HttpResponse.json({ message: 'Не распознано ни одно поле' }, { status: 422 });
    }
    return HttpResponse.json({ values, recognized: Object.keys(values).length, skipped });
  }),

  // ─── Расчёт ───────────────────────────────────────────────────────
  http.get('*/api/calculations/:calculationId', async ({ params }) => {
    // Прогон на бэкенде занимает до 60 секунд — мок держит паузу,
    // чтобы UI ожидания был виден в демо.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const { calculationId } = params;
    return HttpResponse.json({
      ...demoCalculation,
      id: typeof calculationId === 'string' ? calculationId : demoCalculation.id,
    });
  }),

  // ─── Каталог ──────────────────────────────────────────────────────
  http.get('*/api/catalog/solutions', ({ request }) => {
    const objectType = new URL(request.url).searchParams.get('objectType');
    const all = [...catalog.values()];
    const filtered = objectType
      ? all.filter((s) => !s.objectTypes || s.objectTypes.includes(objectType))
      : all;
    return HttpResponse.json([...filtered].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)));
  }),

  http.put('*/api/catalog/solutions/:solutionId', async ({ params, request, cookies }) => {
    const user = userBySid(sidOf(cookies));
    if (user?.role !== 'admin') {
      return HttpResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
    const body = (await request.json()) as Solution;
    const id = String(params.solutionId);
    catalog.set(id, { ...body, id });
    return HttpResponse.json(catalog.get(id));
  }),

  http.delete('*/api/catalog/solutions/:solutionId', ({ params, cookies }) => {
    const user = userBySid(sidOf(cookies));
    if (user?.role !== 'admin') {
      return HttpResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
    catalog.delete(String(params.solutionId));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/catalog/taxonomy', () => HttpResponse.json(taxonomy)),

  // ─── Проекты ──────────────────────────────────────────────────────
  http.get('*/api/projects', ({ cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    return HttpResponse.json(projectStore.list());
  }),

  http.post('*/api/projects', async ({ request, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    const body = (await request.json()) as {
      title: string;
      objectType: string;
      parameters: Record<string, string>;
      processes?: string[];
    };
    return HttpResponse.json(projectStore.create(body), { status: 201 });
  }),

  http.get('*/api/projects/:projectId', ({ params, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    const project = projectStore.get(String(params.projectId));
    if (!project) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    return HttpResponse.json(project);
  }),

  http.delete('*/api/projects/:projectId', ({ params, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    projectStore.remove(String(params.projectId));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('*/api/projects/:projectId/copy', ({ params, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    const copy = projectStore.copy(String(params.projectId));
    if (!copy) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    return HttpResponse.json(copy, { status: 201 });
  }),
];
