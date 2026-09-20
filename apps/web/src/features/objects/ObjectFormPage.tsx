import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, ChevronDown, Upload } from 'lucide-react';
import { SiteHeader } from '@/app/AppShell';
import { useWizardStore } from '@/app/store';
import { useImportParameters, useObjectParameters } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ParameterField } from '@/api/types';

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
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-[1380px] px-[18px] pb-[18px]">
        <div className="overflow-hidden rounded-3xl border border-border bg-background">
          <form onSubmit={onSubmit}>
            <div className="px-6 py-8 sm:px-8">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-heading text-[26px] font-bold tracking-h1">
                  Параметры объекта
                </h1>

                <div className="flex flex-col items-end gap-1">
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
                    <span className="text-[12px] text-status-operation">
                      Распознано полей: {importFile.data.recognized}
                      {importFile.data.skipped?.length
                        ? ` · пропущено: ${importFile.data.skipped.length}`
                        : ''}
                    </span>
                  ) : null}
                  {importFile.isError ? (
                    <span role="alert" className="flex items-center gap-1 text-[12px] text-status-danger">
                      <AlertCircle className="size-3.5" strokeWidth={2} />
                      {importFile.error instanceof Error
                        ? importFile.error.message
                        : 'Файл не распознан'}
                    </span>
                  ) : null}
                </div>
              </div>

              {isLoading || !fields ? (
                <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((key) => (
                    <div key={key} className="grid gap-2">
                      <div className="h-2.5 w-2/5 animate-pulse rounded-full bg-hairline" />
                      <div className="h-10 animate-pulse rounded-md bg-hairline" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  {fields.map((field) => {
                    const error = errors[field.id];

                    return (
                      <div key={field.id} className="grid gap-1.5">
                        <Label htmlFor={field.id}>{field.label}</Label>

                        {field.kind === 'select' && field.options ? (
                          <div className="relative">
                            <select
                              id={field.id}
                              value={values[field.id] ?? ''}
                              onChange={(event) => setValue(field.id, event.target.value)}
                              className="h-10 w-full appearance-none rounded-md border border-input bg-canvas pl-3 pr-8 text-[13px] transition-colors hover:border-foreground/25 focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              {field.options.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-meta-foreground"
                              strokeWidth={2}
                            />
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              id={field.id}
                              inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                              value={values[field.id] ?? ''}
                              onChange={(event) => setValue(field.id, event.target.value)}
                              aria-invalid={Boolean(error)}
                              className={cn(
                                'h-10',
                                field.unit && 'pr-14',
                                error &&
                                  'border-status-danger focus-visible:border-status-danger focus-visible:ring-status-danger',
                              )}
                            />
                            {field.unit ? (
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-meta-foreground">
                                {field.unit}
                              </span>
                            ) : null}
                          </div>
                        )}

                        {error ? (
                          <p className="flex items-center gap-1 text-[12px] text-status-danger">
                            <AlertCircle className="size-3 flex-none" strokeWidth={2.25} />
                            {error}
                          </p>
                        ) : field.hint ? (
                          <p className="text-[12px] leading-snug text-muted-foreground">{field.hint}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-5 sm:px-8">
              <Button type="button" variant="ghost" onClick={() => navigate(`/calculate/${objectType}`)}>
                Назад
              </Button>
              <Button type="submit" size="lg">
                Далее
                <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ObjectFormPage;
