import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CardDto, Page, SetDetail, SetSummary } from '@shared/api';
import type { SetInput } from '@shared/schemas';
import { api } from './api';
import { useI18n } from './i18n';
import { useErrorMessage } from './me';
import { keys } from './query';

export type LibraryScope = 'mine' | 'starred' | 'recent' | 'studied';

export function useSet(id: string | undefined) {
  return useQuery({
    queryKey: keys.set(id ?? ''),
    queryFn: ({ signal }) => api<SetDetail>(`/api/sets/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

export function useLibrary(scope: LibraryScope, q: string) {
  return useInfiniteQuery({
    queryKey: [...keys.sets(scope), q],
    queryFn: ({ pageParam, signal }) => api<Page<SetSummary>>('/api/sets', { query: { scope, q, cursor: pageParam }, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Lists that show sets; refreshed whenever a set is created, changed or removed. */
export function invalidateSetLists(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['sets'] }),
    client.invalidateQueries({ queryKey: keys.dashboard }),
    client.invalidateQueries({ queryKey: keys.folders }),
    client.invalidateQueries({ queryKey: ['folder'] }),
    client.invalidateQueries({ queryKey: ['search'] }),
  ]);
}

export function useSaveSet(id: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetInput) => api<SetDetail>(id ? `/api/sets/${id}` : '/api/sets', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: (set) => {
      client.setQueryData(keys.set(set.id), set);
      void invalidateSetLists(client);
    },
  });
}

/** Deletes a set straight away and offers to undo it from the toast. */
export function useDeleteSet() {
  const client = useQueryClient();
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: (set: Pick<SetSummary, 'id' | 'title'>) => api(`/api/sets/${set.id}`, { method: 'DELETE' }),
    onSuccess: (_data, set) => {
      client.removeQueries({ queryKey: keys.set(set.id) });
      void invalidateSetLists(client);
      toast(t('sets.deleted', { title: set.title }), {
        duration: 10_000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            api(`/api/sets/${set.id}/restore`, { method: 'POST', body: {} }).then(
              () => {
                void invalidateSetLists(client);
                toast.success(t('sets.restored'));
              },
              (err) => toast.error(errorMessage(err)),
            );
          },
        },
      });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDuplicateSet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api<{ id: string }>(`/api/sets/${id}/duplicate`, { method: 'POST', body: { title } }),
    onSuccess: () => invalidateSetLists(client),
  });
}

/** Optimistically flips the star on a set, in the detail view and every list. */
export function useStarSet() {
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api(`/api/sets/${id}/star`, { method: 'PUT', body: { starred } }),
    onMutate: ({ id, starred }) => {
      const previous = client.getQueryData<SetDetail>(keys.set(id));
      if (previous) client.setQueryData<SetDetail>(keys.set(id), { ...previous, starred });
      return { previous };
    },
    onError: (err, { id }, context) => {
      if (context?.previous) client.setQueryData(keys.set(id), context.previous);
      toast.error(errorMessage(err));
    },
    onSettled: () => invalidateSetLists(client),
  });
}

export function useStarCard(setId: string) {
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: ({ cardId, starred }: { cardId: string; starred: boolean }) =>
      api(`/api/cards/${cardId}/star`, { method: 'PUT', body: { starred } }),
    onMutate: ({ cardId, starred }) => {
      const previous = client.getQueryData<SetDetail>(keys.set(setId));
      if (previous) {
        const existing = previous.progress[cardId];
        client.setQueryData<SetDetail>(keys.set(setId), {
          ...previous,
          progress: {
            ...previous.progress,
            [cardId]: existing
              ? { ...existing, starred }
              : {
                  cardId,
                  stage: 'new',
                  easeFactor: 2.5,
                  intervalDays: 0,
                  repetitions: 0,
                  lapses: 0,
                  dueAt: null,
                  lastReviewedAt: null,
                  correctCount: 0,
                  incorrectCount: 0,
                  streak: 0,
                  starred,
                },
          },
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) client.setQueryData(keys.set(setId), context.previous);
      toast.error(errorMessage(err));
    },
  });
}

/** A card can be studied once it has something on both sides. */
export function isStudyable(card: CardDto): boolean {
  return Boolean((card.termPlain || card.termImage) && (card.definitionPlain || card.definitionImage));
}
