import { Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { BUILT } from '@/lib/built';
import { useI18n } from '@/lib/i18n';
import { useEntitlements, useUser } from '@/lib/me';
import { cn } from '@/lib/utils';

/**
 * The free plan's promotion slot. Tessera shows no third-party advertising:
 * this space only ever promotes Premium, and Premium removes it.
 */
export function PromoSlot({ className }: { className?: string }) {
  const { t } = useI18n();
  const user = useUser();
  const entitlements = useEntitlements();
  if (!BUILT.upgrade || !user || entitlements.adFree || user.isChild) return null;
  return (
    <aside aria-label={t('upgrade.promoLabel')} className={cn('flex items-center gap-4 rounded-2xl border border-dashed border-input p-4', className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold" aria-hidden="true">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('upgrade.promoTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('upgrade.promoBody')}</p>
      </div>
      <Link to="/upgrade" className="shrink-0 rounded-lg text-sm font-semibold text-primary hover:underline">
        {t('upgrade.promoCta')}
      </Link>
    </aside>
  );
}
