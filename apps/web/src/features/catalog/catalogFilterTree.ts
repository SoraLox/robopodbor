import {
  CATALOG_CATEGORY_LABEL,
  OBJECT_LABEL,
  OBJECT_PROCESSES,
  SOLUTION_TYPES,
} from '@domain/catalog';
import type { Solution } from '@/api/types';

/** Короткие названия процессов в фильтре — как в каталоге одежды. */
const PROCESS_FILTER_LABEL: Record<string, string> = {
  receiving: 'Погрузка и разгрузка',
  transport: 'Транспортировщики',
  storage: 'Хранение',
  picking: 'Комплектация',
  sorting: 'Сортировка',
  inventory: 'Инвентаризация',
  cleaning: 'Уборка',
  security: 'Охрана',
  baggage: 'Обработка багажа',
  ramp: 'Перронная логистика',
  cargo: 'Грузовой терминал',
  inspection: 'Осмотр и мониторинг',
  delivery: 'Доставка',
  linen: 'Бельё и питание',
  pharmacy: 'Аптека',
  disinfection: 'Дезинфекция',
  laboratory: 'Лаборатория',
  care: 'Медицинская помощь',
  passengers: 'Пассажиры',
  fire: 'Пожарная безопасность',
};

export type FilterTreeLevel = 'object' | 'process' | 'category';

/**
 * Ветка «весь каталог»: категории без привязки к объекту. Через неё видны и
 * роботы вне склада, аэропорта и клиники (БАС, суда, агро — больше половины каталога).
 */
export const WHOLE_CATALOG = '*';

export type TreeSelection = {
  objectType: string;
  process?: string;
  category?: string;
};

export type FilterTreeNode = {
  id: string;
  label: string;
  level: FilterTreeLevel;
  objectType: string;
  process?: string;
  category?: string;
  count: number;
  children: FilterTreeNode[];
};

function categoryOf(solution: Solution): { id: string; label: string } {
  const id = solution.catalogCategory ?? solution.solutionType ?? 'other';
  return {
    id,
    label: CATALOG_CATEGORY_LABEL[id] ?? SOLUTION_TYPES[id] ?? 'Другие роботы',
  };
}

function selectionOf(node: FilterTreeNode): TreeSelection {
  return {
    objectType: node.objectType,
    ...(node.process ? { process: node.process } : {}),
    ...(node.category ? { category: node.category } : {}),
  };
}

export function selectionKey(selection: TreeSelection | null): string {
  if (!selection) return '';
  return [selection.objectType, selection.process ?? '', selection.category ?? ''].join('/');
}

export function nodeSelectionKey(node: FilterTreeNode): string {
  return selectionKey(selectionOf(node));
}

export function isSameSelection(a: TreeSelection | null, b: TreeSelection | null): boolean {
  return selectionKey(a) === selectionKey(b);
}

export function matchesTreeSelection(solution: Solution, selection: TreeSelection | null): boolean {
  if (!selection) return true;
  const types = solution.objectTypes ?? [];
  if (selection.objectType !== WHOLE_CATALOG && !types.includes(selection.objectType)) return false;
  if (selection.process) {
    const processes = solution.processes ?? [];
    if (!processes.includes(selection.process)) return false;
  }
  if (selection.category) {
    const { id } = categoryOf(solution);
    if (id !== selection.category) return false;
  }
  return true;
}

/**
 * Дерево «объект → процесс → класс» из решений каталога.
 * Узлы без решений не показываем — как в витрине одежды.
 */
export function buildFilterTree(solutions: Solution[]): FilterTreeNode[] {
  const roots: FilterTreeNode[] = [];

  for (const [objectType, processes] of Object.entries(OBJECT_PROCESSES)) {
    const inObject = solutions.filter((solution) => solution.objectTypes?.includes(objectType));
    if (inObject.length === 0) continue;

    const processNodes: FilterTreeNode[] = [];
    for (const process of processes) {
      const inProcess = inObject.filter((solution) => solution.processes?.includes(process.id));
      if (inProcess.length === 0) continue;

      const byCategory = new Map<string, { label: string; rows: Solution[] }>();
      for (const solution of inProcess) {
        const { id, label } = categoryOf(solution);
        const bucket = byCategory.get(id) ?? { label, rows: [] };
        bucket.rows.push(solution);
        byCategory.set(id, bucket);
      }

      const categoryNodes: FilterTreeNode[] = [...byCategory.entries()]
        .sort((a, b) => b[1].rows.length - a[1].rows.length)
        .map(([id, bucket]) => ({
          id: `${objectType}/${process.id}/${id}`,
          label: bucket.label,
          level: 'category' as const,
          objectType,
          process: process.id,
          category: id,
          count: bucket.rows.length,
          children: [],
        }));

      processNodes.push({
        id: `${objectType}/${process.id}`,
        label: PROCESS_FILTER_LABEL[process.id] ?? process.label,
        level: 'process',
        objectType,
        process: process.id,
        count: inProcess.length,
        children: categoryNodes,
      });
    }

    if (processNodes.length === 0) continue;

    roots.push({
      id: objectType,
      label: OBJECT_LABEL[objectType] ?? objectType,
      level: 'object',
      objectType,
      count: inObject.length,
      children: processNodes,
    });
  }

  const byCategory = new Map<string, { label: string; count: number }>();
  for (const solution of solutions) {
    const { id, label } = categoryOf(solution);
    const bucket = byCategory.get(id) ?? { label, count: 0 };
    bucket.count += 1;
    byCategory.set(id, bucket);
  }
  if (byCategory.size > 0) {
    roots.push({
      id: WHOLE_CATALOG,
      label: 'Весь каталог по категориям',
      level: 'object',
      objectType: WHOLE_CATALOG,
      count: solutions.length,
      children: [...byCategory.entries()]
        .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ru'))
        .map(([id, bucket]) => ({
          id: `${WHOLE_CATALOG}/${id}`,
          label: bucket.label,
          level: 'category' as const,
          objectType: WHOLE_CATALOG,
          category: id,
          count: bucket.count,
          children: [],
        })),
    });
  }

  return roots;
}

export function toSelection(node: FilterTreeNode): TreeSelection {
  return selectionOf(node);
}
