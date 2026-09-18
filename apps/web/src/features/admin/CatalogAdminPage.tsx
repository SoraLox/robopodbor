import { useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import {
  useDeleteSolution,
  useSolutions,
  useTaxonomy,
  useUpdateSolution,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeading, StatusBadge } from '@/shared/components';
import type { Solution, TaxonomyNode } from '@/api/types';
import { cn } from '@/lib/utils';

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
  const updateSolution = useUpdateSolution();
  const deleteSolution = useDeleteSolution();

  const [draft, setDraft] = useState<Solution | null>(null);

  const startCreate = () =>
    setDraft({
      id: `new-${Date.now()}`,
      name: '',
      vendor: '',
      useCase: '',
      price: '0',
      payload: '',
      speed: '',
      maturity: 'piloting',
      confidence: 'needs-review',
    });

  const save = async () => {
    if (!draft) return;
    await updateSolution.mutateAsync(draft);
    setDraft(null);
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-stretch border-b border-border">
        <div className="flex flex-col justify-center px-5 py-3.5">
          <h1 className="text-[18px] font-semibold">Администрирование каталога</h1>
          <div className="mt-1 meta-label">
            Позиций: {solutions?.length ?? 0} · доступно роли «администратор»
          </div>
        </div>
        <div className="ml-auto flex items-stretch">
          <Button className="px-5 py-3.5" onClick={startCreate}>
            <Plus className="size-3.5" strokeWidth={2} />
            Добавить позицию
          </Button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <SectionHeading className="mb-3" size="h2">
            Позиции каталога
          </SectionHeading>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-hairline" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-canvas/60">
                    <th scope="col" className="table-head px-3 py-2 text-left font-medium">Решение</th>
                    <th scope="col" className="table-head px-3 py-2 text-left font-medium">Вендор</th>
                    <th scope="col" className="table-head px-3 py-2 text-right font-medium">Цена</th>
                    <th scope="col" className="table-head px-3 py-2 text-right font-medium">Данные</th>
                    <th scope="col" className="table-head px-3 py-2 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {solutions?.map((solution) => (
                    <tr key={solution.id} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-2.5">{solution.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{solution.vendor}</td>
                      <td className="px-3 py-2.5 text-right tabular">{solution.price}</td>
                      <td className="px-3 py-2.5 text-right">
                        <StatusBadge
                          variant={
                            solution.confidence === 'confirmed' ? 'confirmed' : 'needs-review'
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            aria-label={`Редактировать ${solution.name}`}
                            onClick={() => setDraft(solution)}
                            className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary hover:text-primary"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.8} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Удалить ${solution.name}`}
                            onClick={() => deleteSolution.mutate(solution.id)}
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

          {deleteSolution.isError || updateSolution.isError ? (
            <p role="alert" className="mt-3 text-[12px] text-status-danger">
              {(deleteSolution.error ?? updateSolution.error) instanceof Error
                ? (deleteSolution.error ?? updateSolution.error as Error).message
                : 'Операция не выполнена'}
            </p>
          ) : null}

          {draft ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              className="mt-5 rounded-lg border border-border p-4"
            >
              <SectionHeading size="h2" className="mb-4">
                {solutions?.some((s) => s.id === draft.id) ? 'Редактирование' : 'Новая позиция'}
              </SectionHeading>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ['name', 'Название'],
                  ['vendor', 'Вендор'],
                  ['useCase', 'Применение'],
                  ['price', 'Цена, млн ₽'],
                  ['payload', 'Грузоподъёмность'],
                  ['speed', 'Скорость'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="grid gap-1.5">
                    <Label htmlFor={`f-${key}`}>{label}</Label>
                    <Input
                      id={`f-${key}`}
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: event.target.value })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <Button type="submit" size="sm" disabled={updateSolution.isPending}>
                  {updateSolution.isPending ? 'Сохраняем…' : 'Сохранить'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>
                  Отмена
                </Button>
              </div>
            </form>
          ) : null}
        </div>

        <div>
          <SectionHeading className="mb-3" size="h2">
            Иерархия
          </SectionHeading>
          <div className="rounded-lg border border-border p-3">
            <ul>
              {taxonomy?.map((node) => <TaxonomyBranch key={node.id} node={node} />)}
            </ul>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-meta-foreground">
            Отрасль → объект → процесс → тип решения → продукт
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export default CatalogAdminPage;
