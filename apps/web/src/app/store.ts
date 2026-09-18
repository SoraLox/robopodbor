import { create } from 'zustand';

interface WizardState {
  /** Введённые параметры паспорта объекта — переживают шаги мастера. */
  parameters: Record<string, string>;
  setParameters: (values: Record<string, string>) => void;

  /** Отмеченные процессы. */
  processes: string[];
  setProcesses: (ids: string[]) => void;

  /** Загружает сохранённый проект обратно в мастер. */
  loadProject: (input: {
    objectType: string;
    parameters: Record<string, string>;
    processes?: string[];
  }) => void;

  /** Slug выбранного типа объекта в мастере расчёта. */
  objectType: string | null;
  setObjectType: (slug: string) => void;

  /** Идентификаторы решений, отмеченных для сравнения в каталоге. */
  comparedIds: string[];
  toggleCompared: (id: string) => void;
  resetCompared: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  objectType: 'warehouse',
  setObjectType: (slug) => set({ objectType: slug }),

  parameters: {},
  setParameters: (values) => set({ parameters: values }),

  processes: ['transport', 'storage', 'picking'],
  setProcesses: (ids) => set({ processes: ids }),

  loadProject: ({ objectType, parameters, processes }) =>
    set({
      objectType,
      parameters,
      ...(processes ? { processes } : {}),
    }),

  comparedIds: ['p15', 's20', 'srt8'],
  toggleCompared: (id) =>
    set((state) => ({
      comparedIds: state.comparedIds.includes(id)
        ? state.comparedIds.filter((value) => value !== id)
        : [...state.comparedIds, id],
    })),
  resetCompared: () => set({ comparedIds: [] }),
}));
