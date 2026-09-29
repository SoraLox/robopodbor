import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { API_BASE, api } from './client';
import type {
  CalculationRequest,
  ScenarioVariant,
  CalculationResult,
  CalculationSnapshot,
  CatalogImportResult,
  RobotCatalogImportReport,
  ChangeLogEntry,
  DataSource,
  DataSourceInput,
  ParameterFieldPatch,
  ImportedParameters,
  ObjectType,
  ParameterField,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectPatch,
  SelectionResult,
  Solution,
  TaxonomyNode,
} from './types';

// Справочники (типы объектов, каталог, таксономия, состав полей) меняются только
// через админку, а её мутации сами инвалидируют кеш — перезапрашивать их при
// каждом переходе между страницами незачем.
const REFERENCE_STALE_MS = 5 * 60_000;

/** Правка каталога меняет и дерево иерархии, и результаты подбора. */
function invalidateCatalog(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['catalog'] });
  void queryClient.invalidateQueries({ queryKey: ['selection'] });
  void queryClient.invalidateQueries({ queryKey: ['admin', 'changes'] });
}

/** Скачивание файла (шаблон, выгрузка каталога): имя из Content-Disposition или запасное. */
export async function downloadFile(path: string, fallbackName: string) {
  const response = await globalThis.fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) throw new Error('Не удалось скачать файл');
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const queryKeys = {
  objectTypes: ['object-types'] as const,
  calculation: (id: string) => ['calculation', id] as const,
  solutions: ['catalog', 'solutions'] as const,
  projects: ['projects'] as const,
};

export function useObjectTypes() {
  return useQuery({
    queryKey: queryKeys.objectTypes,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<ObjectType[]> => {
      const { data, error } = await api.GET('/object-types');
      if (error || !data) throw new Error('Не удалось загрузить типы объектов');
      return data;
    },
  });
}

/** Расчёт экономики по паспорту и выбранному решению; результат сохраняется на сервере. */
export async function runCalculation(input: CalculationRequest): Promise<CalculationResult> {
  const { data, error } = await api.POST('/calculations', { body: input });
  if (error || !data) throw new Error('Не удалось посчитать экономику');
  return data;
}

/**
 * Расчёт шага «Считаем экономику». Ключ — сами входы: вернулись назад и
 * снова вперёд без правок — показываем тот же результат, без повторного POST.
 */
export function useRunCalculation(input: CalculationRequest | null, enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['calculation-run', input] as const,
    enabled: enabled && input !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const result = await runCalculation(input!);
      queryClient.setQueryData(queryKeys.calculation(result.id), result);
      return result;
    },
  });
}

export function useCalculation(calculationId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calculation(calculationId),
    enabled: enabled && calculationId.length > 0,
    queryFn: async (): Promise<CalculationResult> => {
      const { data, error } = await api.GET('/calculations/{calculationId}', {
        params: { path: { calculationId } },
      });
      if (error || !data) throw new Error('Не удалось загрузить расчёт');
      return data;
    },
  });
}

export function useSolutions(objectType?: string) {
  return useQuery({
    queryKey: [...queryKeys.solutions, objectType ?? 'all'] as const,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<Solution[]> => {
      const { data, error } = await api.GET('/catalog/solutions', {
        ...(objectType ? { params: { query: { objectType } } } : {}),
      });
      if (error || !data) throw new Error('Не удалось загрузить каталог');
      return data;
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await api.GET('/projects');
      if (error || !data) throw new Error('Не удалось загрузить расчёты');
      return data;
    },
  });
}

// ─── Параметры объекта, проекты и каталог ───────────────────────────

