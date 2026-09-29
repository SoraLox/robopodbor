import { http, HttpResponse } from 'msw';
import {
  buildTaxonomy,
  changedFields,
  syncApplicability,
  withAdminEdits,
  withCompleteness,
  type CatalogSolution,
} from '@domain/catalog';
import { catalogToRows, rowsToCatalog } from '@domain/catalogTable';
import { checkValue, parseCsv, parseParameterRows, templateRows, toCsv } from '@domain/parameters';
import { DEFAULT_SOURCES } from '@domain/sources';
import { DEFAULT_MODEL_VERSION } from '@domain/versions';
import { selectSolutions } from '@domain/selection';
import { ECONOMICS_MODEL_VERSION, calculateEconomics } from '@domain/economics';
import { generateWarehouseScenarios } from '@domain/warehouseScenarios';
import {
  buildCatalog,
  mergeCatalogVersion,
  type CatalogFiles,
  type CatalogResearch,
  type CatalogSupplements,
} from '@domain/robotCatalog';
import supplementsJson from '@domain/catalogSupplements.json';
import researchJson from '@domain/catalogResearch.json';
import {
  demoCalculation,
  objectParameters,
  objectTypes,
  solutions as seedSolutions,
} from './fixtures';
import {
  calculationStore,
  closeSession,
  createAccount,
  openSession,
  projectStore,
  summaryOf,
  userBySid,
  verify,
} from './db';
import type { CalculationRequest, CalculationResult, ProjectInput, ProjectPatch, Solution } from '@/api/types';
import type { components } from '@/api/schema';

type Schemas = components['schemas'];
type CalculationSnapshotInput = Schemas['CalculationSnapshotInput'];
type DataSource = Schemas['DataSource'];
type DataSourceInput = Schemas['DataSourceInput'];
type ChangeLogEntry = Schemas['ChangeLogEntry'];
type ParameterFieldPatch = Schemas['ParameterFieldPatch'];

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

const sources = new Map<string, DataSource>(
  DEFAULT_SOURCES.map((source, index) => {
    const id = `src-${index + 1}`;
    return [id, { ...source, id, updatedAt: new Date().toISOString() }];
  }),
);

/** Журнал правок справочников, новые сверху. */
const changes: ChangeLogEntry[] = [];

function logChange(
  cookies: Record<string, string>,
  entry: Pick<ChangeLogEntry, 'entity' | 'entityId' | 'action' | 'summary' | 'diff'>,
) {
  const email = userBySid(sidOf(cookies))?.email;
  changes.unshift({
    id: `chg-${changes.length + 1}`,
    createdAt: new Date().toISOString(),
    ...(email ? { userEmail: email } : {}),
    ...entry,
  });
}

function diffOf(before: object, after: object) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const from = before as Record<string, unknown>;
  for (const [key, value] of Object.entries(after)) {
    if (key !== 'updatedAt' && JSON.stringify(from[key]) !== JSON.stringify(value)) {
      diff[key] = { from: from[key] ?? null, to: value ?? null };
    }
  }
  return diff;
}

/** null — можно продолжать; иначе готовый ответ 401/403. */
function denyUnlessAdmin(cookies: Record<string, string>) {
  const user = userBySid(sidOf(cookies));
  if (!user) return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
  if (user.role !== 'admin') return HttpResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
  return null;
}

function validSource(body: Partial<DataSourceInput>): body is DataSourceInput {
  return Boolean(body.title?.trim() && body.scope?.trim() && body.kind && body.actualAt?.trim() && typeof body.confirmed === 'boolean');
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function catalogFor(objectType?: string | null) {
  const all = [...catalog.values()].map((s) => withCompleteness(s));
  return objectType ? all.filter((s) => !s.objectTypes || s.objectTypes.includes(objectType)) : all;
}

function fieldsFor(slug: string) {
  return objectParameters[slug] ?? objectParameters.warehouse ?? [];
}

/** Файл в строки: CSV разбирается сразу, xlsx — через SheetJS (грузится только при загрузке файла). */
async function readRows(file: File): Promise<string[][]> {
  if (/\.(csv|txt)$/i.test(file.name)) return parseCsv(await file.text());
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false });
  const sheet = book.Sheets[book.SheetNames[0] ?? ''];
  return sheet ? XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false }) : [];
}

