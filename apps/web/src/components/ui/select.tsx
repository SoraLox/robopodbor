import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-11 w-full appearance-none rounded-lg border border-input bg-background pl-3.5 pr-9 text-[13.5px] text-foreground transition-[color,box-shadow,border-color] duration-150',
          'hover:border-foreground/30',
          'focus-visible:outline-none focus-visible:border-primary-bright focus-visible:ring-4 focus-visible:ring-primary-bright/15',
          'aria-invalid:border-status-danger aria-invalid:hover:border-status-danger',
          'aria-invalid:focus-visible:border-status-danger aria-invalid:focus-visible:ring-status-danger/15',
          'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-hairline/60 disabled:text-meta-foreground',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-meta-foreground"
        strokeWidth={2}
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
