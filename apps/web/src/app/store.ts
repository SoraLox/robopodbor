import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { exposeForPerf } from '@/lib/perf/frameProfiler';

interface WizardState {
  /** Введённые параметры паспорта объекта — переживают шаги мастера. */
  parameters: Record<string, string>;
  setParameters: (values: Record<string, string>) => void;

  /** Отмеченные процессы. */
  processes: string[];
  setProcesses: (ids: string[]) => void;

  /** Решение каталога, выбранное для расчёта (главное в наборе). */
  solutionId: string | null;
  /** Выбирает одно решение: набор — только оно. */
  setSolutionId: (id: string) => void;

  /** Планировка склада из конструктора (warehouseLayout.encodeShape); null — стандартный прямоугольник. */
  layout: string | null;
  setLayout: (layout: string | null) => void;

  /** Набор роботов склада — по одному на флот (уборка, отбор, перемещение паллет). */
  fleetIds: string[];
  setFleet: (ids: string[], primary: string | null) => void;

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
  addCompared: (id: string) => void;
  resetCompared: () => void;
}

const wizard: StateCreator<WizardState> = (set) => ({
  objectType: null,
  setObjectType: (slug) => set({ objectType: slug }),

  parameters: {},
  setParameters: (values) => set({ parameters: values }),

  processes: ['transport', 'storage', 'picking'],
  setProcesses: (ids) => set({ processes: ids }),

  solutionId: null,
  setSolutionId: (id) => set({ solutionId: id, fleetIds: [id] }),

  layout: null,
  setLayout: (layout) => set({ layout }),

  fleetIds: [],
  setFleet: (ids, primary) => set({ fleetIds: ids, solutionId: primary }),

  loadProject: ({ objectType, parameters, processes }) =>
    set({
      objectType,
      parameters,
      ...(processes ? { processes } : {}),
    }),

  comparedIds: [],
  toggleCompared: (id) =>
    set((state) => ({
      comparedIds: state.comparedIds.includes(id)
        ? state.comparedIds.filter((value) => value !== id)
        : [...state.comparedIds, id],
    })),
  addCompared: (id) =>
    set((state) => ({
      comparedIds: state.comparedIds.includes(id) ? state.comparedIds : [...state.comparedIds, id],
    })),
  resetCompared: () => set({ comparedIds: [] }),
});

/**
 * Мастер переживает перезагрузку: без этого F5 на отчёте сбрасывал паспорт
 * и выбранного робота, и сцена строилась по значениям по умолчанию.
 * В тестах не сохраняем — каждый тест начинает с чистого мастера.
 */
export const useWizardStore =
  import.meta.env.MODE === 'test'
    ? create<WizardState>()(wizard)
    : create<WizardState>()(
        persist(wizard, {
          name: 'wizard',
          version: 1,
          storage: createJSONStorage(() => localStorage),
          partialize: ({ objectType, parameters, processes, solutionId, fleetIds, layout, comparedIds }) => ({
            objectType,
            layout,
            parameters,
            processes,
            solutionId,
            fleetIds,
            comparedIds,
          }),
        }),
      );

exposeForPerf('wizard', useWizardStore);