export function useObjectParameters(slug: string) {
  return useQuery({
    queryKey: ['object-parameters', slug] as const,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<ParameterField[]> => {
      const { data, error } = await api.GET('/object-types/{slug}/parameters', {
        params: { path: { slug } },
      });
      if (error || !data) throw new Error('Не удалось загрузить состав параметров');
      return data;
    },
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId] as const,
    queryFn: async (): Promise<ProjectDetail> => {
      const { data, error } = await api.GET('/projects/{projectId}', {
        params: { path: { projectId } },
      });
      if (error || !data) throw new Error('Не удалось открыть проект');
      return data;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProjectInput): Promise<ProjectDetail> => {
      const { data, error } = await api.POST('/projects', { body });
      if (error || !data) throw new Error('Не удалось сохранить проект');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, patch }: { projectId: string; patch: ProjectPatch }): Promise<ProjectDetail> => {
      const { data, error } = await api.PATCH('/projects/{projectId}', {
        params: { path: { projectId } },
        body: patch,
      });
      if (error || !data) throw new Error('Не удалось сохранить изменения');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

/** История сохранённых расчётов проекта с версиями данных и модели (ТЗ 3.1.5). */
export function useProjectHistory(projectId: string | null) {
  return useQuery({
    queryKey: ['projects', projectId, 'calculations'] as const,
    enabled: Boolean(projectId),
    queryFn: async (): Promise<CalculationSnapshot[]> => {
      const { data, error } = await api.GET('/projects/{projectId}/calculations', {
        params: { path: { projectId: projectId ?? '' } },
      });
      if (error || !data) throw new Error('Не удалось загрузить историю расчётов');
      return data;
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.DELETE('/projects/{projectId}', { params: { path: { projectId } } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useCopyProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<ProjectDetail> => {
      const { data, error } = await api.POST('/projects/{projectId}/copy', {
        params: { path: { projectId } },
      });
      if (error || !data) throw new Error('Не удалось скопировать проект');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useTaxonomy() {
  return useQuery({
    queryKey: ['catalog', 'taxonomy'] as const,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<TaxonomyNode[]> => {
      const { data, error } = await api.GET('/catalog/taxonomy');
      if (error || !data) throw new Error('Не удалось загрузить иерархию каталога');
      return data;
    },
  });
}

/**
 * Подбор под паспорт объекта. Ключ включает параметры: правка паспорта
 * даёт новый подбор, а возврат к прежним значениям берётся из кеша.
 */
export function useSelection(objectType: string | null, parameters: Record<string, string>) {
  return useQuery({
    queryKey: ['selection', objectType, parameters] as const,
    enabled: Boolean(objectType),
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<SelectionResult> => {
      const { data, error } = await api.POST('/selection', { body: { objectType: objectType ?? '', parameters } });
      if (error || !data) throw new Error('Не удалось подобрать решения');
      return data;
    },
  });
}

/** Варианты сценария склада с экономикой каждого (POST /calculations/scenarios). Запускается по кнопке. */
export function useScenarioVariants(parameters: Record<string, string>, enabled: boolean) {
  return useQuery({
    queryKey: ['scenario-variants', parameters] as const,
    enabled,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<ScenarioVariant[]> => {
      const { data, error } = await api.POST('/calculations/scenarios', {
        body: { objectType: 'warehouse', parameters },
      });
      if (error || !data) throw new Error('Не удалось собрать варианты');
      return data;
    },
  });
}

export function useCreateSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (solution: Solution): Promise<Solution> => {
      const { data, error, response } = await api.POST('/catalog/solutions', { body: solution });
      if (response.status === 403) throw new Error('Недостаточно прав');
      if (error || !data) {
        throw new Error((error as { message?: string } | undefined)?.message ?? 'Не удалось добавить позицию');
      }
      return data;
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (solution: Solution): Promise<Solution> => {
      const { data, error, response } = await api.PUT('/catalog/solutions/{solutionId}', {
        params: { path: { solutionId: solution.id } },
        body: solution,
      });
      if (response.status === 403) throw new Error('Недостаточно прав');
      if (error || !data) {
        throw new Error((error as { message?: string } | undefined)?.message ?? 'Не удалось сохранить позицию');
      }
      return data;
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useDeleteSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (solutionId: string) => {
      const { response } = await api.DELETE('/catalog/solutions/{solutionId}', {
        params: { path: { solutionId } },
      });
      if (response.status === 403) throw new Error('Недостаточно прав');
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useImportParameters(slug: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<ImportedParameters> => {
      const body = new FormData();
      body.append('file', file);
      const { data, error, response } = await api.POST(
        '/object-types/{slug}/parameters/import',
        {
          params: { path: { slug } },
          body: body as never,
          bodySerializer: (value: unknown) => value as FormData,
        },
      );
      if (error || !data) {
        throw new Error(
          (error as { message?: string } | undefined)?.message ??
            (response.status === 413 ? 'Файл больше 5 МБ' : 'Не удалось загрузить файл'),
        );
      }
      return data;
    },
  });
}

// ─── Администрирование: источники, нормативы, журнал ────────────────

function invalidateAdmin(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'changes'] });
}

/** Тело ответа уже разобрано openapi-fetch — текст ошибки берём из `error`. */
function failure(response: Response, error: unknown, fallback: string): never {
  if (response.status === 403) throw new Error('Недостаточно прав');
  throw new Error((error as { message?: string } | undefined)?.message ?? fallback);
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'] as const,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async (): Promise<DataSource[]> => {
      const { data, error } = await api.GET('/sources');
      if (error || !data) throw new Error('Не удалось загрузить источники');
      return data;
    },
  });
}

export function useSaveSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: DataSourceInput }): Promise<DataSource> => {
      const { data, error, response } = id
        ? await api.PUT('/admin/sources/{sourceId}', { params: { path: { sourceId: id } }, body })
        : await api.POST('/admin/sources', { body });
      if (!data) return failure(response, error, 'Не удалось сохранить источник');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      invalidateAdmin(queryClient);
    },
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/admin/sources/{sourceId}', { params: { path: { sourceId: id } } });
      if (!response.ok) failure(response, error, 'Не удалось удалить источник');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      invalidateAdmin(queryClient);
    },
  });
}

