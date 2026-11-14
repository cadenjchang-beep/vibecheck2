import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useFeatures } from '@/lib/me';

/** Shown on every page of a preview deployment, so nobody mistakes it for the real thing. */
export function PreviewBanner() {
  const { t } = useI18n();
  if (useFeatures()?.environment !== 'preview') return null;
  return (
    <div className="no-print flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-sm font-semibold text-warning-soft-foreground">
      <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
      <span>{t('common.previewBanner')}</span>
    </div>
  );
}
