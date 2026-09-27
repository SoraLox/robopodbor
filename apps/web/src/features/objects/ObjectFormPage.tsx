import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Download, RotateCcw, Upload } from 'lucide-react';
import { checkValue } from '@domain/parameters';
import { useWizardStore } from '@/app/store';
import { downloadFile, useImportParameters, useObjectParameters } from '@/api/queries';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select } from '@/components/ui/select';
import { FormField, fieldDescribedBy } from '@/components/ui/form-field';
import type { ParameterField } from '@/api/types';
import { cn } from '@/lib/utils';
import { formatGroupedNumber } from '@/lib/formatGroupedNumber';

/** Те же правила, что при загрузке файла на сервере: тип, диапазон, варианты. */
function validate(field: ParameterField, raw: string): string | null {
  const result = checkValue(field, raw);
  return 'error' in result ? result.error : null;
}

/** Подсказка поля + значение по умолчанию и его источник (ТЗ 3.2.5). */
function fieldHint(field: ParameterField): string | undefined {
  const fallback = field.kind === 'select'
    ? field.options?.find((option) => option.value === field.defaultValue)?.label
    : field.defaultValue;
  const parts = [
    field.hint,
    fallback
      ? `По умолчанию: ${field.kind === 'number' ? formatGroupedNumber(fallback) : fallback}${field.unit && field.kind === 'number' ? ` ${field.unit}` : ''}.`
      : null,
    field.source && !field.hint?.includes(field.source) ? `Источник: ${field.source}.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

const iconButtonClass = cn(
  'flex size-7 flex-none items-center justify-center rounded-full border border-[#E5E5EA] bg-[#FAFAFA] text-foreground',
  'transition-colors hover:border-[#C7C7CC] hover:bg-[#F2F2F2]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const UNSECTIONED = 'Параметры';

/** Группирует поля по разделу из контракта, сохраняя порядок первого появления. */
function groupBySection(fields: ParameterField[]): [string, ParameterField[]][] {
  const groups = new Map<string, ParameterField[]>();
  for (const field of fields) {
    const section = field.section ?? UNSECTIONED;
    const group = groups.get(section);
    if (group) group.push(field);
    else groups.set(section, [field]);
  }
  return Array.from(groups.entries());
}

const fieldControlClass =
  'h-10 rounded-[10px] border-[#E5E5EA] bg-[#FAFAFA] text-[13px] hover:border-[#C7C7CC] focus-visible:border-primary-bright focus-visible:ring-2 focus-visible:ring-primary-bright/20';

/**
 * Параметры объекта — второй шаг мастера.
 * Кнопка Excel порталится в слот у заголовка карточки.
 */
export function ObjectFormPage({ showTitleImport = true }: { showTitleImport?: boolean } = {}) {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const { parameters, setParameters } = useWizardStore();

  const { data: fields, isLoading } = useObjectParameters(objectType);
  const importFile = useImportParameters(objectType);
  const fileInput = useRef<HTMLInputElement>(null);
  const [titleSlot, setTitleSlot] = useState<Element | null>(null);

  const [values, setValues] = useState<Record<string, string>>(parameters);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    setTitleSlot(document.getElementById('wizard-title-action'));
  }, []);

  useEffect(() => {
    if (!fields) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const field of fields) {
        if (next[field.id] === undefined) next[field.id] = field.defaultValue ?? '';
      }
      return next;
    });
  }, [fields]);

  const setValue = (id: string, next: string) => {
    setValues((prev) => ({ ...prev, [id]: next }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  };

  const resetSection = (sectionFields: ParameterField[]) => {
    setValues((prev) => {
      const next = { ...prev };
      for (const field of sectionFields) {
        next[field.id] = field.defaultValue ?? '';
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const field of sectionFields) {
        delete next[field.id];
      }
      return next;
    });
  };

  const sectionIsDefault = (sectionFields: ParameterField[]) =>
    sectionFields.every((field) => (values[field.id] ?? '') === (field.defaultValue ?? ''));

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!fields) return;

    const found: Record<string, string> = {};
    for (const field of fields) {
      const message = validate(field, values[field.id] ?? '');
      if (message) found[field.id] = message;
    }
    setErrors(found);
    const firstId = Object.keys(found)[0];
    if (firstId) {
      document.getElementById(firstId)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }

    setParameters(values);
    navigate(`/calculate/${objectType}/processes`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    const result = await importFile.mutateAsync(file);
    setValues((prev) => ({ ...prev, ...result.values }));
    const rejected: Record<string, string> = {};
    for (const issue of result.errors ?? []) {
      if (issue.fieldId) rejected[issue.fieldId] = issue.message;
    }
    setErrors(rejected);
  };

  const onTemplate = () => {
    setTemplateError(null);
    downloadFile(`/object-types/${objectType}/parameters/template?format=xlsx`, `pasport-${objectType}.xlsx`).catch(
      (error: unknown) => setTemplateError(error instanceof Error ? error.message : 'Не удалось скачать шаблон'),
    );
  };

  const issues = importFile.data ? [...(importFile.data.errors ?? []), ...(importFile.data.warnings ?? [])] : [];

  const canSubmit =
    Boolean(fields?.length) &&
    (fields ?? []).every((field) => {
      if (field.required === false) return true;
      return !validate(field, values[field.id] ?? '');
    });

  const importControl =
    showTitleImport && titleSlot
      ? createPortal(
          <div className="flex items-center gap-1">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="sr-only"
              aria-label="Файл паспорта объекта"
              tabIndex={-1}
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={onTemplate}
              aria-label="Скачать шаблон Excel"
              title="Скачать шаблон Excel"
              className={iconButtonClass}
            >
              <Download className="size-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={importFile.isPending}
              aria-label={importFile.isPending ? 'Разбираем файл…' : 'Загрузить из Excel / CSV'}
              title={importFile.isPending ? 'Разбираем файл…' : 'Загрузить из Excel / CSV'}
              className={iconButtonClass}
            >
              <Upload className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>,
          titleSlot,
        )
      : null;

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      {importControl}

      <header className="flex-none">
        {importFile.isSuccess ? (
          <div className="mb-2">
            <p className="text-[11px] text-status-operation">
              Загружено значений: {importFile.data.recognized}
              {importFile.data.errors?.length ? ` · с ошибками: ${importFile.data.errors.length}` : ''}
              {importFile.data.skipped?.length ? ` · не распознано: ${importFile.data.skipped.join(', ')}` : ''}
            </p>
            {issues.length > 0 ? (
              <ul role="alert" className="mt-1 grid max-h-24 gap-0.5 overflow-y-auto text-[11.5px] leading-snug">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.row ?? ''}-${issue.fieldId ?? ''}-${index}`}
                    className={index < (importFile.data.errors?.length ?? 0) ? 'text-status-danger' : 'text-status-piloting'}
                  >
                    {issue.row ? `Строка ${issue.row}` : 'Файл'}
                    {issue.label ? ` · ${issue.label}` : ''}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {templateError ? (
          <p role="alert" className="mb-2 flex items-center gap-1 text-[12px] text-[#B91C1C]">
            <AlertCircle className="size-3.5 flex-none" strokeWidth={2} />
            {templateError}
          </p>
        ) : null}

        {importFile.isError ? (
          <p role="alert" className="mb-2 flex items-center gap-1 text-[12px] text-[#B91C1C]">
            <AlertCircle className="size-3.5 flex-none" strokeWidth={2} />
            {importFile.error instanceof Error ? importFile.error.message : 'Файл не распознан'}
          </p>
        ) : null}
      </header>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1.5 [scrollbar-width:thin]">
        {isLoading || !fields ? (
          <div className="grid gap-3.5">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="grid gap-1.5">
                <div className="h-2.5 w-2/5 animate-pulse rounded-full bg-[#EFEFEF]" />
                <div className="h-10 animate-pulse rounded-[10px] bg-[#F2F2F2]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {groupBySection(fields).map(([section, sectionFields]) => {
              const atDefaults = sectionIsDefault(sectionFields);
              return (
              <section key={section}>
                <div className="mb-2 flex items-center gap-1.5">
                  <h2 className="min-w-0 flex-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                    {section}
                  </h2>
                  <button
                    type="button"
                    onClick={() => resetSection(sectionFields)}
                    disabled={atDefaults}
                    aria-label={`Сбросить раздел «${section}» к значениям по умолчанию`}
                    title="Сбросить к значениям по умолчанию"
                    className={cn(
                      'flex size-6 flex-none items-center justify-center rounded-full text-[#8E8E93] transition-colors',
                      'hover:bg-[#F2F2F2] hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-bright/30',
                      'disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8E8E93]',
                    )}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={2} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-3 [&_.grid]:gap-1.5">
                  {sectionFields.map((field) => {
                    const error = errors[field.id];
                    const hint = fieldHint(field);
                    const required = field.required !== false;
                    const describedBy = fieldDescribedBy(field.id, hint, error);

                    return (
                      <FormField
                        key={field.id}
                        id={field.id}
                        label={field.label}
                        hint={hint}
                        error={error}
                        required={required}
                      >
                        {field.kind === 'select' && field.options ? (
                          <Select
                            id={field.id}
                            options={field.options}
                            value={values[field.id] ?? ''}
                            onChange={(event) => setValue(field.id, event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy}
                            aria-required={required}
                            className={fieldControlClass}
                          />
                        ) : field.kind === 'number' ? (
                          <NumberInput
                            id={field.id}
                            value={values[field.id] ?? ''}
                            onValueChange={(next) => setValue(field.id, next)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy}
                            aria-required={required}
                            unit={field.unit}
                            className={cn(fieldControlClass, field.unit && 'pr-14')}
                          />
                        ) : (
                          <Input
                            id={field.id}
                            value={values[field.id] ?? ''}
                            onChange={(event) => setValue(field.id, event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy}
                            aria-required={required}
                            unit={field.unit}
                            className={cn(fieldControlClass, field.unit && 'pr-14')}
                          />
                        )}
                      </FormField>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-none border-t border-accent-tint pt-2.5">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-11 w-full items-center justify-center rounded-[10px] bg-primary-bright text-[14px] font-semibold text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 disabled:bg-[#E5E5EA] disabled:text-[#8E8E93] disabled:opacity-100"
        >
          Далее
        </button>
      </div>
    </form>
  );
}

export default ObjectFormPage;
