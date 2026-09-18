import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Upload } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useWizardStore } from '@/app/store';
import { useImportParameters, useObjectParameters } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeading, Stepper } from '@/shared/components';
import type { ParameterField } from '@/api/types';
import { WIZARD_STEPS } from './wizardSteps';

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

export function ObjectFormPage() {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const { parameters, setParameters } = useWizardStore();

  const { data: fields, isLoading } = useObjectParameters(objectType);
  const importFile = useImportParameters(objectType);
  const fileInput = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<Record<string, string>>(parameters);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Состав полей зависит от типа объекта: подставляем значения по умолчанию
  // для тех, что пользователь ещё не заполнял.
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

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!fields) return;

    const found: Record<string, string> = {};
    for (const field of fields) {
      const message = validate(field, values[field.id] ?? '');
      if (message) found[field.id] = message;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setParameters(values);
    navigate(`/calculate/${objectType}/processes`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const result = await importFile.mutateAsync(file);
    setValues((prev) => ({ ...prev, ...result.values }));
  };

  return (
    <AppShell>
      <Stepper
        steps={WIZARD_STEPS}
        current={1}
        onStepClick={() => navigate(`/calculate/${objectType}`)}
      />

      <form onSubmit={onSubmit}>
        <div className="px-5 py-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading size="h1">Параметры объекта</SectionHeading>

            <div className="flex flex-col items-end gap-1.5">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="sr-only"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={importFile.isPending}
              >
                <Upload className="size-3.5" strokeWidth={1.8} />
                {importFile.isPending ? 'Разбираем файл…' : 'Загрузить из Excel / CSV'}
              </Button>
              {importFile.isSuccess ? (
                <span className="text-[11px] text-status-operation">
                  Распознано полей: {importFile.data.recognized}
                  {importFile.data.skipped?.length
                    ? ` · пропущено: ${importFile.data.skipped.length}`
                    : ''}
                </span>
              ) : null}
              {importFile.isError ? (
                <span role="alert" className="text-[11px] text-status-danger">
                  {importFile.error instanceof Error
                    ? importFile.error.message
                    : 'Файл не распознан'}
                </span>
              ) : null}
            </div>
          </div>

          {isLoading || !fields ? (
            <div className="grid max-w-[760px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <div key={key} className="h-16 animate-pulse rounded-lg bg-hairline" />
              ))}
            </div>
          ) : (
            <div className="grid max-w-[760px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((field) => (
                <div key={field.id} className="grid gap-1.5">
                  <Label htmlFor={field.id}>
                    {field.label}
                    {field.unit ? (
                      <span className="ml-1.5 normal-case text-meta-foreground">
                        {field.unit}
                      </span>
                    ) : null}
                  </Label>

                  {field.kind === 'select' && field.options ? (
                    <select
                      id={field.id}
                      value={values[field.id] ?? ''}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                      }
                      className="h-[38px] rounded-md border border-input bg-background px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={field.id}
                      inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                      value={values[field.id] ?? ''}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                      }
                    />
                  )}

                  {errors[field.id] ? (
                    <p className="text-[11px] text-status-danger">{errors[field.id]}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-stretch border-t border-border">
          <div className="flex items-center px-5 py-4 meta-label">
            ПОЛЕЙ: {fields?.length ?? 0} · ЧЕРНОВИК СОХРАНЯЕТСЯ АВТОМАТИЧЕСКИ
          </div>
          <div className="ml-auto flex items-stretch">
            <Button
              type="button"
              variant="ghost"
              className="border-l border-border px-5 py-4"
              onClick={() => navigate(`/calculate/${objectType}`)}
            >
              Назад
            </Button>
            <Button type="submit" size="lg">
              Далее: процессы
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}

export default ObjectFormPage;
