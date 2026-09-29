import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, GitCompareArrows, Heart, Layers, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/app/DashboardLayout';
import { useFavorites, useToggleFavorite } from '@/api/account';
import { useSolutions } from '@/api/queries';
import type { Maturity, Solution } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { robotPhoto } from '@/features/objects/previewImages';
import { categorize } from '@/features/catalog/solutionCategory';
import { cn } from '@/lib/utils';

const MATURITY_LABEL: Record<Maturity, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
};

const MATURITY_TEXT: Record<Maturity, string> = {
  operation: 'text-status-operation',
  piloting: 'text-status-piloting',
  rnd: 'text-status-rnd',
};

/** Сравнивать удобно до 4 роботов: шире таблица не читается. */
const COMPARE_LIMIT = 4;

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Три главные характеристики для строки избранного — то, по чему обычно выбирают. */
function keySpecs(solution: Solution): Array<{ label: string; value: string }> {
  const specs: Array<{ label: string; value: string }> = [];
  if (solution.payloadKg) specs.push({ label: 'Грузоподъёмность', value: `${nf.format(solution.payloadKg)} кг` });
  if (solution.throughput) {
    specs.push({ label: 'Производительность', value: `${nf.format(solution.throughput)} ${solution.throughputUnit ?? ''}`.trim() });
  }
  if (solution.autonomyHours) {
    specs.push({ label: 'Автономность', value: solution.autonomyHours === 24 ? 'от сети' : `${nf.format(solution.autonomyHours)} ч` });
  }
  if (specs.length < 3 && solution.speed && solution.speed !== '—') specs.push({ label: 'Скорость', value: solution.speed });
  if (specs.length < 3 && solution.lifespanYears) specs.push({ label: 'Срок службы', value: `${nf.format(solution.lifespanYears)} лет` });
  return specs.slice(0, 3);
}

export function FavoritesPage() {
  const navigate = useNavigate();
  const { data: favoriteIds = [], isLoading: favoritesLoading } = useFavorites();
  const { data: solutions, isLoading: catalogLoading } = useSolutions();
  const toggle = useToggleFavorite();
  const [picked, setPicked] = useState<string[]>([]);

  const favorites = favoriteIds.flatMap((id) => solutions?.find((solution) => solution.id === id) ?? []);
  // Робота могли удалить из каталога — такие id показываем отдельно, чтобы их можно было убрать.
  const missing = solutions ? favoriteIds.filter((id) => !solutions.some((solution) => solution.id === id)) : [];
  const selected = picked.filter((id) => favoriteIds.includes(id));
  const loading = favoritesLoading || catalogLoading;

  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length >= COMPARE_LIMIT ? current : [...current, id],
    );

  const compare = (ids: string[]) => navigate(`/catalog/compare?ids=${ids.map(encodeURIComponent).join(',')}`);

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Избранные роботы</h1>
          <p className="mt-1 max-w-[62ch] text-[13px] text-muted-foreground">
            Роботы, которых вы сохранили из каталога (сердечко на карточке). Отметьте 2–{COMPARE_LIMIT}, чтобы
            сравнить характеристики построчно.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild variant="outline" size="sm" className="justify-center">
            <Link to="/catalog">
              <Layers className="size-4" strokeWidth={1.8} aria-hidden />
              Открыть каталог
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            className="justify-center"
            disabled={selected.length < 2}
            onClick={() => compare(selected)}
          >
            <GitCompareArrows className="size-4" strokeWidth={1.8} aria-hidden />
            Сравнить выбранные{selected.length ? ` (${selected.length})` : ''}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[148px] animate-pulse rounded-[20px] bg-muted" />
          ))}
        </div>
      ) : favorites.length === 0 && missing.length === 0 ? (
        <section className="panel flex flex-col items-center px-5 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-status-danger-tint text-status-danger">
            <Heart className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <p className="mt-3 text-[15px] font-semibold">В избранном пока пусто</p>
          <p className="mt-1 max-w-[46ch] text-[13px] text-muted-foreground">
            Нажмите на сердечко на карточке робота в каталоге — он появится здесь, и его можно будет сравнить с другими.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link to="/catalog">Перейти в каталог</Link>
          </Button>
        </section>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-muted-foreground">
            Сохранено: <span className="tabular font-medium text-foreground">{favorites.length}</span>
            {selected.length ? ` · выбрано для сравнения: ${selected.length} из ${COMPARE_LIMIT}` : ''}
            {favorites.length >= 2 ? (
              <>
                {' · '}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2"
                  onClick={() => compare(favorites.slice(0, COMPARE_LIMIT).map((s) => s.id))}
                >
                  сравнить {favorites.length > COMPARE_LIMIT ? `первые ${COMPARE_LIMIT}` : 'все'}
                </button>
              </>
            ) : null}
          </p>

          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {favorites.map((solution) => (
              <FavoriteCard
                key={solution.id}
                solution={solution}
                picked={selected.includes(solution.id)}
                pickDisabled={!selected.includes(solution.id) && selected.length >= COMPARE_LIMIT}
                onPick={() => togglePick(solution.id)}
                onRemove={() => toggle.mutate({ id: solution.id, favorite: false })}
              />
            ))}
          </ul>

          {missing.length ? (
            <div className="mt-4 rounded-[14px] border border-dashed border-hairline px-4 py-3 text-[12.5px] text-muted-foreground">
              Нет в текущей версии каталога: {missing.join(', ')}.{' '}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={() => missing.forEach((id) => toggle.mutate({ id, favorite: false }))}
              >
                Убрать
              </button>
            </div>
          ) : null}
        </>
      )}
    </DashboardLayout>
  );
}

