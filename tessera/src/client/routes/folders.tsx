import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Folder, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { FolderDetail } from '@shared/api';
import { LIMITS } from '@shared/constants';
import { useFolders } from '@/components/folder-picker';
import { LibraryTabs } from '@/components/library-tabs';
import { SetCard, SetGrid } from '@/components/set-card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, PageLoading, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { keys } from '@/lib/query';
import { useLibrary } from '@/lib/sets';
import NotFound from './not-found';

function FolderForm({ open, onOpenChange, folder }: { open: boolean; onOpenChange: (open: boolean) => void; folder?: { id: string; name: string; description: string } }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState(folder?.name ?? '');
  const [description, setDescription] = useState(folder?.description ?? '');
  useEffect(() => {
    if (open) {
      setName(folder?.name ?? '');
      setDescription(folder?.description ?? '');
    }
  }, [open, folder]);
  const save = useMutation({
    mutationFn: () =>
      folder
        ? api<{ ok: true }>(`/api/folders/${folder.id}`, { method: 'PATCH', body: { name, description } }).then(() => ({ id: folder.id }))
        : api<{ id: string }>('/api/folders', { method: 'POST', body: { name, description } }),
    onSuccess: ({ id }) => {
      void client.invalidateQueries({ queryKey: keys.folders });
      void client.invalidateQueries({ queryKey: keys.folder(id) });
      toast.success(folder ? t('folders.saved') : t('folders.created'));
      onOpenChange(false);
      if (!folder) navigate(`/folders/${id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) save.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={folder ? t('folders.renameTitle') : t('folders.newTitle')} size="sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('folders.name')}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.folderNameMax} placeholder={t('folders.namePlaceholder')} autoFocus required dir="auto" />}
          </Field>
          <Field label={<>{t('folders.description')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></>}>
            {(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} dir="auto" />}
          </Field>
          <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
            {folder ? t('folders.save') : t('folders.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Folders() {
  const { t } = useI18n();
  usePageTitle(t('folders.title'));
  const folders = useFolders();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  useEffect(() => {
    if (params.get('new')) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t('sets.yourLibrary')}</h1>
        <Button onClick={() => setCreating(true)}>
          <FolderPlus aria-hidden="true" />
          {t('folders.new')}
        </Button>
      </div>
      <div className="mt-4">
        <LibraryTabs />
      </div>
      <div className="mt-5">
        {folders.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : folders.data?.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {folders.data.map((folder) => (
              <li key={folder.id}>
                <Link to={`/folders/${folder.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/50">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground" aria-hidden="true">
                    <Folder className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span dir="auto" className="block truncate font-bold">
                      {folder.name}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('folders.setCount', { count: folder.setCount })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Folder />} title={t('folders.emptyTitle')} description={t('folders.emptyBody')} action={<Button onClick={() => setCreating(true)}>{t('folders.new')}</Button>} />
        )}
      </div>
      <FolderForm open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function AddSets({ folder, open, onOpenChange }: { folder: FolderDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const mine = useLibrary('mine', '');
  const sets = mine.data?.pages.flatMap((p) => p.items) ?? [];
  const inFolder = new Set(folder.sets.map((s) => s.id));
  const toggle = useMutation({
    mutationFn: ({ setId, add }: { setId: string; add: boolean }) => api(`/api/folders/${folder.folder.id}/sets/${setId}`, { method: add ? 'PUT' : 'DELETE' }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.folder(folder.folder.id) });
      void client.invalidateQueries({ queryKey: keys.folders });
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('folders.addSetsTitle', { name: folder.folder.name })} footer={<Button onClick={() => onOpenChange(false)}>{t('common.done')}</Button>}>
        {sets.length === 0 ? (
          <p className="text-muted-foreground">{t('folders.noSetsToAdd')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sets.map((set) => (
              <li key={set.id} className="flex min-h-11 items-center gap-3">
                <Checkbox id={`add-${set.id}`} checked={inFolder.has(set.id)} onCheckedChange={(checked) => toggle.mutate({ setId: set.id, add: checked === true })} />
                <label htmlFor={`add-${set.id}`} dir="auto" className="min-w-0 flex-1 cursor-pointer truncate font-semibold">
                  {set.title}
                </label>
                <span className="text-sm text-muted-foreground">{t('common.termCount', { count: set.cardCount })}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FolderPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const folder = useQuery({ queryKey: keys.folder(id), queryFn: ({ signal }) => api<FolderDetail>(`/api/folders/${id}`, { signal }) });
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  usePageTitle(folder.data?.folder.name);

  const remove = useMutation({
    mutationFn: (setId: string) => api(`/api/folders/${id}/sets/${setId}`, { method: 'DELETE' }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.folder(id) });
      void client.invalidateQueries({ queryKey: keys.folders });
    },
  });
  const deleteFolder = async () => {
    const name = folder.data!.folder.name;
    try {
      await api(`/api/folders/${id}`, { method: 'DELETE' });
      void client.invalidateQueries({ queryKey: keys.folders });
      navigate('/folders', { replace: true });
      toast(t('folders.deleted', { name }), {
        duration: 10_000,
        action: {
          label: t('common.undo'),
          onClick: () =>
            void api(`/api/folders/${id}/restore`, { method: 'POST', body: {} }).then(() => {
              void client.invalidateQueries({ queryKey: keys.folders });
              toast.success(t('folders.restored'));
            }),
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (folder.isPending) return <PageLoading />;
  if (folder.isError) return <NotFound />;
  const data = folder.data;
  return (
    <div>
      <Link to="/folders" className="text-sm font-semibold text-primary hover:underline">
        {t('folders.title')}
      </Link>
      <div className="mt-1 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 dir="auto" className="text-3xl font-extrabold break-words">
            {data.folder.name}
          </h1>
          {data.folder.description ? (
            <p dir="auto" className="mt-1 text-muted-foreground">
              {data.folder.description}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">{t('folders.setCount', { count: data.sets.length })}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          {t('folders.addSets')}
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label={t('common.more')}>
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden="true" />
              {t('folders.rename')}
            </MenuItem>
            <MenuItem destructive onSelect={() => void deleteFolder()}>
              <Trash2 aria-hidden="true" />
              {t('folders.delete')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {data.sets.length === 0 ? (
        <EmptyState className="mt-6" icon={<Folder />} title={t('folders.emptyFolderTitle')} description={t('folders.emptyFolderBody')} action={<Button onClick={() => setAdding(true)}>{t('folders.addSets')}</Button>} />
      ) : (
        <SetGrid className="mt-6">
          {data.sets.map((set) => (
            <li key={set.id} className="relative">
              <SetCard set={set} className="h-full" />
              <Button
                variant="secondary"
                size="icon-sm"
                className="absolute end-2 bottom-2"
                aria-label={t('folders.remove', { title: set.title })}
                onClick={() => remove.mutate(set.id)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </SetGrid>
      )}
      <AddSets folder={data} open={adding} onOpenChange={setAdding} />
      <FolderForm open={renaming} onOpenChange={setRenaming} folder={data.folder} />
    </div>
  );
}
