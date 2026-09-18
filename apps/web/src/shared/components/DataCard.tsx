/**
 * DataCard — базовая карточка данных: граница 1px, компактные отступы,
 * без тени. Выбранное состояние — левая полоса 3px + подложка orange-50.
 *
 * @example Карточка выбора типа объекта
 * <DataCard selected onClick={() => select('warehouse')}>
 *   <h3 className="font-heading text-[19px] uppercase">Склад</h3>
 * </DataCard>
 *
 * @example Плотная карточка без внутренних отступов (под таблицу внутри)
 * <DataCard padding="none">
 *   <ComparisonTable columns={cols} rows={rows} />
 * </DataCard>
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DataCardProps {
  children: ReactNode;
  /** Выбранное состояние: оранжевая рамка, левая полоса и подложка. */
  selected?: boolean;
  padding?: 'none' | 'compact' | 'default';
  onClick?: () => void;
  className?: string;
}

const PADDING = {
  none: '',
  compact: 'p-3',
  default: 'p-3.5 md:p-4',
} as const;

export function DataCard({
  children,
  selected = false,
  padding = 'default',
  onClick,
  className,
}: DataCardProps) {
  const interactive = typeof onClick === 'function';

  return (
    <div
      className={cn(
        'rounded-lg border bg-background transition-colors',
        selected
          ? 'border-primary border-l-[3px] bg-accent-tint'
          : 'border-border',
        interactive && !selected && 'cursor-pointer hover:border-foreground',
        interactive && selected && 'cursor-pointer',
        PADDING[padding],
        className,
      )}
      {...(interactive
        ? {
            onClick,
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            },
          }
        : {})}
    >
      {children}
    </div>
  );
}
