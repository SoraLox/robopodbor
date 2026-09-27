import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { SOURCE_KIND_LABEL, type SourceKind } from '@domain/sources';
import { DashboardLayout } from '@/app/DashboardLayout';
import {
  useChanges,
  useDeleteSource,
  useObjectParameters,
  useObjectTypes,
  useSaveSource,
  useSources,
  useUpdateParameterField,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/shared/components';
import type { ChangeLogEntry, DataSource, DataSourceInput, ParameterField } from '@/api/types';
import { cn } from '@/lib/utils';

type Tab = 'sources' | 'norms' | 'changes';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sources', label: 'Источники данных' },
  { id: 'norms', label: 'Нормативы и значения по умолчанию' },
  { id: 'changes', label: 'Журнал изменений' },
];

const controlClass =
  'h-9 w-full rounded-[10px] border border-[#E5E5EA] bg-[#FAFAFA] px-2.5 text-[13px] outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/10 aria-[invalid=true]:border-status-danger';

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-[12.5px] text-status-danger">
      {error instanceof Error ? error.message : 'Операция не выполнена'}
    </p>
  );
}

// ─── Источники ──────────────────────────────────────────────────────

const EMPTY_SOURCE: DataSourceInput = {
  title: '',
  scope: '',
  kind: 'price',
  url: '',
  actualAt: '',
  confirmed: false,
};

