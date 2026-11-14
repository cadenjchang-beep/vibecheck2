import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const t = useT();
  return (
    <span role="status" className="inline-flex items-center">
      <LoaderCircle className={cn('size-5 animate-spin text-muted-foreground', className)} aria-hidden="true" />
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton', className)} {...props} />;
}

export function PageLoading() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

interface ProgressBarProps {
  /** 0 to 100 */
  value: number;
  label: string;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, label, className, barClassName }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-secondary', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-[width] duration-300', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const alertVariants = cva('flex gap-3 rounded-xl px-4 py-3 text-[0.95rem] [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0', {
  variants: {
    variant: {
      info: 'bg-info-soft text-info-soft-foreground',
      success: 'bg-success-soft text-success-soft-foreground',
      warning: 'bg-warning-soft text-warning-soft-foreground',
      error: 'bg-destructive-soft text-destructive-soft-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

const alertIcons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: ReactNode;
  action?: ReactNode;
}

export function Alert({ variant = 'info', title, action, className, children, ...props }: AlertProps) {
  const Icon = alertIcons[variant ?? 'info'];
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Heading level for the title; use 1 when this is the whole page. */
  level?: 1 | 2 | 3;
}

/** Explains what belongs here and offers the one action that fills it. */
export function EmptyState({ icon, title, description, action, className, level = 2 }: EmptyStateProps) {
  const Heading = `h${level}` as 'h1' | 'h2' | 'h3';
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border border-dashed border-input px-6 py-12 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground [&_svg]:size-7" aria-hidden="true">
        {icon}
      </div>
      <Heading className="mt-4 text-xl font-bold">{title}</Heading>
      {description ? <p className="mt-1.5 max-w-md text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0]?.[0] ?? '?')).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-sm font-bold text-primary-soft-foreground',
        className,
      )}
    >
      {/* Initials are drawn by CSS: decorative, so not part of any control's visible label. */}
      {image ? (
        <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span data-initials={letters} className="before:content-[attr(data-initials)]" />
      )}
    </span>
  );
}
