/**
 * Stepper — горизонтальный степпер мастера ввода. Шаг маркирует линия
 * сверху (3px), а не круг: спокойнее в плотном интерфейсе.
 * Активный шаг — var(--primary), пройденные и будущие — muted.
 *
 * @example
 * <Stepper
 *   current={0}
 *   steps={[
 *     { id: 'type', label: 'Тип объекта' },
 *     { id: 'params', label: 'Параметры' },
 *     { id: 'process', label: 'Процессы' },
 *     { id: 'result', label: 'Результат' },
 *   ]}
 *   onStepClick={(index) => goTo(index)}
 * />
 */
import { cn } from '@/lib/utils';

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Индекс активного шага (с нуля). */
  current: number;
  /** Если передан — пройденные шаги становятся кликабельными. */
  onStepClick?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, current, onStepClick, className }: StepperProps) {
  return (
    <ol
      className={cn('grid border-b border-border', className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, index) => {
        const isActive = index === current;
        const isDone = index < current;
        const clickable = typeof onStepClick === 'function' && isDone;

        return (
          <li
            key={step.id}
            aria-current={isActive ? 'step' : undefined}
            className={cn(
              'border-t-[3px] px-5 py-[11px]',
              index < steps.length - 1 && 'border-r border-r-hairline',
              isActive ? 'border-t-primary' : 'border-t-border',
              clickable && 'cursor-pointer hover:bg-accent-tint',
            )}
            {...(clickable ? { onClick: () => onStepClick(index) } : {})}
          >
            <div
              className={cn(
                'font-mono text-[10px]',
                isActive ? 'text-primary' : 'text-meta-foreground',
              )}
            >
              {String(index + 1).padStart(2, '0')}
              {isDone ? ' ✓' : ''}
            </div>
            <div
              className={cn(
                'mt-[3px] text-xs',
                isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {step.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
