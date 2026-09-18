/**
 * ComparisonTable — плотная таблица сравнения. Строки разделены hairline,
 * шапка — линией 1px border. Чередующейся заливки строк нет: выделенная
 * строка получает подложку orange-50 без рамки.
 *
 * Ширины колонок задаются через `width` (значения grid-template-columns),
 * поэтому шапка и строки всегда стоят в одной сетке.
 *
 * @example
 * <ComparisonTable
 *   columns={[
 *     { key: 'name', header: 'Решение', width: 'minmax(0, 1.5fr)' },
 *     { key: 'price', header: 'Цена', width: '76px', align: 'right' },
 *     { key: 'source', header: 'Данные', width: '122px', align: 'right' },
 *   ]}
 *   rows={[
 *     {
 *       id: 'p15',
 *       selected: true,
 *       onClick: () => toggle('p15'),
 *       cells: {
 *         name: 'AMR-паллетовоз P15',
 *         price: '7.4',
 *         source: <StatusBadge variant="confirmed" />,
 *       },
 *     },
 *   ]}
 * />
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ComparisonColumn {
  key: string;
  header: ReactNode;
  /** Значение для grid-template-columns, напр. '76px' или 'minmax(0, 1fr)'. */
  width?: string;
  align?: 'left' | 'right';
}

export interface ComparisonRow {
  id: string;
  cells: Record<string, ReactNode>;
  selected?: boolean;
  onClick?: () => void;
}

export interface ComparisonTableProps {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  /** Итоговая строка под таблицей, отделяется линией border. */
  footer?: Record<string, ReactNode>;
  className?: string;
}

export function ComparisonTable({
  columns,
  rows,
  footer,
  className,
}: ComparisonTableProps) {
  const template = columns.map((c) => c.width ?? 'minmax(0, 1fr)').join(' ');

  return (
    <div className={cn('w-full', className)}>
      <div
        className="grid gap-2.5 border-b border-border px-4 pb-2 pt-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(column.align === 'right' && 'text-right')}
          >
            {column.header}
          </div>
        ))}
      </div>

      {rows.map((row) => {
        const clickable = typeof row.onClick === 'function';

        return (
          <div
            key={row.id}
            className={cn(
              'grid items-center gap-2.5 border-b border-hairline px-4 py-[11px]',
              row.selected && 'bg-accent-tint',
              clickable && 'cursor-pointer hover:bg-accent-tint/60',
            )}
            style={{ gridTemplateColumns: template }}
            {...(clickable
              ? {
                  onClick: row.onClick,
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': Boolean(row.selected),
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      row.onClick?.();
                    }
                  },
                }
              : {})}
          >
            {columns.map((column) => (
              <div
                key={column.key}
                className={cn('min-w-0', column.align === 'right' && 'text-right')}
              >
                {row.cells[column.key] ?? null}
              </div>
            ))}
          </div>
        );
      })}

      {footer ? (
        <div
          className="grid items-center gap-2.5 border-t border-border px-4 py-3"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              className={cn(column.align === 'right' && 'text-right')}
            >
              {footer[column.key] ?? null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
