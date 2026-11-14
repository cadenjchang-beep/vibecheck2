import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { FolderDto, SetDetail } from '@shared/api';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage } from '@/lib/me';
import { keys } from '@/lib/query';
import { Button } from './ui/button';
import { Checkbox } from './ui/controls';
import { Dialog, DialogContent } from './ui/dialog';
import { Spinner } from './ui/feedback';

export const useFolders = (enabled = true) =>
  useQuery({ queryKey: keys.folders, queryFn: ({ signal }) => api<FolderDto[]>('/api/folders', { signal }), enabled });

/** Chooses which of your folders a set belongs in. */
export function FolderPicker({ set, open, onOpenChange }: { set: SetDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const folders = useFolders(open);
  const [chosen, setChosen] = useState<string[]>(set.folderIds);
  useEffect(() => {
    if (open) setChosen(set.folderIds);
  }, [open, set.folderIds]);

  const save = useMutation({
    mutationFn: () => api(`/api/sets/${set.id}/folders`, { method: 'PUT', body: { folderIds: chosen } }),
    onSuccess: () => {
      client.setQueryData<SetDetail>(keys.set(set.id), (old) => (old ? { ...old, folderIds: chosen } : old));
      void client.invalidateQueries({ queryKey: keys.folders });
      void client.invalidateQueries({ queryKey: ['folder'] });
      toast.success(t('folders.chooseSaved'));
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('folders.chooseTitle')}
        description={t('folders.chooseBody')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={save.isPending} disabled={!folders.data?.length} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {folders.isPending ? (
          <Spinner />
        ) : folders.data?.length ? (
          <ul className="flex flex-col gap-1">
            {folders.data.map((folder) => (
              <li key={folder.id} className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id={`pick-${folder.id}`}
                  checked={chosen.includes(folder.id)}
                  onCheckedChange={(checked) => setChosen((c) => (checked === true ? [...c, folder.id] : c.filter((id) => id !== folder.id)))}
                />
                <label htmlFor={`pick-${folder.id}`} dir="auto" className="flex-1 cursor-pointer font-semibold">
                  {folder.name}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground">{t('folders.chooseNone')}</p>
            <Button asChild variant="secondary">
              <Link to="/folders?new=1">{t('folders.new')}</Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
