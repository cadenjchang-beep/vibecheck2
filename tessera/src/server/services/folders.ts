import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FolderDetail, FolderDto } from '@shared/api';
import { db } from '../db/client';
import { folders, setFolderLinks } from '../db/schema';
import type { Viewer } from '../http/context';
import { notFound } from '../http/errors';
import { newId } from '../ids';
import { loadViewableSet, viewableSetCondition } from './policies';
import { selectSetSummaries } from './sets';

async function loadFolder(viewer: Viewer, id: string, includeDeleted = false) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.ownerId, viewer.id), includeDeleted ? undefined : isNull(folders.deletedAt)))
    .limit(1);
  // Folders are private to their owner: anyone else is told it does not exist.
  if (!folder) throw notFound();
  return folder;
}

export async function listFolders(viewer: Viewer): Promise<FolderDto[]> {
  const rows = await db.execute<{ id: string; name: string; description: string; updated_at: Date; set_count: number }>(sql`
    select f.id, f.name, f.description, f.updated_at,
           (select count(*)::int from set_folder_links l join sets s on s.id = l.set_id
             where l.folder_id = f.id and ${viewableSetCondition(viewer.id)}) as set_count
    from folders f
    where f.owner_id = ${viewer.id} and f.deleted_at is null
    order by f.name asc
  `);
  return rows.rows.map((r) => ({ id: r.id, name: r.name, description: r.description, setCount: r.set_count, updatedAt: new Date(r.updated_at).toISOString() }));
}

export async function createFolder(viewer: Viewer, input: { name: string; description?: string }): Promise<string> {
  const id = newId();
  await db.insert(folders).values({ id, ownerId: viewer.id, name: input.name, description: input.description ?? '' });
  return id;
}

export async function updateFolder(viewer: Viewer, id: string, input: { name?: string; description?: string }): Promise<void> {
  await loadFolder(viewer, id);
  await db.update(folders).set({ ...input, updatedAt: new Date() }).where(eq(folders.id, id));
}

export async function deleteFolder(viewer: Viewer, id: string): Promise<void> {
  await loadFolder(viewer, id);
  await db.update(folders).set({ deletedAt: new Date() }).where(eq(folders.id, id));
}

export async function restoreFolder(viewer: Viewer, id: string): Promise<void> {
  await loadFolder(viewer, id, true);
  await db.update(folders).set({ deletedAt: null }).where(eq(folders.id, id));
}

export async function getFolder(viewer: Viewer, id: string): Promise<FolderDetail> {
  const folder = await loadFolder(viewer, id);
  const sets = await selectSetSummaries({
    viewerId: viewer.id,
    where: sql`exists (select 1 from set_folder_links l where l.folder_id = ${id} and l.set_id = s.id) and ${viewableSetCondition(viewer.id)}`,
    orderBy: sql`s.title asc`,
    limit: 500,
  });
  return {
    folder: { id: folder.id, name: folder.name, description: folder.description, setCount: sets.length, updatedAt: folder.updatedAt.toISOString() },
    sets: sets.map(({ sortKey: _k, ...rest }) => rest),
  };
}

/** Puts a set in exactly these folders of the viewer's (and takes it out of their others). */
export async function setFoldersForSet(viewer: Viewer, setId: string, folderIds: string[]): Promise<void> {
  await loadViewableSet(viewer, setId);
  const mine = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.ownerId, viewer.id), isNull(folders.deletedAt)));
  const mineIds = mine.map((f) => f.id);
  const wanted = folderIds.filter((id) => mineIds.includes(id));
  await db.transaction(async (tx) => {
    if (mineIds.length > 0) await tx.delete(setFolderLinks).where(and(eq(setFolderLinks.setId, setId), inArray(setFolderLinks.folderId, mineIds)));
    if (wanted.length > 0) await tx.insert(setFolderLinks).values(wanted.map((folderId) => ({ folderId, setId })));
    if (wanted.length > 0) await tx.update(folders).set({ updatedAt: new Date() }).where(inArray(folders.id, wanted));
  });
}

export async function addSetToFolder(viewer: Viewer, folderId: string, setId: string): Promise<void> {
  await loadFolder(viewer, folderId);
  await loadViewableSet(viewer, setId);
  await db.insert(setFolderLinks).values({ folderId, setId }).onConflictDoNothing();
  await db.update(folders).set({ updatedAt: new Date() }).where(eq(folders.id, folderId));
}

export async function removeSetFromFolder(viewer: Viewer, folderId: string, setId: string): Promise<void> {
  await loadFolder(viewer, folderId);
  await db.delete(setFolderLinks).where(and(eq(setFolderLinks.folderId, folderId), eq(setFolderLinks.setId, setId)));
}
