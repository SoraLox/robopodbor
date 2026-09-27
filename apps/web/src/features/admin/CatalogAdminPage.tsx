import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { SOLUTION_TYPES } from '@domain/catalog';
import { DashboardLayout } from '@/app/DashboardLayout';
import {
  downloadFile,
  useDeleteSolution,
  useImportCatalog,
  useSolutions,
  useTaxonomy,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/shared/components';
import type { Solution, TaxonomyNode } from '@/api/types';
import { cn } from '@/lib/utils';
import { RobotCatalogImport } from './RobotCatalogImport';
import { SolutionEditor } from './SolutionEditor';

const EMPTY_SOLUTION: Solution = {
  id: '',
  name: '',
  vendor: '',
  useCase: '',
  price: '',
  payload: '',
  speed: '',
  maturity: 'piloting',
  confidence: 'needs-review',
};

const LEVEL_LABEL: Record<string, string> = {
  industry: 'Отрасль',
  object: 'Объект',
  process: 'Процесс',
  solutionType: 'Тип решения',
  product: 'Продукт',
};

/** Ветка иерархии отрасль → объект → процесс → тип решения → продукт. */
function TaxonomyBranch({ node, depth = 0 }: { node: TaxonomyNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = Boolean(node.children?.length);

  return (
    <li>
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'Свернуть' : 'Развернуть'}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
              strokeWidth={1.8}
            />
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        <span className="text-[13px]">{node.label}</span>
        <span className="ml-2 rounded bg-hairline px-1.5 py-0.5 text-[10px] text-meta-foreground">
          {LEVEL_LABEL[node.level] ?? node.level}
        </span>
      </div>
      {hasChildren && open ? (
        <ul>
          {node.children?.map((child) => (
            <TaxonomyBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CatalogAdminPage() {
  const { data: solutions, isLoading } = useSolutions();
  const { data: taxonomy } = useTaxonomy();
  const deleteSolution = useDeleteSolution();
  const importCatalog = useImportCatalog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ solution: Solution; isNew: boolean } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const open = (solution: Solution, isNew: boolean) => {
    setEditing({ solution, isNew });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportAs = (format: 'xlsx' | 'csv') => {
    setExportError(null);
    downloadFile(`/catalog/solutions/export?format=${format}`, `catalog.${format}`).catch((error: unknown) =>
      setExportError(error instanceof Error ? error.message : 'Не удалось выгрузить каталог'),
    );
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    importCatalog.mutate(file);
  };

  const remove = (solution: Solution) => {
    if (window.confirm(`Удалить «${solution.name}» из каталога? Действие попадёт в журнал изменений.`)) {
      deleteSolution.mutate(solution.id);
    }
  };

  const actionError = deleteSolution.error ?? importCatalog.error;

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> Справочники
          </Link>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.01em]">Каталог решений</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Позиций: {solutions?.length ?? 0} · правки видны пользователям сразу и попадают в журнал
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            aria-label="Файл каталога"
            tabIndex={-1}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={importCatalog.isPending}>
            <Upload className="size-3.5" strokeWidth={2} />
            {importCatalog.isPending ? 'Загружаем…' : 'Загрузить xlsx / csv'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => exportAs('xlsx')}>
            <Download className="size-3.5" strokeWidth={2} />
            Выгрузить xlsx
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => exportAs('csv')}>
            CSV
          </Button>
          <Button type="button" size="sm" onClick={() => open(EMPTY_SOLUTION, true)}>
            <Plus className="size-3.5" strokeWidth={2} />
            Добавить позицию
          </Button>
        </div>
      </div>

      <RobotCatalogImport solutions={solutions ?? []} />

      {importCatalog.data ? (
        <div role="status" className="panel mb-4 px-5 py-3 text-[13px]">
          <p>
            Загрузка завершена: добавлено {importCatalog.data.created}, обновлено {importCatalog.data.updated}
            {importCatalog.data.errors.length ? `, строк с ошибками: ${importCatalog.data.errors.length}` : ''}.
          </p>
          {importCatalog.data.errors.length ? (
            <ul className="mt-1.5 grid max-h-32 gap-0.5 overflow-y-auto text-[12px] text-status-danger">
              {importCatalog.data.errors.map((issue, index) => (
                <li key={`${issue.row ?? ''}-${index}`}>
                  {issue.row ? `Строка ${issue.row}: ` : ''}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {actionError || exportError ? (
        <p role="alert" className="mb-3 text-[12.5px] text-status-danger">
          {exportError ?? (actionError instanceof Error ? actionError.message : 'Операция не выполнена')}
        </p>
      ) : null}

      {editing ? (
        <div className="mb-4">
          <SolutionEditor
            key={editing.isNew ? 'new' : editing.solution.id}
            initial={editing.solution}
            isNew={editing.isNew}
            onDone={() => setEditing(null)}
          />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="panel overflow-hidden">
          {isLoading ? (
            <div className="h-40 animate-pulse bg-hairline" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-hairline bg-[#FAFAFA] text-left text-[11.5px] text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-medium">Решение</th>
                    <th scope="col" className="px-3 py-2 font-medium">Тип</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Цена, млн ₽</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Полнота</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Данные</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {solutions?.map((solution) => (
                    <tr key={solution.id} className="border-b border-hairline last:border-0">
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{solution.name}</div>
                        <div className="text-[12px] text-muted-foreground">{solution.vendor}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {solution.solutionType ? SOLUTION_TYPES[solution.solutionType] ?? solution.solutionType : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">{solution.price}</td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right tabular',
                          (solution.completeness ?? 0) < 70 && 'text-status-piloting',
                        )}
                      >
                        {solution.completeness ?? '—'}%
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <StatusBadge variant={solution.confidence === 'confirmed' ? 'confirmed' : 'needs-review'} />
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            aria-label={`Редактировать ${solution.name}`}
                            onClick={() => open(solution, false)}
                            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.8} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Удалить ${solution.name}`}
                            onClick={() => remove(solution)}
                            className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-status-danger hover:text-status-danger"
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="panel p-4">
          <h2 className="text-[14px] font-semibold">Иерархия</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Отрасль → объект → процесс → тип решения → продукт. Строится из каталога.
          </p>
          <ul className="mt-2">
            {taxonomy?.map((node) => <TaxonomyBranch key={node.id} node={node} />)}
          </ul>
        </aside>
      </div>
    </DashboardLayout>
  );
}

export default CatalogAdminPage;
