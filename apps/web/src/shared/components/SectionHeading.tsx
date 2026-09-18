/**
 * SectionHeading — заголовок секции с вертикальной оранжевой полоской слева.
 *
 * Полоска 4px шириной, высота тянется по тексту (h-full через self-stretch).
 * Нижняя линейка не рисуется — её держит сетка, см. дизайн-систему 03/05.
 *
 * @example
 * <SectionHeading>Сравнение сценариев</SectionHeading>
 *
 * @example Со служебной подписью справа
 * <SectionHeading size="h1" meta="TCO, 7 ЛЕТ · МЛН ₽">
 *   Результат расчёта
 * </SectionHeading>
 *
 * @example Микро-уровень (полоска 3×12)
 * <SectionHeading size="micro">Вложенный уровень</SectionHeading>
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SectionHeadingSize = 'display' | 'h1' | 'h2' | 'micro';

export interface SectionHeadingProps {
  children: ReactNode;
  /** Служебная mono-подпись, прижатая к правому краю. */
  meta?: ReactNode;
  size?: SectionHeadingSize;
  className?: string;
}

const TEXT: Record<SectionHeadingSize, string> = {
  display: 'text-[40px] font-bold tracking-display leading-[0.95]',
  h1: 'text-[28px] font-bold tracking-h1 leading-none',
  h2: 'text-[20px] font-semibold tracking-[-0.025em]',
  micro: 'text-[13px] font-semibold tracking-[-0.01em]',
};

const BAR: Record<SectionHeadingSize, string> = {
  display: 'w-1 h-11',
  h1: 'w-1 h-[26px]',
  h2: 'w-1 h-5',
  micro: 'w-[3px] h-3',
};

export function SectionHeading({
  children,
  meta,
  size = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className={cn('flex-none bg-primary', BAR[size])} aria-hidden />
      <div className={cn('font-heading uppercase', TEXT[size])}>{children}</div>
      {meta ? <div className="ml-auto meta-label">{meta}</div> : null}
    </div>
  );
}
