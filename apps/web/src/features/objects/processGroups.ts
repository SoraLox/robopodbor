import {
  Bot,
  Brush,
  FlaskConical,
  Forklift,
  Hand,
  HeartPulse,
  Luggage,
  Package,
  Pill,
  ScanBarcode,
  ShieldCheck,
  ShieldPlus,
  Shuffle,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { CATALOG_CATEGORY_LABEL, OBJECT_PROCESSES, SOLUTION_TYPES } from '@domain/catalog';
import type { Solution } from '@/api/types';

/** Процесс объекта глазами пользователя: какие роботы его автоматизируют. */
const PROCESS_VIEW: Record<string, { title: string; icon: LucideIcon }> = {
  receiving: { title: 'Погрузка и разгрузка', icon: Forklift },
  transport: { title: 'Транспортные роботы', icon: Truck },
  storage: { title: 'Автоматизированное хранение', icon: Warehouse },
  picking: { title: 'Роботы для комплектации', icon: Hand },
  sorting: { title: 'Сортировка', icon: Shuffle },
  inventory: { title: 'Роботы-инвентаризаторы', icon: ScanBarcode },
  cleaning: { title: 'Роботы-уборщики', icon: Brush },
  security: { title: 'Охранные роботы', icon: ShieldCheck },
  baggage: { title: 'Обработка багажа', icon: Luggage },
  ramp: { title: 'Перронная техника', icon: Truck },
  cargo: { title: 'Грузовой терминал', icon: Package },
  inspection: { title: 'Охрана и мониторинг', icon: ShieldCheck },
  delivery: { title: 'Роботы-курьеры', icon: Package },
  linen: { title: 'Транспорт белья и питания', icon: Truck },
  pharmacy: { title: 'Аптечная автоматизация', icon: Pill },
  disinfection: { title: 'Дезинфекция', icon: ShieldPlus },
  laboratory: { title: 'Лабораторные роботы', icon: FlaskConical },
  care: { title: 'Медицинские и реабилитационные', icon: HeartPulse },
};

const OTHER_ID = 'other';

export interface RobotSubgroup<R> {
  id: string;
  label: string;
  rows: R[];
}

export interface RobotGroup<R> {
  id: string;
  title: string;
  /** Процесс объекта, который автоматизирует группа. */
  process: string;
  icon: LucideIcon;
  rows: R[];
  /** Подкатегории — категории каталога внутри процесса. Одна подкатегория — уровень пропускаем. */
  subgroups: RobotSubgroup<R>[];
}

function subgroupOf(solution: Solution): { id: string; label: string } {
  const id = solution.catalogCategory ?? solution.solutionType ?? OTHER_ID;
  return { id, label: CATALOG_CATEGORY_LABEL[id] ?? SOLUTION_TYPES[id] ?? 'Другие роботы' };
}

function subgroupsOf<R extends { solution: Solution }>(rows: R[]): RobotSubgroup<R>[] {
  const byId = new Map<string, RobotSubgroup<R>>();
  for (const row of rows) {
    const { id, label } = subgroupOf(row.solution);
    const bucket = byId.get(id) ?? { id, label, rows: [] };
    bucket.rows.push(row);
    byId.set(id, bucket);
  }
  return [...byId.values()].sort((a, b) => b.rows.length - a.rows.length);
}

/**
 * Раскладывает роботов по процессам объекта, а внутри — по категориям каталога.
 * Робот, который закрывает несколько процессов, попадает в каждую группу.
 * Порядок строк внутри группы сохраняется (он уже отсортирован подбором).
 */
export function groupByProcess<R extends { solution: Solution }>(objectType: string, rows: R[]): RobotGroup<R>[] {
  const processes = OBJECT_PROCESSES[objectType] ?? [];
  const known = new Set(processes.map((process) => process.id));
  const groups: RobotGroup<R>[] = [];

  for (const process of processes) {
    const inProcess = rows.filter((row) => row.solution.processes?.includes(process.id));
    if (!inProcess.length) continue;
    const view = PROCESS_VIEW[process.id];
    groups.push({
      id: process.id,
      title: view?.title ?? process.label,
      process: process.label,
      icon: view?.icon ?? Bot,
      rows: inProcess,
      subgroups: subgroupsOf(inProcess),
    });
  }

  const unassigned = rows.filter((row) => !row.solution.processes?.some((id) => known.has(id)));
  if (unassigned.length) {
    groups.push({
      id: OTHER_ID,
      title: 'Другие роботы',
      process: 'Процесс не определён',
      icon: Bot,
      rows: unassigned,
      subgroups: subgroupsOf(unassigned),
    });
  }
  return groups;
}

/** 1 робот, 2 робота, 5 роботов. */
export function robotsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'робот'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'робота'
        : 'роботов';
  return `${count} ${word}`;
}
