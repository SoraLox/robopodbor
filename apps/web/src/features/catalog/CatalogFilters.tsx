import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-hairline pt-3.5">
      <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox defaultChecked={checked} />
      <span className={cn(checked ? 'text-foreground' : 'text-foreground/80')}>
        {label}
      </span>
      {count !== undefined ? (
        <span className="ml-auto font-mono text-[10px] text-meta-foreground">{count}</span>
      ) : null}
    </label>
  );
}

/** Сайдбар фильтров каталога. Состояние демонстрационное — расчёт на бэкенде. */
export function CatalogFilters() {
  return (
    <aside className="border-b border-border px-4 pb-6 pt-4 lg:border-b-0 lg:border-r">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="micro-label">Фильтры</div>
        <button
          type="button"
          className="font-mono text-[10px] text-primary hover:text-primary-hover"
        >
          СБРОС
        </button>
      </div>

      <div className="mb-[18px] grid gap-1.5">
        {CLASSES.map((item) => (
          <CheckRow key={item.id} label={item.label} count={item.count} checked={item.checked} />
        ))}
      </div>

      <FilterGroup title="Цена, млн ₽">
        <div className="mb-2.5 flex gap-2">
          <Input defaultValue="2.0" className="px-2 py-1 text-xs" aria-label="Цена от" />
          <Input defaultValue="15.0" className="px-2 py-1 text-xs" aria-label="Цена до" />
        </div>
        <div className="relative mb-[18px] h-0.5 bg-hairline">
          <div className="absolute inset-y-0 left-[8%] right-[30%] bg-primary" />
        </div>
      </FilterGroup>

      <FilterGroup title="Грузоподъёмность">
        <div className="mb-[18px] flex flex-wrap gap-1.5">
          {PAYLOADS.map((payload) => {
            const active = payload === '600–1500 кг';
            return (
              <button
                key={payload}
                type="button"
                className={cn(
                  'border px-2.5 py-1 text-[11px]',
                  active
                    ? 'border-primary bg-accent-tint font-semibold text-accent-foreground'
                    : 'border-border text-foreground/80 hover:border-foreground',
                )}
              >
                {payload}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Зрелость решения">
        <div className="mb-[18px] grid gap-1.5">
          {MATURITY.map((item) => (
            <CheckRow key={item.id} label={item.label} checked={item.checked} />
          ))}
        </div>
      </FilterGroup>

      <div className="grid gap-1.5 border-t border-hairline pt-3.5">
        <CheckRow label="Российские вендоры" checked />
        <CheckRow label="Реестр Минпромторга" checked={false} />
      </div>
    </aside>
  );
}
