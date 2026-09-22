import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Upload } from 'lucide-react';
import { useWizardStore } from '@/app/store';
import { useImportParameters, useObjectParameters } from '@/api/queries';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField, fieldDescribedBy } from '@/components/ui/form-field';
import type { ParameterField } from '@/api/types';
import { cn } from '@/lib/utils';

/** Проверка значения по описанию поля из контракта. */
function validate(field: ParameterField, raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Заполните поле';
  if (field.kind === 'number') {
    const num = Number(value.replace(/\s/g, '').replace(',', '.'));
    if (Number.isNaN(num)) return 'Нужно число';
    if (field.min !== undefined && num < field.min) return `Минимум ${field.min}`;
    if (field.max !== undefined && num > field.max) return `Максимум ${field.max}`;
  }
  return null;
}

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
  'h-10 rounded-[10px] border-[#E5E5EA] bg-[#FAFAFA] text-[13px] hover:border-[#C7C7CC] focus-visible:border-[#1C1C1E] focus-visible:ring-2 focus-visible:ring-[#1C1C1E]/10';

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
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

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
    const result = await importFile.mutateAsync(file);
    setValues((prev) => ({ ...prev, ...result.values }));
  };

  const importControl =
    showTitleImport && titleSlot
      ? createPortal(
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={importFile.isPending}
              aria-label={importFile.isPending ? 'Разбираем файл…' : 'Загрузить из Excel / CSV'}
              title={importFile.isPending ? 'Разбираем файл…' : 'Загрузить из Excel / CSV'}
              className={cn(
                'flex size-9 flex-none items-center justify-center rounded-full border border-[#E5E5EA] bg-[#FAFAFA] text-[#1C1C1E]',
                'transition-colors hover:border-[#C7C7CC] hover:bg-[#F2F2F2]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1C1E]/20',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <Upload className="size-4" strokeWidth={1.8} />
            </button>
          </>,
          titleSlot,
        )
      : null;

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      {importControl}

      <header className="flex-none">
        {importFile.isSuccess ? (
          <p className="mb-2 text-[11px] text-[#15803D]">
            Распознано: {importFile.data.recognized}
            {importFile.data.skipped?.length ? ` · −${importFile.data.skipped.length}` : ''}
          </p>
        ) : null}

        {importFile.isError ? (
          <p role="alert" className="mb-2 flex items-center gap-1 text-[12px] text-[#B91C1C]">
            <AlertCircle className="size-3.5 flex-none" strokeWidth={2} />
            {importFile.error instanceof Error ? importFile.error.message : 'Файл не распознан'}
          </p>
        ) : null}
      </header>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2.5 [scrollbar-width:thin]">
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
            {groupBySection(fields).map(([section, sectionFields]) => (
              <section key={section}>
                <h2 className="mb-2 text-[13px] font-semibold tracking-[-0.01em] text-[#1C1C1E]">
                  {section}
                </h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 [&_.grid]:gap-1.5">
                  {sectionFields.map((field) => {
                    const error = errors[field.id];
                    const describedBy = fieldDescribedBy(field.id, field.hint, error);

                    return (
                      <FormField
                        key={field.id}
                        id={field.id}
                        label={field.label}
                        hint={field.hint}
                        error={error}
                        required={false}
                      >
                        {field.kind === 'select' && field.options ? (
                          <Select
                            id={field.id}
                            options={field.options}
                            value={values[field.id] ?? ''}
                            onChange={(event) => setValue(field.id, event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy}
                            aria-required="true"
                            className={fieldControlClass}
                          />
                        ) : (
                          <Input
                            id={field.id}
                            inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                            value={values[field.id] ?? ''}
                            onChange={(event) => setValue(field.id, event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy}
                            aria-required="true"
                            unit={field.unit}
                            className={cn(fieldControlClass, field.unit && 'pr-14')}
                          />
                        )}
                      </FormField>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="flex-none border-t border-[#EBEBEB] pt-3">
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center rounded-[10px] bg-[#1C1C1E] text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Далее
        </button>
      </div>
    </form>
  );
}

export default ObjectFormPage;