function SourceForm({
  initial,
  onDone,
}: {
  initial: DataSource | null;
  onDone: () => void;
}) {
  const save = useSaveSource();
  const [draft, setDraft] = useState<DataSourceInput>(initial ?? EMPTY_SOURCE);
  const set = <K extends keyof DataSourceInput>(key: K, value: DataSourceInput[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const incomplete = !draft.title.trim() || !draft.scope.trim() || !draft.actualAt.trim();

  return (
    <form
      className="border-t border-hairline bg-[#FAFAFA] px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (incomplete) return;
        save.mutate(
          { ...(initial ? { id: initial.id } : {}), body: { ...draft, url: draft.url?.trim() ?? '' } },
          { onSuccess: onDone },
        );
      }}
    >
      <h3 className="text-[14px] font-semibold">{initial ? 'Изменить источник' : 'Новый источник'}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[12px] font-medium text-muted-foreground">
          Название
          <input className={controlClass} value={draft.title} onChange={(e) => set('title', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-[12px] font-medium text-muted-foreground">
          Что покрывает
          <input className={controlClass} value={draft.scope} onChange={(e) => set('scope', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-[12px] font-medium text-muted-foreground">
          Тип
          <select
            className={controlClass}
            value={draft.kind}
            onChange={(e) => set('kind', e.target.value as SourceKind)}
          >
            {Object.entries(SOURCE_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-medium text-muted-foreground">
          Дата актуализации
          <input
            className={controlClass}
            value={draft.actualAt}
            placeholder="например, 17.09.2026"
            onChange={(e) => set('actualAt', e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-[12px] font-medium text-muted-foreground sm:col-span-2">
          Ссылка (необязательно)
          <input
            className={controlClass}
            type="url"
            value={draft.url ?? ''}
            placeholder="https://"
            onChange={(e) => set('url', e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={draft.confirmed}
            onChange={(e) => set('confirmed', e.target.checked)}
            className="size-4 accent-foreground"
          />
          Данные подтверждены
        </label>
      </div>
      <ErrorText error={save.error} />
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || incomplete}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={save.isPending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function SourcesTab() {
  const { data: sources, isLoading } = useSources();
  const remove = useDeleteSource();
  const [editing, setEditing] = useState<DataSource | 'new' | null>(null);

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
          Каждое значение каталога и нормативов ссылается на источник. Неподтверждённые источники
          помечаются в карточках и отчёте как допущения.
        </p>
        <Button type="button" size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" strokeWidth={2} />
          Добавить источник
        </Button>
      </div>
      {editing === 'new' ? <SourceForm initial={null} onDone={() => setEditing(null)} /> : null}
      {isLoading ? (
        <div className="h-40 animate-pulse bg-hairline" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-hairline bg-[#FAFAFA] text-left text-[11.5px] text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-medium">Источник</th>
                <th scope="col" className="px-3 py-2 font-medium">Тип</th>
                <th scope="col" className="px-3 py-2 font-medium">Актуальность</th>
                <th scope="col" className="px-3 py-2 font-medium">Статус</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sources?.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  editing={editing !== 'new' && editing?.id === source.id}
                  onEdit={() => setEditing(source)}
                  onDone={() => setEditing(null)}
                  onDelete={() => {
                    if (window.confirm(`Удалить источник «${source.title}»?`)) remove.mutate(source.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 pb-3">
        <ErrorText error={remove.error} />
      </div>
    </section>
  );
}

function SourceRow({
  source,
  editing,
  onEdit,
  onDone,
  onDelete,
}: {
  source: DataSource;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="border-b border-hairline align-top last:border-0">
        <td className="px-5 py-3">
          <div className="font-medium">{source.title}</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">{source.scope}</div>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[12px] underline underline-offset-2"
            >
              Открыть <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </td>
        <td className="px-3 py-3 text-muted-foreground">{SOURCE_KIND_LABEL[source.kind]}</td>
        <td className="px-3 py-3 tabular text-muted-foreground">{source.actualAt}</td>
        <td className="px-3 py-3">
          <StatusBadge variant={source.confirmed ? 'confirmed' : 'needs-review'} />
        </td>
        <td className="px-5 py-3">
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              aria-label={`Изменить ${source.title}`}
              onClick={onEdit}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={`Удалить ${source.title}`}
              onClick={onDelete}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-status-danger hover:text-status-danger"
            >
              <Trash2 className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </td>
      </tr>
      {editing ? (
        <tr>
          <td colSpan={5} className="p-0">
            <SourceForm initial={source} onDone={onDone} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ─── Нормативы ──────────────────────────────────────────────────────

type NormDraft = { defaultValue: string; min: string; max: string; source: string; required: boolean };

function draftOf(field: ParameterField): NormDraft {
  return {
    defaultValue: field.defaultValue ?? '',
    min: field.min === undefined ? '' : String(field.min),
    max: field.max === undefined ? '' : String(field.max),
    source: field.source ?? '',
    required: field.required !== false,
  };
}

function toNumber(raw: string): number | null {
  const value = raw.trim().replace(',', '.');
  return value === '' ? null : Number(value);
}

function NormRow({ field }: { field: ParameterField }) {
  const update = useUpdateParameterField();
  const [draft, setDraft] = useState<NormDraft>(() => draftOf(field));
  const initial = draftOf(field);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const numeric = field.kind === 'number';
  const badNumber = numeric && [draft.min, draft.max].some((v) => v.trim() !== '' && Number.isNaN(toNumber(v)));

  const save = () => {
    update.mutate({
      fieldId: field.id,
      patch: {
        defaultValue: draft.defaultValue,
        source: draft.source,
        required: draft.required,
        ...(numeric ? { min: toNumber(draft.min), max: toNumber(draft.max) } : {}),
      },
    });
  };

  return (
    <tr className="border-b border-hairline align-top last:border-0">
      <td className="px-5 py-2.5">
        <div className="font-medium leading-snug">{field.label}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
          {field.section}
          {field.unit ? ` · ${field.unit}` : ''}
        </div>
        <ErrorText error={update.error} />
      </td>
      <td className="px-2 py-2.5">
        {field.kind === 'select' && field.options ? (
          <select
            aria-label={`По умолчанию: ${field.label}`}
            className={controlClass}
            value={draft.defaultValue}
            onChange={(e) => setDraft({ ...draft, defaultValue: e.target.value })}
          >
            <option value="">—</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={`По умолчанию: ${field.label}`}
            className={controlClass}
            value={draft.defaultValue}
            onChange={(e) => setDraft({ ...draft, defaultValue: e.target.value })}
          />
        )}
      </td>
      <td className="px-2 py-2.5">
        <input
          aria-label={`Минимум: ${field.label}`}
          className={controlClass}
          value={draft.min}
          disabled={!numeric}
          inputMode="decimal"
          aria-invalid={numeric && draft.min.trim() !== '' && Number.isNaN(toNumber(draft.min))}
          onChange={(e) => setDraft({ ...draft, min: e.target.value })}
        />
      </td>
      <td className="px-2 py-2.5">
        <input
          aria-label={`Максимум: ${field.label}`}
          className={controlClass}
          value={draft.max}
          disabled={!numeric}
          inputMode="decimal"
          aria-invalid={numeric && draft.max.trim() !== '' && Number.isNaN(toNumber(draft.max))}
          onChange={(e) => setDraft({ ...draft, max: e.target.value })}
        />
      </td>
      <td className="px-2 py-2.5">
        <input
          aria-label={`Источник норматива: ${field.label}`}
          className={controlClass}
          value={draft.source}
          placeholder="откуда значение"
          onChange={(e) => setDraft({ ...draft, source: e.target.value })}
        />
      </td>
      <td className="px-2 py-2.5 text-center">
        <input
          type="checkbox"
          aria-label={`Обязательное: ${field.label}`}
          checked={draft.required}
          onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
          className="mt-2.5 size-4 accent-foreground"
        />
      </td>
      <td className="px-5 py-2.5 text-right">
        <Button
          type="button"
          size="sm"
          variant={dirty ? 'default' : 'outline'}
          disabled={!dirty || badNumber || update.isPending}
          onClick={save}
        >
          {update.isPending ? '…' : 'Сохранить'}
        </Button>
      </td>
    </tr>
  );
}

function NormsTab() {
  const { data: objectTypes } = useObjectTypes();
  const [slug, setSlug] = useState('warehouse');
  const { data: fields, isLoading } = useObjectParameters(slug);

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          Значения по умолчанию подставляются в паспорт объекта и шаблон Excel; границы проверяются
          при вводе и загрузке файла. Каждое изменение попадает в журнал и меняет версию данных расчёта.
        </p>
        <label className="flex items-center gap-2 text-[13px]">
          Тип объекта
          <select className={cn(controlClass, 'w-auto')} value={slug} onChange={(e) => setSlug(e.target.value)}>
            {(objectTypes ?? []).map((type) => (
              <option key={type.slug} value={type.slug}>
                {type.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isLoading || !fields ? (
        <div className="h-40 animate-pulse bg-hairline" />
      ) : (
        <div className="max-h-[calc(100vh-280px)] min-h-[320px] overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-y border-hairline bg-[#FAFAFA] text-left text-[11.5px] text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-medium">Параметр</th>
                <th scope="col" className="w-[150px] px-2 py-2 font-medium">По умолчанию</th>
                <th scope="col" className="w-[92px] px-2 py-2 font-medium">Мин.</th>
                <th scope="col" className="w-[92px] px-2 py-2 font-medium">Макс.</th>
                <th scope="col" className="w-[220px] px-2 py-2 font-medium">Источник норматива</th>
                <th scope="col" className="w-[64px] px-2 py-2 text-center font-medium">Обяз.</th>
                <th scope="col" className="w-[120px] px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <NormRow key={`${slug}-${field.id}-${JSON.stringify(draftOf(field))}`} field={field} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Журнал ─────────────────────────────────────────────────────────

const ENTITY_LABEL: Record<ChangeLogEntry['entity'], string> = {
  solution: 'Каталог',
  source: 'Источники',
  parameter: 'Нормативы',
  'catalog-import': 'Импорт каталога',
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ChangesTab() {
  const [entity, setEntity] = useState<ChangeLogEntry['entity'] | ''>('');
  const { data: changes, isLoading, error } = useChanges(entity || undefined);

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-[13px] text-muted-foreground">Кто, когда и что изменил в справочниках.</p>
        <label className="flex items-center gap-2 text-[13px]">
          Раздел
          <select
            className={cn(controlClass, 'w-auto')}
            value={entity}
            onChange={(e) => setEntity(e.target.value as ChangeLogEntry['entity'] | '')}
          >
            <option value="">Все</option>
            {Object.entries(ENTITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="px-5">
        <ErrorText error={error} />
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse bg-hairline" />
      ) : !changes?.length ? (
        <p className="border-t border-hairline px-5 py-10 text-center text-[13px] text-muted-foreground">
          Изменений пока нет.
        </p>
      ) : (
        <ul className="border-t border-hairline">
          {changes.map((change) => {
            const diff = Object.entries(change.diff ?? {});
            return (
              <li key={change.id} className="border-b border-hairline px-5 py-3 last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="tabular text-[12px] text-muted-foreground">
                    {dateTime.format(new Date(change.createdAt))}
                  </span>
                  <span className="rounded-md bg-[#F2F2F2] px-1.5 py-0.5 text-[11px] font-medium">
                    {ENTITY_LABEL[change.entity]}
                  </span>
                  <span className="text-[13.5px] font-medium">{change.summary}</span>
                  <span className="text-[12px] text-muted-foreground">{change.userEmail ?? 'система'}</span>
                </div>
                {diff.length > 0 ? (
                  <details className="mt-1.5 text-[12px]">
                    <summary className="cursor-pointer text-muted-foreground">
                      Изменено полей: {diff.length}
                    </summary>
                    <dl className="mt-1.5 grid gap-1">
                      {diff.map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
                          <dt className="font-mono text-muted-foreground">{key}</dt>
                          <dd className="min-w-0 break-words">
                            <span className="text-status-danger line-through">{formatValue(value.from)}</span>
                            {' → '}
                            <span className="text-status-operation">{formatValue(value.to)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('sources');

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Справочники</h1>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/catalog">
            Каталог решений
            <ArrowUpRight className="size-3.5" strokeWidth={2} />
          </Link>
        </Button>
      </div>

      <div role="tablist" aria-label="Разделы справочников" className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`admin-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`admin-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              tab === item.id
                ? 'border-foreground bg-foreground text-white'
                : 'border-[#E5E5EA] bg-white text-foreground hover:border-[#C7C7CC]',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
        {tab === 'sources' ? <SourcesTab /> : tab === 'norms' ? <NormsTab /> : <ChangesTab />}
      </div>
    </DashboardLayout>
  );
}

export default AdminPage;
