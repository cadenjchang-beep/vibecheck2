import { cn } from '@/lib/utils';

/** The Tessera mark: four mosaic tiles, the last one being set into place. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="12.5" height="12.5" rx="3.4" className="fill-primary" />
      <rect x="2" y="17.5" width="12.5" height="12.5" rx="3.4" className="fill-primary" opacity="0.55" />
      <rect x="17.5" y="17.5" width="12.5" height="12.5" rx="3.4" className="fill-primary" opacity="0.8" />
      <rect x="18.2" y="1.2" width="12.5" height="12.5" rx="3.4" className="fill-gold" transform="rotate(9 24.45 7.45)" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-xl font-extrabold tracking-tight', className)}>
      <LogoMark className={markClassName} />
      <span>Tessera</span>
    </span>
  );
}
