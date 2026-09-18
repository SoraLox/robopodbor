/**
 * StatusBadge — прямоугольная пилюля статуса; цвет несёт левая полоса 3px.
 *
 * Пять вариантов, цвета берутся из токенов --status-*. Оранжевый повторно
 * используется только в варианте `confirmed` (см. таблицу токенов).
 *
 * @example
 * <StatusBadge variant="operation" />
 * <StatusBadge variant="needs-review" />
 *
 * @example Свой текст вместо подписи по умолчанию
 * <StatusBadge variant="confirmed">Прайс 2026</StatusBadge>
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusVariant =
  | 'operation'
  | 'piloting'
  | 'rnd'
  | 'confirmed'
  | 'needs-review';

export interface StatusBadgeProps {
  variant: StatusVariant;
  children?: ReactNode;
  className?: string;
}

const LABEL: Record<StatusVariant, string> = {
  operation: 'В эксплуатации',
  piloting: 'Пилот',
  rnd: 'НИОКР',
  confirmed: 'Подтверждено',
  'needs-review': 'Требует проверки',
};

/** Каждому статусу — свой токен: текст, левая полоса и бледная рамка. */
const TONE: Record<StatusVariant, string> = {
  operation:
    'text-status-operation border-status-operation/30 border-l-status-operation',
  piloting:
    'text-status-piloting border-status-piloting/35 border-l-status-piloting',
  rnd: 'text-status-rnd border-status-rnd/35 border-l-status-rnd',
  confirmed:
    'text-status-confirmed border-status-confirmed/30 border-l-status-confirmed',
  'needs-review':
    'text-status-piloting border-status-piloting/35 border-l-status-piloting',
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block border border-l-[3px] px-2 py-[3px]',
        'text-[9px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap',
        TONE[variant],
        className,
      )}
    >
      {children ?? LABEL[variant]}
    </span>
  );
}
