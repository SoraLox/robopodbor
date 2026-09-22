import type { ComponentType } from 'react';
import { Plane, Stethoscope, Warehouse } from 'lucide-react';

/** Иконка по типу объекта — картинок из API нет, подбираем по смыслу. */
export const TYPE_ICONS: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  warehouse: Warehouse,
  airport: Plane,
  clinic: Stethoscope,
};

/** Короткие подписи для списка выбора — одна строка. */
export const TYPE_BLURB: Record<string, string> = {
  warehouse: 'Паллеты, комплектация, логистика',
  airport: 'Багаж, перрон, инспекция',
  clinic: 'Расходники, бельё, аптека',
};

/** Родительный падеж для заголовка «Параметры …». */
export const TYPE_TITLE_GENITIVE: Record<string, string> = {
  warehouse: 'Склада',
  airport: 'Аэропорта',
  clinic: 'Медучреждения',
};
