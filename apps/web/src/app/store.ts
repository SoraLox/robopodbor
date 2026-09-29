import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { exposeForPerf } from '@/lib/perf/frameProfiler';
import type { Assignment } from '@/api/types';

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

  /** Склад: состав решения — какой робот в каком слоте (приёмка, отгрузка, отбор…). */
  assignments: Assignment[];
  /** Задаёт состав; набор роботов и главный робот выводятся из него. */
  setAssignments: (assignments: Assignment[]) => void;

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

const EMPTY_SELECTION = { solutionId: null, fleetIds: [] as string[], assignments: [] as Assignment[] };

const wizard: StateCreator<WizardState> = (set) => ({
  objectType: null,
  // Новый подбор начинается с типа объекта или с паспорта: прежний состав решения
  // сбрасывается, иначе в новый расчёт тихо попадают роботы из прошлого.
  setObjectType: (slug) =>
    set((state) =>
      state.objectType === slug
        ? { objectType: slug, ...EMPTY_SELECTION }
        : { objectType: slug, ...EMPTY_SELECTION, layout: null },
    ),

  parameters: {},
  setParameters: (values) => set({ parameters: values, ...EMPTY_SELECTION }),

  processes: ['transport', 'storage', 'picking'],
  setProcesses: (ids) => set({ processes: ids }),

  solutionId: null,
  setSolutionId: (id) => set({ solutionId: id, fleetIds: [id], assignments: [] }),

  layout: null,
  setLayout: (layout) => set({ layout }),

  fleetIds: [],
  setFleet: (ids, primary) => set({ fleetIds: ids, solutionId: primary }),

  assignments: [],
  setAssignments: (assignments) => {
    const ids = [...new Set(assignments.map((a) => a.solutionId))];
    set({ assignments, fleetIds: ids, solutionId: ids[0] ?? null });
  },

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
          partialize: ({ objectType, parameters, processes, solutionId, fleetIds, assignments, layout, comparedIds }) => ({
            objectType,
            assignments,
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
