import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-control transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /* Мягкая диффузная тень как у референса — offset + blur, не halo */
        default:
          'bg-primary text-primary-foreground shadow-[0_6px_20px_-4px_rgba(0,0,0,0.28)] hover:bg-primary-hover hover:shadow-[0_10px_28px_-6px_rgba(0,0,0,0.32)]',
        outline: 'border border-border bg-background hover:border-foreground/30 hover:bg-muted/60',
        ghost: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:text-primary-hover hover:underline',
      },
      size: {
        default: 'px-6 py-3',
        sm: 'px-4 py-2 text-label',
        lg: 'px-8 py-3.5 text-body',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
