import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/50 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

export function Input({ className, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, 'h-11 px-3.5 text-base', className)} {...props} />;
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 px-3.5 py-2.5 text-base', className)} {...props} />;
}

/** A native select: the most reliable picker on phones and with assistive technology. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        control,
        'h-11 appearance-none bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat ps-3.5 pe-9 text-base rtl:bg-[position:left_0.75rem_center]',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23807a85' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** Receives the ids to wire up: `id`, `aria-describedby`, `aria-invalid`. */
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/** Label, control, hint and error wired together for screen readers. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
