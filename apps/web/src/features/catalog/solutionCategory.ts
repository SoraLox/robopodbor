import { Hand, Shuffle, Truck, Warehouse, ScanEye, Bot, type LucideIcon } from 'lucide-react';
import type { Solution } from '@/api/types';

export interface SolutionCategory {
  id: string;
  label: string;
  icon: LucideIcon;
}

const CATEGORIES: (SolutionCategory & { match: RegExp })[] = [
  { id: 'amr', label: 'AMR / транспортировка', icon: Truck, match: /паллетовоз|amr|транспортир/i },
  { id: 'asrs', label: 'AS/RS · хранение', icon: Warehouse, match: /as\/rs|штабел|хранени/i },
  { id: 'sort', label: 'Сортировка', icon: Shuffle, match: /сортир/i },
  { id: 'pick', label: 'Пикинг / манипуляторы', icon: Hand, match: /манипулятор|пикинг|отбор|захват/i },
  { id: 'uav', label: 'Инвентаризация БАС', icon: ScanEye, match: /бас|дрон|инвентариза/i },
];

const FALLBACK: SolutionCategory = { id: 'other', label: 'Другое решение', icon: Bot };

/** Класс решения выводится из названия/задачи — у Solution нет отдельного поля класса. */
export function categorize(solution: Pick<Solution, 'name' | 'useCase'>): SolutionCategory {
  const haystack = `${solution.name} ${solution.useCase}`;
  const found = CATEGORIES.find((category) => category.match.test(haystack));
  return found ? { id: found.id, label: found.label, icon: found.icon } : FALLBACK;
}

export function listCategories(): SolutionCategory[] {
  return CATEGORIES.map(({ id, label, icon }) => ({ id, label, icon }));
}
