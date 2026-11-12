import { Check } from 'lucide-react';
import { DropdownMenu as Primitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Menu = Primitive.Root;
export const MenuTrigger = Primitive.Trigger;
export const MenuGroup = Primitive.Group;

export function MenuContent({ className, sideOffset = 6, align = 'end', ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-52 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-pop data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

const item =
  'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.95rem] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-[1.1em] [&_svg]:shrink-0 [&_svg]:text-muted-foreground';

export function MenuItem({ className, destructive, ...props }: ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      className={cn(item, destructive && 'text-destructive [&_svg]:text-destructive data-[highlighted]:bg-destructive-soft', className)}
      {...props}
    />
  );
}

export function MenuRadioGroup(props: ComponentProps<typeof Primitive.RadioGroup>) {
  return <Primitive.RadioGroup {...props} />;
}

export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(item, 'ps-8', className)} {...props}>
      <span className="absolute start-3 flex size-4 items-center justify-center">
        <Primitive.ItemIndicator>
          <Check className="!text-primary" />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn('px-2.5 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}
