import { useRef, useState, type ReactNode } from 'react';
import { FolderUp } from 'lucide-react';
import { OBJECT_FIT_LABEL, OBJECT_LABEL, REQUIRED_FIELDS } from '@domain/catalog';
import { useRobotCatalogImport } from '@/api/queries';
import type { RobotCatalogImportReport, Solution } from '@/api/types';
import { Button } from '@/components/ui/button';

const FIELD_LABEL: Record<string, string> = {
  ...Object.fromEntries(REQUIRED_FIELDS.map((field) => [field.key.split('.')[0]!, field.label.toLowerCase()])),
  infrastructure: 'инфраструктура',
  costs: 'стоимость',
  objectFit: 'основание применимости',
  objectTypes: 'типы объектов',
  catalogCategory: 'категория каталога',
  trl: 'УГТ',
  photos: 'фото',
  maturity: 'зрелость',
  price: 'цена',
  payload: 'грузоподъёмность',
  minAisleWidthM: 'ширина прохода',
  minTempC: 'температура',
  maxTempC: 'температура',
  environment: 'среда',
  unconfirmedFields: 'допущения',
  'новое решение': 'новое решение',
};

const fieldsText = (fields: string[]) => [...new Set(fields.map((key) => FIELD_LABEL[key] ?? key))].join(', ');

/** «25.09.2026» — сравниваем как «2026-09-25». */
const isoOf = (date: string | undefined) => (date ?? '').split('.').reverse().join('-');

/** Дата версии каталога, которая сейчас в базе: самая свежая дата у решений из каталога. */
function currentVersion(solutions: Solution[]) {
  const fromCatalog = solutions.filter((solution) => solution.catalogCategory);
  const latest = fromCatalog.map((solution) => solution.sourceDate).sort((a, b) => isoOf(b).localeCompare(isoOf(a)))[0];
  return { count: fromCatalog.length, date: latest };
}

/** Из папки нужны только JSON каталога: схемы, README и служебные файлы не отправляем. */
function catalogFiles(list: FileList | null): File[] {
  return [...(list ?? [])].filter((file) => {
    const path = file.webkitRelativePath || file.name;
    return path.endsWith('.json') && !path.split('/').includes('schema');
  });
}

function Details({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <details className="group border-t border-hairline py-2">
      <summary className="cursor-pointer text-[12.5px] font-medium text-foreground marker:text-muted-foreground">
        {title} · {count}
      </summary>
      <div className="mt-1.5 max-h-48 overflow-y-auto text-[12px] leading-snug text-muted-foreground">{children}</div>
    </details>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="text-[18px] font-semibold tabular-nums leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
        {label}
        {hint ? <span className="block">{hint}</span> : null}
      </div>
    </div>
  );
}