function FavoriteCard({
  solution,
  picked,
  pickDisabled,
  onPick,
  onRemove,
}: {
  solution: Solution;
  picked: boolean;
  pickDisabled: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  const category = categorize(solution);
  const Icon = category.icon;
  const photo = robotPhoto(solution);
  const [broken, setBroken] = useState(false);
  const specs = keySpecs(solution);

  return (
    <li
      className={cn(
        'flex flex-col rounded-[20px] border bg-white p-3 transition-colors',
        picked ? 'border-foreground' : 'border-[#E5E5EA]',
      )}
    >
      <div className="flex gap-3">
        <div className="grid size-[72px] flex-none place-items-center overflow-hidden rounded-[14px] bg-[#FAFAFA]">
          {photo && !broken ? (
            <img src={photo} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-contain p-1.5" />
          ) : (
            <Icon className="size-6 text-[#8E8E93]" strokeWidth={1.5} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-meta-foreground">
              {solution.vendor}
            </span>
            <span className={cn('flex-none text-[11px] font-medium', MATURITY_TEXT[solution.maturity])}>
              {MATURITY_LABEL[solution.maturity]}
            </span>
          </div>
          <h2 className="mt-0.5 line-clamp-2 text-[14.5px] font-semibold leading-snug">{solution.name}</h2>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{category.label}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-[10px] border border-[#E5E5EA] px-2 py-1.5">
          <dt className="text-[10.5px] text-[#8E8E93]">Цена</dt>
          <dd className="mt-0.5 truncate text-[12.5px] font-semibold tabular">
            {solution.price && solution.price !== '—' ? `${solution.price} млн ₽` : 'по запросу'}
          </dd>
        </div>
        {specs.slice(0, 2).map((spec) => (
          <div key={spec.label} className="rounded-[10px] border border-[#E5E5EA] px-2 py-1.5">
            <dt className="truncate text-[10.5px] text-[#8E8E93]">{spec.label}</dt>
            <dd className="mt-0.5 truncate text-[12.5px] font-semibold tabular">{spec.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-2.5">
        <label
          className={cn(
            'flex min-h-[36px] flex-1 cursor-pointer items-center gap-2 text-[12.5px] font-medium',
            pickDisabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <Checkbox checked={picked} disabled={pickDisabled} onCheckedChange={onPick} aria-label={`Сравнить ${solution.name}`} />
          Сравнить
        </label>
        <Link
          to={`/catalog?robot=${encodeURIComponent(solution.id)}`}
          className="inline-flex h-8 items-center gap-1 rounded-[8px] px-2 text-[12.5px] font-medium text-foreground hover:bg-[#F2F2F2]"
        >
          Карточка
          <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать ${solution.name} из избранного`}
          title="Убрать из избранного"
          className="grid size-8 place-items-center rounded-[8px] text-muted-foreground hover:bg-status-danger-tint hover:text-status-danger"
        >
          <Trash2 className="size-4" strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export default FavoritesPage;