async function tableResponse(rows: string[][], name: string, format: string, sheetName: string) {
  const filename = encodeURIComponent(`${name}.${format === 'csv' ? 'csv' : 'xlsx'}`);
  const disposition = { 'Content-Disposition': `attachment; filename*=UTF-8''${filename}` };
  if (format === 'csv') {
    return new HttpResponse(toCsv(rows), { headers: { ...disposition, 'Content-Type': 'text/csv; charset=utf-8' } });
  }
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
  const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new HttpResponse(buffer, { headers: { ...disposition, 'Content-Type': XLSX_TYPE } });
}

const today = () => new Date().toLocaleDateString('ru-RU');

/**
 * Как на сервере: объекты и основания применимости согласованы, правленые
 * характеристики получают источник «правка администратора».
 */
function applyEdit(before: Solution | undefined, input: Partial<Solution>): Partial<Solution> {
  const { fieldSources: _ignored, ...changes } = input;
  const patch = syncApplicability(changes as Partial<CatalogSolution>, before as CatalogSolution | undefined);
  const edited = changedFields((before ?? {}) as CatalogSolution, patch);
  const fieldSources = withAdminEdits(before?.fieldSources, edited, today());
  return { ...(patch as Partial<Solution>), ...(fieldSources ? { fieldSources: fieldSources as Solution['fieldSources'] } : {}) };
}


const TOP_LEVEL_CATALOG_FILES: Record<string, keyof CatalogFiles> = {
  'index.json': 'index',
  'categories.json': 'categories',
  'vendors.json': 'vendors',
  'codes.json': 'codes',
  'sources.json': 'sources',
};

