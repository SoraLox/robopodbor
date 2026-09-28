/** Шаги мастера расчёта — общий источник для всех экранов мастера. */
export const WIZARD_STEPS = [
  { id: 'type', label: 'Тип объекта' },
  { id: 'params', label: 'Параметры' },
  { id: 'process', label: 'Процессы' },
  { id: 'result', label: 'Результат' },
];

/** У склада между параметрами и процессами — планировка (конструктор формы). */
export const WAREHOUSE_WIZARD_STEPS = [
  WIZARD_STEPS[0]!,
  WIZARD_STEPS[1]!,
  { id: 'layout', label: 'Планировка' },
  WIZARD_STEPS[2]!,
  WIZARD_STEPS[3]!,
];

export function wizardStepsFor(objectType: string) {
  return objectType === 'warehouse' ? WAREHOUSE_WIZARD_STEPS : WIZARD_STEPS;
}
