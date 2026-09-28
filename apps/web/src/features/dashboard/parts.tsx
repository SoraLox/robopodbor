import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Maturity } from '@/api/types';

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

/** KPI-плитка: число и пояснение, откуда оно. */
export function KpiTile({
  label,
  value,
  unit,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-lg bg-accent-tint">
          <Icon className="size-4 text-primary" strokeWidth={1.7} />
        </span>
        <span className="text-[12px] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[26px] font-semibold leading-none tabular">{value}</span>
        {unit ? <span className="text-[12px] text-muted-foreground">{unit}</span> : null}
      </div>
      <div className="mt-2 meta-label">{note}</div>
    </div>
  );
}

/** Те же подписи статусов, что в «Моих расчётах». */
export const STATUS: Record<Maturity, { label: string; className: string }> = {
  operation: { label: 'Защищён', className: 'bg-status-operation-tint text-status-operation' },
  piloting: { label: 'На согласовании', className: 'bg-status-piloting-tint text-status-piloting' },
  rnd: { label: 'Черновик', className: 'bg-status-rnd-tint text-status-rnd' },
};

/** Статус-пилюля: мягкая подложка и насыщенный текст. */
export function StatusPill({ status }: { status: Maturity }) {
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
