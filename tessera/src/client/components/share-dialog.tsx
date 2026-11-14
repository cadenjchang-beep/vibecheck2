import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Globe, Link2, Lock, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { SetDetail } from '@shared/api';
import type { Visibility } from '@shared/constants';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useUser } from '@/lib/me';
import { keys } from '@/lib/query';
import { invalidateSetLists } from '@/lib/sets';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Alert } from './ui/feedback';
import { Input } from './ui/input';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Who can see the set (owner only), and the link to send. */
export function ShareDialog({ set, open, onOpenChange }: { set: SetDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const user = useUser();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState<Visibility | null>(null);
  const url = `${window.location.origin}/sets/${set.id}`;

  const options: Array<{ value: Visibility; icon: typeof Lock; title: string; hint: string; disabled?: boolean }> = [
    { value: 'private', icon: Lock, title: t('sets.visibilityPrivate'), hint: t('sets.visibilityPrivateHint') },
    { value: 'unlisted', icon: Link2, title: t('sets.visibilityUnlisted'), hint: t('sets.visibilityUnlistedHint') },
    { value: 'public', icon: Globe, title: t('sets.visibilityPublic'), hint: t('sets.visibilityPublicHint'), disabled: Boolean(user?.isChild) },
  ];

  const change = async (visibility: Visibility) => {
    if (visibility === set.visibility) return;
    setSaving(visibility);
    try {
      await api(`/api/sets/${set.id}`, { method: 'PATCH', body: { visibility } });
      client.setQueryData<SetDetail>(keys.set(set.id), (old) => (old ? { ...old, visibility } : old));
      void invalidateSetLists(client);
      toast.success(t('sets.shareSaved'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('sets.shareTitle')}>
        <div className="flex flex-col gap-5">
          {set.canEdit ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('sets.visibility')}</legend>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('sets.visibility')}>
                {options
                  .filter((o) => !o.disabled || set.visibility === o.value)
                  .map(({ value, icon: Icon, title, hint }) => {
                    const selected = set.visibility === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={saving !== null}
                        onClick={() => void change(value)}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border p-3 text-start transition-colors',
                          selected ? 'border-primary bg-primary-soft' : 'border-input hover:bg-accent',
                        )}
                      >
                        <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{title}</span>
                          <span className={cn('block text-sm', selected ? 'text-primary-soft-foreground' : 'text-muted-foreground')}>{hint}</span>
                        </span>
                        {selected ? <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
              </div>
            </fieldset>
          ) : null}

          {set.canEdit && set.visibility === 'private' ? <Alert variant="info">{t('sets.sharePrivateNote')}</Alert> : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="share-link" className="text-sm font-semibold">
              {t('sets.shareLink')}
            </label>
            <div className="flex gap-2">
              <Input id="share-link" readOnly value={url} dir="ltr" onFocus={(e) => e.target.select()} className="min-w-0 flex-1" />
              <Button variant="secondary" onClick={copy} aria-live="polite">
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? t('sets.shareCopied') : t('sets.shareCopy')}
              </Button>
            </div>
          </div>
          {typeof navigator.share === 'function' ? (
            <Button variant="secondary" onClick={() => void navigator.share({ title: set.title, url }).catch(() => undefined)}>
              <Share2 aria-hidden="true" />
              {t('common.share')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
