import { useState } from 'react';
import {
  ACQUISITION_LABEL,
  AVAILABILITY_LABEL,
  CATALOG_CATEGORY_LABEL,
  OBJECT_FIT_LABEL,
  OBJECT_LABEL,
  OBJECT_PROCESSES,
  SOLUTION_TYPES,
  completenessOf,
  missingFields,
} from '@domain/catalog';
import { useCreateSolution, useUpdateSolution } from '@/api/queries';
import { Button } from '@/components/ui/button';
import type { Solution } from '@/api/types';
import { cn } from '@/lib/utils';

type Kind = 'text' | 'number' | 'select' | 'bool' | 'list' | 'multi' | 'fit';

interface FieldDef {
  path: string;
  label: string;
  kind: Kind;
  required?: boolean;
  options?: Record<string, string>;
  hint?: string;
  wide?: boolean;
}

const MATURITY_OPTIONS = { operation: 'В эксплуатации', piloting: 'Пилот', rnd: 'НИОКР' };
const CONFIDENCE_OPTIONS = { confirmed: 'Подтверждены', 'needs-review': 'Требуют проверки' };
const ENVIRONMENT_OPTIONS = { indoor: 'В помещении', outdoor: 'На улице', both: 'В помещении и на улице' };
const CATEGORY_OPTIONS = Object.fromEntries(
  Object.entries(CATALOG_CATEGORY_LABEL).map(([code, label]) => [code, `${code} · ${label}`]),
);

/** Поля карточки по группам таблицы 3.3 ТЗ. */
const GROUPS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: 'Идентификация',
    fields: [
      { path: 'name', label: 'Наименование', kind: 'text', required: true },
      { path: 'vendor', label: 'Производитель', kind: 'text', required: true },
      { path: 'solutionType', label: 'Тип решения', kind: 'select', options: SOLUTION_TYPES },
      { path: 'useCase', label: 'Назначение', kind: 'text', required: true },
      { path: 'country', label: 'Страна происхождения', kind: 'text' },
      { path: 'availability', label: 'Статус доступности', kind: 'select', options: AVAILABILITY_LABEL },
      { path: 'maturity', label: 'Зрелость', kind: 'select', options: MATURITY_OPTIONS, required: true },
      { path: 'catalogCategory', label: 'Категория каталога', kind: 'select', options: CATEGORY_OPTIONS },
      { path: 'trl', label: 'УГТ', kind: 'number', hint: 'от 1 до 9' },
      { path: 'objectFit', label: 'Типы объектов и основание', kind: 'fit', wide: true },
      { path: 'processes', label: 'Процессы', kind: 'multi', wide: true },
    ],
  },
  {
    title: 'Технические характеристики',
    fields: [
      { path: 'payload', label: 'Грузоподъёмность (как в источнике)', kind: 'text', required: true },
      { path: 'payloadKg', label: 'Грузоподъёмность, кг', kind: 'number' },
      { path: 'weightKg', label: 'Масса, кг', kind: 'number' },
      { path: 'dimensions', label: 'Габариты', kind: 'text', hint: 'Д×Ш×В, мм' },
      { path: 'speed', label: 'Скорость', kind: 'text', required: true },
      { path: 'throughput', label: 'Производительность', kind: 'number' },
      { path: 'throughputUnit', label: 'Ед. производительности', kind: 'text', hint: 'например, поддонов/ч' },
      { path: 'autonomyHours', label: 'Автономность, ч', kind: 'number' },
      { path: 'positioningAccuracyMm', label: 'Точность позиционирования, мм', kind: 'number' },
      { path: 'navigation', label: 'Тип навигации', kind: 'text' },
      { path: 'operatingConditions', label: 'Условия эксплуатации', kind: 'text', wide: true },
      { path: 'environment', label: 'Среда', kind: 'select', options: ENVIRONMENT_OPTIONS },
      { path: 'minTempC', label: 'Мин. температура, °C', kind: 'number' },
      { path: 'maxTempC', label: 'Макс. температура, °C', kind: 'number' },
      { path: 'noiseDb', label: 'Шум, дБА', kind: 'number' },
    ],
  },
  {
    title: 'Инфраструктура',
    fields: [
      { path: 'minAisleWidthM', label: 'Мин. ширина прохода, м', kind: 'number' },
      { path: 'maxFloorDeviationMm', label: 'Допуск ровности пола, мм/2м', kind: 'number' },
      { path: 'minCeilingHeightM', label: 'Мин. высота помещения, м', kind: 'number' },
      { path: 'elevatorIntegration', label: 'Интеграция с лифтами', kind: 'bool' },
      { path: 'airsideCertified', label: 'Допуск на перрон', kind: 'bool' },
      { path: 'infrastructure.floor', label: 'Покрытие и проходы', kind: 'text' },
      { path: 'infrastructure.charging', label: 'Зарядные станции', kind: 'text' },
      { path: 'infrastructure.connectivity', label: 'Связь', kind: 'text' },
      { path: 'infrastructure.integration', label: 'Интеграция (WMS/ERP/МИС)', kind: 'text' },
      { path: 'infrastructure.service', label: 'Сервисное обслуживание', kind: 'text' },
    ],
  },
  {
    title: 'Экономика',
    fields: [
      { path: 'price', label: 'Цена единицы, млн ₽', kind: 'text', required: true },
      { path: 'costs.equipment', label: 'Оборудование, млн ₽', kind: 'number' },
      { path: 'costs.software', label: 'ПО, млн ₽', kind: 'number' },
      { path: 'costs.implementation', label: 'Внедрение, млн ₽', kind: 'number' },
      { path: 'costs.maintenancePerYear', label: 'Обслуживание в год, млн ₽', kind: 'number' },
      { path: 'lifespanYears', label: 'Срок службы, лет', kind: 'number' },
      { path: 'acquisitionModels', label: 'Модель приобретения', kind: 'multi', options: ACQUISITION_LABEL, wide: true },
    ],
  },
  {
    title: 'Применимость и качество данных',
    fields: [
      { path: 'limitations', label: 'Ограничения', kind: 'list', hint: 'по одному в строке', wide: true },
      { path: 'cases', label: 'Реализованные кейсы', kind: 'list', hint: 'по одному в строке', wide: true },
      {
        path: 'photos',
        label: 'Фото',
        kind: 'list',
        hint: 'имена файлов из /robots_photo по одному в строке, первое — главное',
        wide: true,
      },
      { path: 'source', label: 'Источник', kind: 'text', wide: true },
      { path: 'sourceDate', label: 'Дата актуализации', kind: 'text' },
      { path: 'sourceUrl', label: 'Ссылка на источник', kind: 'text' },
      { path: 'confidence', label: 'Подтверждённость', kind: 'select', options: CONFIDENCE_OPTIONS, required: true },
      {
        path: 'unconfirmedFields',
        label: 'Допущения',
        kind: 'list',
        hint: 'названия полей, взятых не из подтверждённого источника — по одному в строке',
        wide: true,
      },
    ],
  },
];

