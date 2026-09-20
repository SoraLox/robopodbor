/**
 * Stepper — горизонтальный степпер мастера ввода: кружок с номером
 * (галочка — если шаг пройден), подпись рядом, между шагами — линия.
 * Пройденный шаг кликабелен, если передан onStepClick.
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
import { Check } from 'lucide-react';
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
    <ol className={cn('flex items-center', className)}>
      {steps.map((step, index) => {
        const isActive = index === current;
        const isDone = index < current;
        const clickable = typeof onStepClick === 'function' && isDone;
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={isActive ? 'step' : undefined}
            className={cn('flex items-center', !isLast && 'flex-1')}
          >
            <div
              {...(clickable
                ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onStepClick(index),
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onStepClick(index);
                      }
                    },
                  }
                : {})}
              className={cn('flex items-center gap-2.5', clickable && 'cursor-pointer')}
            >
              <div
                className={cn(
                  'flex size-7 flex-none items-center justify-center rounded-full text-[12px] font-semibold',
                  isDone && 'bg-primary text-primary-foreground',
                  isActive && 'border-2 border-primary text-primary',
                  !isDone && !isActive && 'border border-border text-meta-foreground',
                )}
              >
                {isDone ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </div>
              <span
                className={cn(
                  'hidden text-[13px] sm:inline',
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>

            {!isLast ? (
              <div className={cn('mx-3 h-px flex-1', isDone ? 'bg-primary' : 'bg-border')} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
