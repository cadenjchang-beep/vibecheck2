import { X } from 'lucide-react';
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';

const overlay = 'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in';
// A bottom sheet on phones, a centred panel from the `sm` breakpoint up.
const panel =
  'fixed z-50 flex max-h-[92dvh] w-full flex-col bg-popover text-popover-foreground shadow-pop outline-none data-[state=open]:animate-rise ' +
  'inset-x-0 bottom-0 rounded-t-3xl pb-safe ' +
  'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-0';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const sizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export function DialogContent({ title, description, size = 'md', footer, className, children, ...props }: DialogContentProps) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn(panel, sizes[size], className)}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="font-display text-xl font-bold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('common.close')} className="-me-2 -mt-1">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

/** A blocking confirmation for actions that cannot simply be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlay} />
        <AlertPrimitive.Content className={cn(panel, 'sm:max-w-md')}>
          <div className="px-5 pt-6 sm:px-6">
            <AlertPrimitive.Title className="font-display text-xl font-bold">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description className="mt-2 text-muted-foreground">{description}</AlertPrimitive.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 px-5 py-5 sm:flex-row sm:justify-end sm:px-6">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary">{cancelLabel ?? t('common.cancel')}</Button>
            </AlertPrimitive.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              loading={loading}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
