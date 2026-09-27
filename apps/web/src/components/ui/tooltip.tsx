import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/** Скруглённый «клювик»: без шва с карточкой, мягкая гипербола вместо треугольника. */
function TooltipCaret({ className }: { className?: string }) {
  return (
    <svg
      width={22}
      height={10}
      viewBox="0 0 22 10"
      aria-hidden
      className={cn('block overflow-visible', className)}
    >
      {/* Заливка накрывает нижнюю границу карточки (−1px), поэтому шва нет. */}
      <path d="M0 0 C7.2 0 8.4 9.5 11 9.5 C13.6 9.5 14.8 0 22 0 Z" className="fill-white" />
      {/* Обводка только по дуге — без линии по верху. */}
      <path
        d="M0.5 0 C7.2 0 8.4 9 11 9 C13.6 9 14.8 0 21.5 0"
        fill="none"
        stroke="#E5E5EA"
        strokeWidth={1}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Подсказка в языке мини-меню профиля: белая карточка, мягкая тень, стрелка к триггеру.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 10, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'group z-50 max-w-[240px] rounded-[14px] border border-[#E5E5EA] bg-white px-3 py-2.5',
        'text-[12.5px] leading-snug text-[#1C1C1E]',
        'shadow-[0_4px_24px_rgba(0,0,0,0.06)]',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow asChild>
        <span className="-my-px flex h-[10px] w-[22px] items-start justify-center">
          <TooltipCaret />
        </span>
      </TooltipPrimitive.Arrow>
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