/** Как на сервере: файлы папки каталога роботов → CatalogFiles. */
async function catalogFilesOf(entries: FormDataEntryValue[]): Promise<Partial<CatalogFiles>> {
  const files: Partial<CatalogFiles> & { data: CatalogFiles['data'] } = { data: {} };
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    const parts = entry.name.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1]!;
    if (!name.endsWith('.json') || parts.includes('schema')) continue;
    const json = JSON.parse(await entry.text());
    if (parts[parts.length - 2] === 'data') files.data[`data/${name}`] = json;
    else if (TOP_LEVEL_CATALOG_FILES[name]) (files as Record<string, unknown>)[TOP_LEVEL_CATALOG_FILES[name]] = json;
  }
  return files;
}

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
  // Число решений — по каталогу, как на сервере; диапазона окупаемости без расчётов нет.
  http.get('*/api/object-types', () =>
    HttpResponse.json(
      objectTypes.map((type) => {
        const count = [...catalog.values()].filter((s) => s.objectTypes?.includes(type.slug)).length;
        return { ...type, solutionsCount: count, solutionsCountLabel: `${count} решений` };
      }),
    ),
  ),

  http.get('*/api/object-types/:slug/parameters', ({ params }) => HttpResponse.json(fieldsFor(String(params.slug)))),

  http.get('*/api/object-types/:slug/parameters/template', ({ params, request }) => {
    const slug = String(params.slug);
    const format = new URL(request.url).searchParams.get('format') ?? 'xlsx';
    return tableResponse(templateRows(fieldsFor(slug)), `passport-${slug}`, format, 'Паспорт объекта');
  }),

  http.post('*/api/object-types/:slug/parameters/import', async ({ params, request }) => {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return HttpResponse.json({ message: 'Файл не передан — выберите файл Excel или CSV' }, { status: 422 });
    }
    let rows: string[][];
    try {
      rows = await readRows(file);
    } catch {
      return HttpResponse.json(
        { message: 'Файл не читается — сохраните его как .xlsx или .csv и загрузите снова' },
        { status: 422 },
      );
    }
    const result = parseParameterRows(rows, fieldsFor(String(params.slug)));
    if (result.recognized === 0 && result.errors.length === 0) {
      return HttpResponse.json(
        { message: 'Не распознано ни одно поле — скачайте шаблон и заполните колонку «Значение»' },
        { status: 422 },
      );
    }
    return HttpResponse.json(result);
  }),

  http.post('*/api/selection', async ({ request }) => {
    const body = (await request.json()) as { objectType?: string; parameters?: Record<string, string> };
    if (!body.objectType) return HttpResponse.json({ message: 'Некорректный запрос: нужен objectType' }, { status: 400 });
    return HttpResponse.json(
      selectSolutions({
        objectType: body.objectType,
        parameters: body.parameters ?? {},
        solutions: catalogFor(body.objectType),
        fields: fieldsFor(body.objectType),
      }),
    );
  }),

  // ─── Расчёт ───────────────────────────────────────────────────────
  http.post('*/api/calculations', async ({ request }) => {
    const body = (await request.json()) as Partial<CalculationRequest>;
    if (!body.objectType || !body.solutionId) {
      return HttpResponse.json({ message: 'Некорректный запрос: нужны objectType и solutionId' }, { status: 400 });
    }
    const solution = catalog.get(body.solutionId);
    const solutionIds = [
      ...new Set([body.solutionId, ...(body.solutionIds ?? []), ...(body.assignments ?? []).map((a) => a.solutionId)]),
    ];
    const set = solutionIds.map((id) => catalog.get(id));
    if (!solution || set.some((item) => !item)) {
      return HttpResponse.json({ message: 'Решение не найдено в каталоге' }, { status: 404 });
    }
    const economics = calculateEconomics({
      objectType: body.objectType,
      parameters: body.parameters ?? {},
      fields: fieldsFor(body.objectType),
      solution: solution as unknown as CatalogSolution,
      solutions: set as unknown as CatalogSolution[],
      ...(body.assignments ? { assignments: body.assignments } : {}),
      ...(body.processes ? { processes: body.processes } : {}),
    });
    const stored = calculationStore.save({
      ...(economics as unknown as Omit<CalculationResult, 'id'>),
      solutionIds,
      ...(body.assignments ? { assignments: body.assignments } : {}),
      dataVersion: 'data-demo',
      modelVersion: ECONOMICS_MODEL_VERSION,
      calculatedAt: new Date().toISOString(),
    });
    return HttpResponse.json(stored, { status: 201 });
  }),

  http.post('*/api/calculations/scenarios', async ({ request }) => {
    const body = (await request.json()) as { objectType?: string; parameters?: Record<string, string> };
    if (body.objectType !== 'warehouse') {
      return HttpResponse.json({ message: 'Некорректный запрос: варианты есть только для склада' }, { status: 400 });
    }
    return HttpResponse.json(
      generateWarehouseScenarios({
        parameters: body.parameters ?? {},
        fields: fieldsFor('warehouse'),
        solutions: [...catalog.values()] as unknown as CatalogSolution[],
      }),
    );
  }),

  http.get('*/api/calculations/:calculationId', ({ params }) => {
    const id = String(params.calculationId);
    const calculation = calculationStore.get(id);
    if (calculation) return HttpResponse.json(calculation);
    const saved = projectStore.snapshot(id) ?? projectStore.history(id)[0];
    if (saved) {
      return HttpResponse.json({
        ...saved.result,
        id,
        dataVersion: saved.dataVersion,
        modelVersion: saved.modelVersion,
        calculatedAt: saved.createdAt,
      });
    }
    // Демо-расчёт — только по явной ссылке /results/demo (пример на лендинге).
    if (id !== 'demo') return HttpResponse.json({ message: 'Расчёт не найден' }, { status: 404 });
    return HttpResponse.json({
      ...demoCalculation,
      dataVersion: 'data-demo',
      modelVersion: DEFAULT_MODEL_VERSION,
      id,
    });
  }),

  // ─── Каталог ──────────────────────────────────────────────────────
  http.get('*/api/catalog/solutions', ({ request }) => {
    const objectType = new URL(request.url).searchParams.get('objectType');
    return HttpResponse.json(catalogFor(objectType).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)));
  }),

  http.post('*/api/catalog/solutions', async ({ request, cookies }) => {
    const user = userBySid(sidOf(cookies));
    if (user?.role !== 'admin') {
      return HttpResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
    const body = (await request.json()) as Solution;
    if (!body.name?.trim() || !body.vendor?.trim()) {
      return HttpResponse.json({ message: 'Некорректные данные: заполните наименование и производителя' }, { status: 400 });
    }
    const id = body.id?.trim() || `s-${Date.now()}`;
    catalog.set(id, { ...body, ...applyEdit(undefined, body), id } as Solution);
    logChange(cookies, { entity: 'solution', entityId: id, action: 'create', summary: `Добавлено решение «${body.name}»` });
    return HttpResponse.json(withCompleteness(catalog.get(id)!), { status: 201 });
  }),

  http.put('*/api/catalog/solutions/:solutionId', async ({ params, request, cookies }) => {
    const user = userBySid(sidOf(cookies));
    if (user?.role !== 'admin') {
      return HttpResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
    const body = (await request.json()) as Solution;
    const id = String(params.solutionId);
    const before = catalog.get(id);
    if (!before) return HttpResponse.json({ message: 'Не найдено' }, { status: 404 });
    const next = { ...before, ...applyEdit(before, body), id } as Solution;
    catalog.set(id, next);
    logChange(cookies, {
      entity: 'solution',
      entityId: id,
      action: 'update',
      summary: `Изменено решение «${next.name}»`,
      diff: diffOf(before, next),
    });
    return HttpResponse.json(withCompleteness(next));
  }),

  http.delete('*/api/catalog/solutions/:solutionId', ({ params, cookies }) => {
    const user = userBySid(sidOf(cookies));
    if (user?.role !== 'admin') {
      return HttpResponse.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
    const removed = catalog.get(String(params.solutionId));
    if (!removed) return HttpResponse.json({ message: 'Не найдено' }, { status: 404 });
    catalog.delete(removed.id);
    logChange(cookies, { entity: 'solution', entityId: removed.id, action: 'delete', summary: `Удалено решение «${removed.name}»` });
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/catalog/solutions/export', ({ request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const format = new URL(request.url).searchParams.get('format') ?? 'xlsx';
    return tableResponse(catalogToRows(catalogFor()), 'catalog', format, 'Каталог');
  }),

  http.post('*/api/admin/robot-catalog', async ({ request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
    let build;
    try {
      const files = await catalogFilesOf((await request.formData()).getAll('files'));
      build = buildCatalog(
        files as CatalogFiles,
        supplementsJson as unknown as CatalogSupplements,
        (id) => catalog.get(id)?.photos ?? [],
        researchJson as unknown as CatalogResearch,
      );
    } catch (error) {
      return HttpResponse.json({ message: error instanceof Error ? error.message : 'Каталог не собирается' }, { status: 422 });
    }
    const report = {
      added: [] as Array<{ id: string; name: string }>,
      updated: [] as Array<{ id: string; name: string; fields: string[] }>,
      unchanged: 0,
      missing: [] as Array<{ id: string; name: string }>,
      keptAdmin: [] as Array<{ id: string; name: string; fields: string[] }>,
    };
    const incomingIds = new Set(build.solutions.map((solution) => solution.id));
    for (const incoming of build.solutions) {
      const before = catalog.get(incoming.id) as CatalogSolution | undefined;
      const { next, changed, keptAdmin } = mergeCatalogVersion(before, incoming);
      const named = { id: incoming.id, name: incoming.name };
      if (keptAdmin.length) report.keptAdmin.push({ ...named, fields: keptAdmin });
      if (!before) report.added.push(named);
      else if (changed.length) report.updated.push({ ...named, fields: changed });
      else report.unchanged += 1;
      if (!dryRun && (!before || changed.length)) catalog.set(incoming.id, next as unknown as Solution);
    }
    for (const solution of catalog.values()) {
      if (solution.catalogCategory && !incomingIds.has(solution.id)) report.missing.push({ id: solution.id, name: solution.name });
    }
    if (!dryRun && (report.added.length || report.updated.length)) {
      logChange(cookies, {
        entity: 'catalog-import',
        entityId: `robots-catalog v${build.version.schema} от ${build.version.updated}`,
        action: 'import',
        summary: `Каталог роботов v${build.version.schema} от ${build.version.updated}: добавлено ${report.added.length}, обновлено ${report.updated.length}`,
      });
    }
    return HttpResponse.json({
      applied: !dryRun,
      version: build.version,
      total: build.solutions.length,
      fit: build.fit,
      filled: build.filled,
      conflicts: build.conflicts,
      ...report,
    });
  }),
  http.post('*/api/catalog/solutions/import', async ({ request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return HttpResponse.json({ message: 'Файл не передан' }, { status: 422 });
    let rows: string[][];
    try {
      rows = await readRows(file);
    } catch {
      return HttpResponse.json({ message: 'Файл не читается — сохраните его как .xlsx или .csv' }, { status: 422 });
    }
    const { items, errors } = rowsToCatalog(rows);
    let created = 0;
    let updated = 0;
    for (const { data } of items) {
      const existing = data.id
        ? catalog.get(data.id)
        : [...catalog.values()].find((s) => s.name === data.name && s.vendor === data.vendor);
      if (existing) {
        catalog.set(existing.id, { ...existing, ...applyEdit(existing, data as Partial<Solution>), id: existing.id } as Solution);
        updated += 1;
      } else {
        const id = data.id || `s-${Date.now()}-${created}`;
        catalog.set(id, {
          price: '0',
          payload: '—',
          speed: '—',
          maturity: 'piloting',
          confidence: 'needs-review',
          useCase: data.name ?? '',
          ...applyEdit(undefined, data as Partial<Solution>),
          id,
        } as Solution);
        created += 1;
      }
    }
    if (created || updated) {
      logChange(cookies, {
        entity: 'catalog-import',
        entityId: file.name,
        action: 'import',
        summary: `Импорт каталога из «${file.name}»: добавлено ${created}, обновлено ${updated}`,
      });
    }
    return HttpResponse.json({ created, updated, errors });
  }),

  http.get('*/api/catalog/taxonomy', () => HttpResponse.json(buildTaxonomy(catalogFor()))),

  // ─── Источники, нормативы, журнал (администрирование) ─────────────
  http.get('*/api/sources', () => HttpResponse.json([...sources.values()])),

  http.post('*/api/admin/sources', async ({ request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const body = (await request.json()) as Partial<DataSourceInput>;
    if (!validSource(body)) return HttpResponse.json({ message: 'Некорректные данные: заполните все поля' }, { status: 400 });
    const id = `src-${Date.now()}`;
    const source: DataSource = { ...body, id, updatedAt: new Date().toISOString() };
    if (!source.url) delete source.url;
    sources.set(id, source);
    logChange(cookies, { entity: 'source', entityId: id, action: 'create', summary: `Добавлен источник «${source.title}»` });
    return HttpResponse.json(source, { status: 201 });
  }),

  http.put('*/api/admin/sources/:sourceId', async ({ params, request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const before = sources.get(String(params.sourceId));
    if (!before) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    const body = (await request.json()) as Partial<DataSourceInput>;
    if (!validSource(body)) return HttpResponse.json({ message: 'Некорректные данные: заполните все поля' }, { status: 400 });
    const next: DataSource = { ...body, id: before.id, updatedAt: new Date().toISOString() };
    if (!next.url) delete next.url;
    sources.set(before.id, next);
    logChange(cookies, {
      entity: 'source',
      entityId: before.id,
      action: 'update',
      summary: `Изменён источник «${next.title}»`,
      diff: diffOf(before, next),
    });
    return HttpResponse.json(next);
  }),

  http.delete('*/api/admin/sources/:sourceId', ({ params, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const before = sources.get(String(params.sourceId));
    if (!before) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    sources.delete(before.id);
    logChange(cookies, { entity: 'source', entityId: before.id, action: 'delete', summary: `Удалён источник «${before.title}»` });
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch('*/api/admin/parameters/:fieldId', async ({ params, request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const id = String(params.fieldId);
    const entry = Object.entries(objectParameters)
      .flatMap(([slug, fields]) => fields.map((field, index) => ({ slug, fields, field, index })))
      .find((item) => item.field.id === id);
    if (!entry) return HttpResponse.json({ message: 'Поле не найдено' }, { status: 404 });

    const patch = (await request.json()) as ParameterFieldPatch;
    const next = { ...entry.field };
    if (patch.min !== undefined) {
      if (patch.min === null) delete next.min;
      else next.min = patch.min;
    }
    if (patch.max !== undefined) {
      if (patch.max === null) delete next.max;
      else next.max = patch.max;
    }
    if (patch.required !== undefined) next.required = patch.required;
    if (patch.source !== undefined) next.source = patch.source.trim() || undefined;
    if (patch.hint !== undefined) next.hint = patch.hint.trim() || undefined;
    if (next.min !== undefined && next.max !== undefined && next.min > next.max) {
      return HttpResponse.json({ message: 'Минимум больше максимума — поменяйте значения местами' }, { status: 400 });
    }
    const fallback = patch.defaultValue ?? next.defaultValue;
    if (fallback) {
      const checked = checkValue({ ...next, required: false }, fallback);
      if ('error' in checked) {
        return HttpResponse.json({ message: `Значение по умолчанию: ${checked.error}` }, { status: 400 });
      }
      next.defaultValue = checked.value;
    } else if (patch.defaultValue !== undefined) {
      delete next.defaultValue;
    }
    entry.fields[entry.index] = next;
    logChange(cookies, {
      entity: 'parameter',
      entityId: id,
      action: 'update',
      summary: `Норматив «${next.label}» (${entry.slug})`,
      diff: diffOf(entry.field, next),
    });
    return HttpResponse.json(next);
  }),

  http.get('*/api/admin/changes', ({ request, cookies }) => {
    const denied = denyUnlessAdmin(cookies);
    if (denied) return denied;
    const url = new URL(request.url);
    const entity = url.searchParams.get('entity');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200);
    return HttpResponse.json(changes.filter((c) => !entity || c.entity === entity).slice(0, limit));
  }),

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
    const body = (await request.json()) as ProjectInput;
    return HttpResponse.json(projectStore.create(body), { status: 201 });
  }),

  http.patch('*/api/projects/:projectId', async ({ params, request, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    const patch = (await request.json()) as ProjectPatch;
    if (patch.title !== undefined && !patch.title.trim()) {
      return HttpResponse.json({ message: 'Некорректные данные: название не может быть пустым' }, { status: 400 });
    }
    const project = projectStore.update(String(params.projectId), {
      ...patch,
      ...(patch.title ? { title: patch.title.trim() } : {}),
    });
    if (!project) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    return HttpResponse.json(project);
  }),

  http.get('*/api/projects/:projectId/calculations', ({ params, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    const id = String(params.projectId);
    if (!projectStore.get(id)) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    return HttpResponse.json(projectStore.history(id).map(summaryOf));
  }),

  http.post('*/api/projects/:projectId/calculations', async ({ params, request, cookies }) => {
    if (!userBySid(sidOf(cookies))) {
      return HttpResponse.json({ message: 'Требуется вход' }, { status: 401 });
    }
    const body = (await request.json()) as CalculationSnapshotInput;
    if (!body.calculation?.payback?.value) {
      return HttpResponse.json({ message: 'Некорректные данные: нет результата расчёта' }, { status: 400 });
    }
    const snapshot = projectStore.saveSnapshot(String(params.projectId), body);
    if (!snapshot) return HttpResponse.json({ message: 'Не найден' }, { status: 404 });
    return HttpResponse.json(snapshot, { status: 201 });
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