type Draft = Record<string, unknown>;

/**
 * Считаются сервером — в форму и обратно в API не передаются. fieldSources сервер
 * ведёт сам: правленые поля получают источник «правка администратора».
 */
const COMPUTED_KEYS = ['completeness', 'score', 'scoreFactors', 'fieldSources'];

function read(draft: Draft, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Draft | undefined)?.[key], draft);
}

/** Пустое значение удаляет ключ, чтобы в каталоге не копились пустые строки. */
function write(draft: Draft, path: string, value: unknown): Draft {
  const [head, ...rest] = path.split('.') as [string, ...string[]];
  const next = { ...draft };
  if (rest.length > 0) {
    const child = write((draft[head] as Draft | undefined) ?? {}, rest.join('.'), value);
    if (Object.keys(child).length > 0) next[head] = child;
    else delete next[head];
    return next;
  }
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) delete next[head];
  else next[head] = value;
  return next;
}

const controlClass =
  'h-9 w-full rounded-[10px] border border-[#E5E5EA] bg-white px-2.5 text-[13px] outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/10 aria-[invalid=true]:border-status-danger';

function Control({
  field,
  draft,
  onChange,
  invalid,
}: {
  field: FieldDef;
  draft: Draft;
  onChange: (value: unknown) => void;
  invalid: boolean;
}) {
  const id = `sol-${field.path}`;
  const value = read(draft, field.path);

  if (field.kind === 'fit') {
    const fit = (value as Record<string, string> | undefined) ?? {};
    return (
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">{field.label}</legend>
        {Object.entries(OBJECT_LABEL).map(([type, label]) => (
          <label key={type} className="grid gap-1 text-[12px] text-muted-foreground">
            {label}
            <select
              id={`${id}-${type}`}
              className={controlClass}
              value={fit[type] ?? ''}
              onChange={(event) => {
                const next = { ...fit };
                if (event.target.value) next[type] = event.target.value;
                else delete next[type];
                onChange(Object.keys(next).length ? next : undefined);
              }}
            >
              <option value="">не подходит</option>
              {Object.entries(OBJECT_FIT_LABEL).map(([basis, basisLabel]) => (
                <option key={basis} value={basis}>
                  {basisLabel}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.kind === 'multi') {
    const selected = new Set((value as string[] | undefined) ?? []);
    const objectTypes = Object.keys((read(draft, 'objectFit') as Record<string, string> | undefined) ?? {});
    const options =
      field.path === 'processes'
        ? Object.fromEntries(
            (objectTypes.length ? objectTypes : Object.keys(OBJECT_PROCESSES)).flatMap((type) =>
              (OBJECT_PROCESSES[type] ?? []).map((p) => [p.id, `${p.label} · ${OBJECT_LABEL[type] ?? type}`]),
            ),
          )
        : field.options ?? {};
    return (
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5">
        <legend className="sr-only">{field.label}</legend>
        {Object.entries(options).map(([option, label]) => (
          <label key={option} className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={selected.has(option)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(option);
                else next.delete(option);
                onChange([...next]);
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.kind === 'list') {
    return (
      <textarea
        id={id}
        rows={3}
        className={cn(controlClass, 'h-auto py-2 leading-snug')}
        value={((value as string[] | undefined) ?? []).join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    );
  }

  if (field.kind === 'select' || field.kind === 'bool') {
    const options = field.kind === 'bool' ? { true: 'Да', false: 'Нет' } : field.options ?? {};
    return (
      <select
        id={id}
        className={controlClass}
        aria-invalid={invalid}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(field.kind === 'bool' ? (raw === '' ? undefined : raw === 'true') : raw);
        }}
      >
        {field.required ? null : <option value="">не указано</option>}
        {Object.entries(options).map(([option, label]) => (
          <option key={option} value={option}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      className={controlClass}
      aria-invalid={invalid}
      inputMode={field.kind === 'number' ? 'decimal' : undefined}
      placeholder={field.hint}
      value={value === undefined ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Строковые значения числовых полей → числа; ошибки — по полям. */
function normalize(draft: Draft): { solution: Solution; errors: Record<string, string> } {
  let next = draft;
  const errors: Record<string, string> = {};
  for (const field of GROUPS.flatMap((group) => group.fields)) {
    const value = read(draft, field.path);
    if (field.required && (value === undefined || String(value).trim() === '')) {
      errors[field.path] = 'Обязательное поле';
    }
    if (field.kind === 'list' && Array.isArray(value)) {
      next = write(next, field.path, (value as string[]).map((line) => line.trim()).filter(Boolean));
    }
    if (field.kind === 'number' && typeof value === 'string') {
      const num = Number(value.replace(/\s/g, '').replace(',', '.'));
      if (value.trim() === '') next = write(next, field.path, undefined);
      else if (Number.isFinite(num)) next = write(next, field.path, num);
      else errors[field.path] = 'Нужно число';
    }
  }
  const trl = read(next, 'trl');
  if (typeof trl === 'number' && !(Number.isInteger(trl) && trl >= 1 && trl <= 9)) errors.trl = 'Целое число от 1 до 9';
  // Список объектов — ключи оснований: одно знание, хранится в двух полях.
  // Пустой список передаём явно: «ни одного объекта» — тоже правка, а не её отсутствие.
  const fit = (read(next, 'objectFit') as Record<string, string> | undefined) ?? {};
  next = { ...next, objectTypes: Object.keys(fit), objectFit: fit };
  if (!String(next.id ?? '').trim()) next = write(next, 'id', undefined);
  return { solution: next as unknown as Solution, errors };
}


export function SolutionEditor({
  initial,
  isNew,
  onDone,
}: {
  initial: Solution;
  isNew: boolean;
  onDone: () => void;
}) {
  const create = useCreateSolution();
  const update = useUpdateSolution();
  const mutation = isNew ? create : update;
  const [draft, setDraft] = useState<Draft>(() => {
    const rest: Draft = { ...initial };
    for (const computed of COMPUTED_KEYS) delete rest[computed];
    // Решения, заведённые до оснований применимости, — «заявлено» по списку объектов.
    if (!rest.objectFit && initial.objectTypes?.length) {
      rest.objectFit = Object.fromEntries(initial.objectTypes.map((type) => [type, 'declared']));
    }
    return rest;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const preview = normalize(draft).solution;
  const completeness = completenessOf(preview);
  const missing = missingFields(preview);

  const submit = () => {
    const { solution, errors: found } = normalize(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`sol-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    mutation.mutate(solution, { onSuccess: onDone });
  };

  return (
    <form
      className="panel overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-label={isNew ? 'Новая позиция каталога' : `Редактирование: ${initial.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">
            {isNew ? 'Новая позиция' : `Редактирование · ${initial.name}`}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Полнота карточки: <strong className="font-semibold text-foreground">{completeness}%</strong>
            {missing.length ? ` · не заполнено: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` и ещё ${missing.length - 6}` : ''}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={mutation.isPending}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </div>

      {mutation.isError ? (
        <p role="alert" className="border-b border-hairline bg-status-danger-tint px-5 py-2.5 text-[12.5px] text-status-danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Не удалось сохранить'}
        </p>
      ) : null}

      <div className="grid gap-5 px-5 py-4">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {group.title}
            </h3>
            <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.fields.map((field) => (
                <div key={field.path} className={cn('grid content-start gap-1', field.wide && 'sm:col-span-2 xl:col-span-3')}>
                  <label htmlFor={`sol-${field.path}`} className="text-[12px] font-medium text-muted-foreground">
                    {field.label}
                    {field.required ? <span className="ml-0.5 text-status-danger">*</span> : null}
                    {field.kind === 'list' && field.hint ? (
                      <span className="font-normal"> — {field.hint}</span>
                    ) : null}
                  </label>
                  <Control
                    field={field}
                    draft={draft}
                    invalid={Boolean(errors[field.path])}
                    onChange={(value) => {
                      setDraft((prev) => write(prev, field.path, value));
                      if (errors[field.path]) {
                        setErrors(({ [field.path]: _removed, ...rest }) => rest);
                      }
                    }}
                  />
                  {errors[field.path] ? (
                    <span role="alert" className="text-[11.5px] text-status-danger">
                      {errors[field.path]}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </form>
  );
}
