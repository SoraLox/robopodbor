/**
 * Данные отчёта помимо самого расчёта (ТЗ 3.7.2, 3.7.5): паспорт объекта,
 * выбранное решение с результатом подбора, источники и версии.
 */
import { OBJECT_LABEL } from '@domain/catalog';
import { api } from '@/api/client';
import { useWizardStore } from '@/app/store';
import type { CalculationResult, DataSource, ParameterField, SelectionItem, Solution } from '@/api/types';

export const REPORT_DISCLAIMER =
  'Результат является предварительной оценкой и требует верификации при обследовании объекта. ' +
  'Значения, помеченные как допущения или «требует проверки», не подтверждены поставщиком.';

export interface ReportParameter {
  section: string;
  label: string;
  value: string;
  /** Пользователь не менял значение — подставлено по умолчанию. */
  byDefault: boolean;
  source?: string;
}

export interface ReportContext {
  objectLabel: string;
  generatedAt: Date;
  dataVersion: string;
  modelVersion: string;
  calculatedAt?: string;
  parameters: ReportParameter[];
  solution: Solution | null;
  selection: SelectionItem | null;
  sources: DataSource[];
}

function displayValue(field: ParameterField, raw: string) {
  const value = field.kind === 'select' ? field.options?.find((o) => o.value === raw)?.label ?? raw : raw;
  return value && field.unit ? `${value} ${field.unit}` : value || '—';
}

/** Сбор контекста не должен ломать выгрузку: чего не удалось получить — того нет в отчёте. */
export async function buildReportContext(result: CalculationResult, objectType: string): Promise<ReportContext> {
  const { parameters: entered, solutionId } = useWizardStore.getState();

  const [fieldsRes, sourcesRes, solutionsRes] = await Promise.all([
    api.GET('/object-types/{slug}/parameters', { params: { path: { slug: objectType } } }).catch(() => null),
    api.GET('/sources').catch(() => null),
    solutionId ? api.GET('/catalog/solutions', { params: { query: { objectType } } }).catch(() => null) : null,
  ]);
  const fields = fieldsRes?.data ?? [];
  const values = Object.fromEntries(fields.map((f) => [f.id, entered[f.id] ?? f.defaultValue ?? '']));

  const selectionRes = solutionId
    ? await api.POST('/selection', { body: { objectType, parameters: values } }).catch(() => null)
    : null;

  return {
    objectLabel: OBJECT_LABEL[objectType] ?? objectType,
    generatedAt: new Date(),
    dataVersion: result.dataVersion ?? 'не указана',
    modelVersion: result.modelVersion ?? 'не указана',
    ...(result.calculatedAt ? { calculatedAt: result.calculatedAt } : {}),
    parameters: fields.map((field) => ({
      section: field.section ?? 'Параметры',
      label: field.label,
      value: displayValue(field, values[field.id] ?? ''),
      byDefault: entered[field.id] === undefined || entered[field.id] === field.defaultValue,
      ...(field.source ? { source: field.source } : {}),
    })),
    solution: solutionsRes?.data?.find((s) => s.id === solutionId) ?? null,
    selection: selectionRes?.data?.items.find((item) => item.solutionId === solutionId) ?? null,
    sources: sourcesRes?.data ?? [],
  };
}
