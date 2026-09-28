/**
 * Вводные объекта в отчёте — из полей паспорта и значений, с которыми считали:
 * введённое пользователем или значение по умолчанию из датасета организатора.
 */
import type { ParameterField } from '@/api/types';
import { formatGroupedNumber } from '@/lib/formatGroupedNumber';

export interface ObjectParameterItem {
  label: string;
  value: string;
  unit: string;
  /** Ключевой параметр — виден сразу, без разворачивания остальных вводных. */
  primary?: boolean;
  /** Пользователь не вводил — взято по умолчанию. */
  byDefault?: boolean;
}

export interface ObjectParameterGroup {
  title: string;
  items: ObjectParameterItem[];
}

function display(field: ParameterField, raw: string): string {
  if (field.kind === 'select') return field.options?.find((option) => option.value === raw)?.label ?? raw;
  if (field.kind === 'number' && /^-?\d+(\.\d+)?$/.test(raw)) return formatGroupedNumber(raw);
  return raw;
}

export function parameterGroups(fields: ParameterField[], entered: Record<string, string>): ObjectParameterGroup[] {
  const groups = new Map<string, ObjectParameterItem[]>();
  for (const field of fields) {
    const own = entered[field.id]?.trim();
    const raw = own || field.defaultValue || '';
    if (!raw) continue;
    const title = (field.section ?? 'Параметры').toUpperCase();
    const items = groups.get(title) ?? [];
    items.push({
      label: field.label,
      value: display(field, raw),
      unit: field.kind === 'select' ? '' : field.unit ?? '',
      primary: items.length === 0,
      byDefault: !own,
    });
    groups.set(title, items);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}
