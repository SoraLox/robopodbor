import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  CalculationResult,
  ImportedParameters,
  ObjectType,
  ParameterField,
  Project,
  ProjectDetail,
  ProjectInput,
  Solution,
  TaxonomyNode,
} from './types';

export const queryKeys = {
  objectTypes: ['object-types'] as const,
  calculation: (id: string) => ['calculation', id] as const,
  solutions: ['catalog', 'solutions'] as const,
  projects: ['projects'] as const,
};

export function useObjectTypes() {
  return useQuery({
    queryKey: queryKeys.objectTypes,
    queryFn: async (): Promise<ObjectType[]> => {
      const { data, error } = await api.GET('/object-types');
      if (error || !data) throw new Error('Не удалось загрузить типы объектов');
      return data;
    },
  });
}

export function useCalculation(calculationId: string) {
  return useQuery({
    queryKey: queryKeys.calculation(calculationId),
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
    queryFn: async (): Promise<TaxonomyNode[]> => {
      const { data, error } = await api.GET('/catalog/taxonomy');
      if (error || !data) throw new Error('Не удалось загрузить иерархию каталога');
      return data;
    },
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
      if (error || !data) throw new Error('Не удалось сохранить позицию');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.solutions }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.solutions }),
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
      if (response.status === 422) throw new Error('Файл не распознан');
      if (error || !data) throw new Error('Не удалось загрузить файл');
      return data;
    },
  });
}
