import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive, Tabs as TabsPrimitive, ToggleGroup, Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // On touch screens an invisible margin makes the hit area finger-sized.
        'peer relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-input bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-input transition-transform data-[state=checked]:translate-x-[1.375rem] data-[state=checked]:bg-primary-foreground rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[1.375rem]" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-input bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** A labelled row with a switch or checkbox; the whole row is the hit target. */
export function ToggleRow({
  label,
  description,
  control,
  htmlFor,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  htmlFor: string;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4', className)}>
      <label htmlFor={htmlFor} className="min-w-0 flex-1 cursor-pointer py-1">
        <span className="block font-semibold">{label}</span>
        {description ? <span className="block text-sm text-muted-foreground">{description}</span> : null}
      </label>
      {control}
    </div>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 font-semibold text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-5 outline-none', className)} {...props} />;
}

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; icon?: ReactNode }>;
  'aria-label': string;
  className?: string;
  size?: 'sm' | 'md';
}

/** Single-choice segmented control (a radio group that looks like tabs). */
export function Segmented<T extends string>({ value, onValueChange, options, className, size = 'md', ...props }: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-secondary p-1', className)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 font-semibold text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-card [&_svg]:size-4',
            size === 'sm' ? 'h-8 text-sm pointer-coarse:h-11' : 'h-9 text-[0.95rem] pointer-coarse:h-11',
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children, side }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-xs rounded-lg bg-foreground px-2.5 py-1.5 text-sm font-medium text-background shadow-raised data-[state=delayed-open]:animate-fade-in"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
