import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const OBJECT_TYPES = [
  { slug: 'warehouse', label: 'Склад' },
  { slug: 'airport', label: 'Аэропорт' },
  { slug: 'clinic', label: 'Клиника' },
];

const CLASSES = [
  { id: 'amr', label: 'AMR / транспортировка', count: 54, checked: true },
  { id: 'asrs', label: 'AS/RS · хранение', count: 31, checked: true },
  { id: 'sort', label: 'Сортировка', count: 28, checked: false },
  { id: 'pick', label: 'Пикинг / манипуляторы', count: 22, checked: false },
  { id: 'uav', label: 'Инвентаризация БАС', count: 13, checked: false },
];

const PAYLOADS = ['до 100 кг', '600–1500 кг', '1500+ кг'];
const MATURITY = [
  { id: 'operation', label: 'В эксплуатации', checked: true },
  { id: 'piloting', label: 'Пилот', checked: true },
  { id: 'rnd', label: 'НИОКР', checked: false },
];

/** Заголовок раздела фильтров: моно-капс — тот же приём, что и цифры в карточках решений. */
function FilterGroup({
  title,
  children,
  first,
}: {
  title: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div className={cn('pt-4', !first && 'mt-4 border-t border-hairline')}>
      <div className="mb-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-meta-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
}: {
  label: string;
  count?: number;
  checked: boolean;
}) {
  return (
    <label className="flex min-h-[32px] cursor-pointer items-center gap-2.5 text-[13.5px]">
      <Checkbox defaultChecked={checked} className="size-4" />
      <span className={cn('leading-snug', checked ? 'text-foreground' : 'text-foreground/75')}>
        {label}
      </span>
      {count !== undefined ? (
        <span className="ml-auto rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-meta-foreground">
          {count}
        </span>
      ) : null}
    </label>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors',
        active
          ? 'border-primary bg-accent-tint font-medium text-accent-foreground'
          : 'border-border text-foreground/75 hover:border-foreground/30',
      )}
    >
      {label}
    </button>
  );
}

export interface CatalogFiltersProps {
  objectType: string;
  onObjectTypeChange: (slug: string) => void;
}

/** Сайдбар фильтров каталога. Тип объекта — тоже фильтр, а не отдельный ряд кнопок над каталогом. */
export function CatalogFilters({ objectType, onObjectTypeChange }: CatalogFiltersProps) {
  return (
    <aside className="h-fit rounded-lg border border-border bg-background p-5 lg:sticky lg:top-[84px]">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-foreground">Фильтры</h2>
        <button
          type="button"
          className="text-[12.5px] font-medium text-primary hover:text-primary-hover hover:underline"
        >
          Сбросить
        </button>
      </div>

      <FilterGroup title="Тип объекта" first>
        <div className="flex flex-wrap gap-1.5">
          {OBJECT_TYPES.map((item) => (
            <Chip
              key={item.slug}
              label={item.label}
              active={item.slug === objectType}
              onClick={() => onObjectTypeChange(item.slug)}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Класс решения">
        <div className="grid gap-1">
          {CLASSES.map((item) => (
            <CheckRow key={item.id} label={item.label} count={item.count} checked={item.checked} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Цена, млн ₽">
        <div className="flex items-center gap-2">
          <Input defaultValue="2.0" className="rounded-md text-[13px]" aria-label="Цена от" />
          <span className="text-muted-foreground">—</span>
          <Input defaultValue="15.0" className="rounded-md text-[13px]" aria-label="Цена до" />
        </div>
        <div className="relative mt-4 h-1 rounded-full bg-hairline">
          <div className="absolute inset-y-0 left-[8%] right-[30%] rounded-full bg-primary" />
        </div>
      </FilterGroup>

      <FilterGroup title="Грузоподъёмность">
        <div className="flex flex-wrap gap-1.5">
          {PAYLOADS.map((payload) => (
            <Chip key={payload} label={payload} active={payload === '600–1500 кг'} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Зрелость решения">
        <div className="grid gap-1">
          {MATURITY.map((item) => (
            <CheckRow key={item.id} label={item.label} checked={item.checked} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Прочее">
        <div className="grid gap-1">
          <CheckRow label="Российские вендоры" checked />
          <CheckRow label="Реестр Минпромторга" checked={false} />
        </div>
      </FilterGroup>
    </aside>
  );
}
