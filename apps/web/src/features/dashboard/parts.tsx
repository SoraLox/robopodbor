import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { MiniTrend } from '@/shared/charts';
import { cn } from '@/lib/utils';
import type { CalcStatus } from './data';

/** Карточка панели с заголовком и необязательной ссылкой справа. */
export function Panel({
  title,
  action,
  actionTo,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: string;
  actionTo?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('panel', className)}>
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <h2 className="panel-title">{title}</h2>
        {meta ? <div className="ml-auto">{meta}</div> : null}
        {action && actionTo ? (
          <Link
            to={actionTo}
            className={cn(
              'flex min-h-[32px] items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-canvas hover:text-primary',
              !meta && 'ml-auto',
            )}
          >
            {action}
            <ArrowRight className="size-3.5" strokeWidth={1.7} />
          </Link>
        ) : null}
      </header>
      <div className={cn('px-4 pb-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI-плитка: число, изменение к прошлому месяцу и спарклайн. */
export function KpiTile({
  label,
  value,
  unit,
  delta,
  tone,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: string;
  tone: 'up' | 'down';
  trend: number[];
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const DeltaIcon = tone === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-lg bg-accent-tint">
          <Icon className="size-4 text-primary" strokeWidth={1.7} />
        </span>
        <span className="text-[12px] text-muted-foreground">{label}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[26px] font-semibold leading-none tabular">{value}</span>
            {unit ? <span className="text-[12px] text-muted-foreground">{unit}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <DeltaIcon
              className={cn(
                'size-3.5 flex-none',
                tone === 'up' ? 'text-status-operation' : 'text-muted-foreground',
              )}
              strokeWidth={1.7}
              aria-hidden
            />
            <span
              className={cn(
                'text-[12px] font-medium tabular',
                tone === 'up' ? 'text-status-operation' : 'text-muted-foreground',
              )}
            >
              {delta}
            </span>
            <span className="meta-label">к прошлому месяцу</span>
          </div>
        </div>
        <MiniTrend data={trend} tone={tone} />
      </div>
    </div>
  );
}

const STATUS: Record<CalcStatus, { label: string; className: string }> = {
  active: { label: 'В работе', className: 'bg-status-piloting-tint text-status-piloting' },
  done: { label: 'Рассчитан', className: 'bg-status-confirmed-tint text-status-confirmed' },
  approved: { label: 'Одобрен', className: 'bg-status-operation-tint text-status-operation' },
  rejected: { label: 'Отклонён', className: 'bg-status-danger-tint text-status-danger' },
};

/** Статус-пилюля: мягкая подложка и насыщенный текст. */
export function StatusPill({ status }: { status: CalcStatus }) {
  const item = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium',
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}

/** Точка-маркер события в ленте. */
export function EventDot({ tone }: { tone: string }) {
  const map: Record<string, string> = {
    operation: 'bg-status-operation',
    piloting: 'bg-status-piloting',
    confirmed: 'bg-status-confirmed',
    rnd: 'bg-status-rnd',
    danger: 'bg-status-danger',
  };
  return (
    <span
      className={cn('mt-1.5 size-1.5 flex-none rounded-full', map[tone] ?? 'bg-status-rnd')}
      aria-hidden
    />
  );
}

/** Легенда графика: цветная точка, подпись и необязательное значение. */
export function LegendRow({
  color,
  name,
  value,
}: {
  color: string;
  name: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-[5px] text-[12px]">
      <span
        className="size-2 flex-none rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="truncate text-muted-foreground">{name}</span>
      {value ? <span className="ml-auto tabular font-medium">{value}</span> : null}
    </div>
  );
}
