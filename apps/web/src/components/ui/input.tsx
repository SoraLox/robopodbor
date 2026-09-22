import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Суффикс единицы измерения, отображается внутри поля справа («м²», «шт»). */
  unit?: string;
}

const fieldClasses = cn(
  'flex h-11 w-full rounded-lg border border-input bg-background px-3.5 text-[13.5px] tabular text-foreground transition-[color,box-shadow,border-color] duration-150',
  'placeholder:text-meta-foreground/80',
  'hover:border-foreground/30',
  'focus-visible:outline-none focus-visible:border-primary-bright focus-visible:ring-4 focus-visible:ring-primary-bright/15',
  'aria-invalid:border-status-danger aria-invalid:hover:border-status-danger',
  'aria-invalid:focus-visible:border-status-danger aria-invalid:focus-visible:ring-status-danger/15',
  'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-hairline/60 disabled:text-meta-foreground',
);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, unit, ...props }, ref) => {
    if (!unit) {
      return <input type={type} ref={ref} className={cn(fieldClasses, className)} {...props} />;
    }

    return (
      <div className="relative">
        <input
          type={type}
          ref={ref}
          className={cn(fieldClasses, 'pr-14', className)}
          {...props}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-medium text-meta-foreground">
          {unit}
        </span>
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
