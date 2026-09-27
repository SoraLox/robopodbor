import {
  Bot,
  Brush,
  Forklift,
  Hand,
  Layers,
  Package,
  ScanEye,
  Shuffle,
  ShieldPlus,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { SOLUTION_TYPES } from '@domain/catalog';
import type { Solution } from '@/api/types';

export interface SolutionCategory {
  id: string;
  label: string;
  icon: LucideIcon;
}

const ICONS: Record<string, LucideIcon> = {
  amr: Truck,
  fmr: Forklift,
  stacker: Layers,
  tug: Truck,
  asrs: Warehouse,
  sorter: Shuffle,
  manipulator: Hand,
  cleaner: Brush,
  uav: ScanEye,
  disinfection: ShieldPlus,
  courier: Package,
};

/** Для позиций без поля solutionType (например, импортированных без типа) — по названию. */
const GUESS: Array<{ id: string; match: RegExp }> = [
  { id: 'amr', match: /паллетовоз|amr|транспортир/i },
  { id: 'asrs', match: /as\/rs|штабел|хранени/i },
  { id: 'sorter', match: /сортир/i },
  { id: 'manipulator', match: /манипулятор|пикинг|отбор|захват/i },
  { id: 'uav', match: /бас|дрон|инвентариза/i },
];

const FALLBACK: SolutionCategory = { id: 'other', label: 'Другое решение', icon: Bot };

export function categorize(solution: Pick<Solution, 'name' | 'useCase' | 'solutionType'>): SolutionCategory {
  const id =
    solution.solutionType ?? GUESS.find((entry) => entry.match.test(`${solution.name} ${solution.useCase}`))?.id;
  const label = id ? SOLUTION_TYPES[id] : undefined;
  if (!id || !label) return FALLBACK;
  return { id, label, icon: ICONS[id] ?? Bot };
}

export function listCategories(): SolutionCategory[] {
  return Object.entries(SOLUTION_TYPES).map(([id, label]) => ({ id, label, icon: ICONS[id] ?? Bot }));
}
