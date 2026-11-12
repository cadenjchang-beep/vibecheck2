import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        neutral: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary-soft text-primary-soft-foreground',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        destructive: 'bg-destructive-soft text-destructive-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