export function useUpdateParameterField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fieldId, patch }: { fieldId: string; patch: ParameterFieldPatch }): Promise<ParameterField> => {
      const { data, error, response } = await api.PATCH('/admin/parameters/{fieldId}', {
        params: { path: { fieldId } },
        body: patch,
      });
      if (!data) return failure(response, error, 'Не удалось сохранить норматив');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['object-parameters'] });
      void queryClient.invalidateQueries({ queryKey: ['selection'] });
      invalidateAdmin(queryClient);
    },
  });
}

export function useChanges(entity?: ChangeLogEntry['entity'], enabled = true) {
  return useQuery({
    queryKey: ['admin', 'changes', entity ?? 'all'] as const,
    enabled,
    queryFn: async (): Promise<ChangeLogEntry[]> => {
      const { data, error, response } = await api.GET('/admin/changes', {
        params: { query: { limit: 100, ...(entity ? { entity } : {}) } },
      });
      if (!data) return failure(response, error, 'Не удалось загрузить журнал');
      return data;
    },
  });
}

/**
 * Новая версия каталога роботов: файлы папки каталога с путями внутри неё.
 * dryRun — только отчёт «что изменится», без записи.
 */
export function useRobotCatalogImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, dryRun }: { files: File[]; dryRun: boolean }): Promise<RobotCatalogImportReport> => {
      const body = new FormData();
      for (const file of files) body.append('files', file, file.webkitRelativePath || file.name);
      const { data, error, response } = await api.POST('/admin/robot-catalog', {
        params: { query: dryRun ? { dryRun: '1' } : {} },
        body: body as never,
        bodySerializer: (value: unknown) => value as FormData,
      });
      if (!data) return failure(response, error, 'Не удалось загрузить каталог');
      return data;
    },
    onSuccess: (report) => {
      if (!report.applied) return;
      invalidateCatalog(queryClient);
      invalidateAdmin(queryClient);
    },
  });
}

export function useImportCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<CatalogImportResult> => {
      const body = new FormData();
      body.append('file', file);
      const { data, error, response } = await api.POST('/catalog/solutions/import', {
        body: body as never,
        bodySerializer: (value: unknown) => value as FormData,
      });
      if (!data) return failure(response, error, 'Не удалось загрузить каталог');
      return data;
    },
    onSuccess: () => {
      invalidateCatalog(queryClient);
      invalidateAdmin(queryClient);
    },
  });
}