export function RobotCatalogReport({ report }: { report: RobotCatalogImportReport }) {
  return (
    <div className="mt-3">
      <p className="text-[12.5px] text-muted-foreground">
        Каталог v{report.version.schema} от {report.version.updated} · {report.total} решений с дополнениями организатора
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={report.applied ? 'добавлено' : 'добавится'} value={report.added.length} />
        <Stat label={report.applied ? 'обновлено' : 'изменится'} value={report.updated.length} />
        <Stat label="без изменений" value={report.unchanged} />
        <Stat label="нет в новой версии" hint="не удаляются" value={report.missing.length} />
        <Stat label="с правками администратора" hint="правки сохраняются" value={report.keptAdmin.length} />
      </div>

      <table className="mt-3 w-full text-left text-[12px]">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Объект</th>
            {Object.values(OBJECT_FIT_LABEL).map((label) => (
              <th key={label} className="py-1 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {Object.entries(report.fit).map(([objectType, fit]) => (
            <tr key={objectType} className="border-t border-hairline">
              <td className="py-1">{OBJECT_LABEL[objectType] ?? objectType}</td>
              <td className="py-1">{fit.declared}</td>
              <td className="py-1">{fit.example}</td>
              <td className="py-1">{fit.inferred}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3">
        <Details title={report.applied ? 'Добавлены' : 'Добавятся'} count={report.added.length}>
          <ul>
            {report.added.map((item) => (
              <li key={item.id}>
                {item.id} · {item.name}
              </li>
            ))}
          </ul>
        </Details>
        <Details title={report.applied ? 'Обновлены' : 'Изменятся'} count={report.updated.length}>
          <ul className="grid grid-cols-1 gap-0.5">
            {report.updated.map((item) => (
              <li key={item.id}>
                <span className="text-foreground">
                  {item.id} · {item.name}
                </span>
                : {fieldsText(item.fields)}
              </li>
            ))}
          </ul>
        </Details>
        <Details title="Нет в новой версии — остаются в каталоге" count={report.missing.length}>
          <p className="mb-1">На них могут ссылаться проекты. Если решение больше не нужно, удалите его вручную.</p>
          <ul>
            {report.missing.map((item) => (
              <li key={item.id}>
                {item.id} · {item.name}
              </li>
            ))}
          </ul>
        </Details>
        <Details title="Правки администратора сохраняются" count={report.keptAdmin.length}>
          <ul>
            {report.keptAdmin.map((item) => (
              <li key={item.id}>
                {item.id} · {item.name}: {fieldsText(item.fields)}
              </li>
            ))}
          </ul>
        </Details>
        <Details title="Дополнено из материалов организатора" count={report.filled.length}>
          <ul>
            {report.filled.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Details>
        <Details title="Расхождения с организатором — передать ответственному за каталог" count={report.conflicts.length}>
          <ul>
            {report.conflicts.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Details>
      </div>
    </div>
  );
}

/**
 * Новая версия каталога роботов из админки (ТЗ 3.3.2, 3.3.6): выбрать папку
 * каталога → посмотреть, что изменится → применить.
 */
export function RobotCatalogImport({ solutions }: { solutions: Solution[] }) {
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const upload = useRobotCatalogImport();
  const current = currentVersion(solutions);
  const report = upload.data;

  const onFolder = (list: FileList | null) => {
    const selected = catalogFiles(list);
    if (folderInput.current) folderInput.current.value = '';
    if (!selected.length) return;
    setFiles(selected);
    upload.mutate({ files: selected, dryRun: true });
  };

  const cancel = () => {
    setFiles(null);
    upload.reset();
  };

  return (
    <section className="panel mb-4 px-5 py-4" aria-labelledby="robot-catalog-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="robot-catalog-title" className="text-[14px] font-semibold">
            Каталог роботов
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Сейчас: {current.count} роботов из каталога{current.date ? `, версия от ${current.date}` : ''}. Новую версию
            присылает ответственный за каталог папкой с index.json и data/.
          </p>
        </div>
        <input
          ref={folderInput}
          type="file"
          multiple
          className="sr-only"
          aria-label="Папка каталога роботов"
          tabIndex={-1}
          onChange={(event) => onFolder(event.target.files)}
          {...{ webkitdirectory: '', directory: '' }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-none"
          onClick={() => folderInput.current?.click()}
          disabled={upload.isPending}
        >
          <FolderUp className="size-3.5" strokeWidth={2} />
          {upload.isPending ? 'Проверяем…' : 'Загрузить новую версию'}
        </Button>
      </div>

      {upload.isError ? (
        <p role="alert" className="mt-3 text-[12.5px] text-status-danger">
          {upload.error instanceof Error ? upload.error.message : 'Не удалось загрузить каталог'}
        </p>
      ) : null}

      {report ? (
        <div role="status">
          {report.applied ? (
            <p className="mt-3 text-[13px] font-medium">
              Версия применена: добавлено {report.added.length}, обновлено {report.updated.length}. Изменение записано в журнал.
            </p>
          ) : null}
          <RobotCatalogReport report={report} />
          <div className="mt-3 flex gap-2">
            {report.applied ? (
              <Button type="button" size="sm" variant="outline" onClick={cancel}>
                Готово
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={!files || upload.isPending || (!report.added.length && !report.updated.length)}
                  onClick={() => files && upload.mutate({ files, dryRun: false })}
                >
                  {report.added.length || report.updated.length ? 'Применить версию' : 'Изменений нет'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={upload.isPending}>
                  Отмена
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
