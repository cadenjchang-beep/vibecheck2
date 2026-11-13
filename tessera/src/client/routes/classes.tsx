import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Copy, EllipsisVertical, GraduationCap, Plus, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CLASS_LIMITS, type AssignmentDto, type ClassDetail, type ClassSummary } from '@shared/classes';
import { LibraryTabs } from '@/components/library-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Avatar, EmptyState, PageLoading, ProgressBar, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { api, ApiError } from '@/lib/api';
import { endOfLocalDay, useClass, useClasses, useClassProgress, useJoinPreview, useRefreshClasses } from '@/lib/classes';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { useLibrary } from '@/lib/sets';
import { cn } from '@/lib/utils';
import NotFound from './not-found';

const optional = (label: ReactNode, t: (k: 'common.optional') => string) => (
  <>
    {label} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
  </>
);

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */

function ClassForm({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (open: boolean) => void; existing?: ClassSummary }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const refresh = useRefreshClasses();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '');
      setDescription(existing?.description ?? '');
    }
  }, [open, existing]);
  const save = useMutation({
    mutationFn: () =>
      existing
        ? api(`/api/classes/${existing.id}`, { method: 'PATCH', body: { name, description } }).then(() => ({ id: existing.id }))
        : api<{ id: string }>('/api/classes', { method: 'POST', body: { name, description } }),
    onSuccess: ({ id }) => {
      void refresh(id);
      toast.success(existing ? t('classes.saved') : t('classes.created'));
      onOpenChange(false);
      if (!existing) navigate(`/classes/${id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) save.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={existing ? t('classes.editTitle') : t('classes.newTitle')} size="sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('classes.name')}>
            {(p) => (
              <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={CLASS_LIMITS.nameMax} placeholder={t('classes.namePlaceholder')} required autoFocus dir="auto" />
            )}
          </Field>
          <Field label={optional(t('classes.description'), t)}>
            {(p) => <Textarea {...p} value={description} rows={2} onChange={(e) => setDescription(e.target.value)} maxLength={CLASS_LIMITS.descriptionMax} dir="auto" />}
          </Field>
          <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
            {existing ? t('classes.save') : t('classes.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  useEffect(() => {
    if (open) setCode('');
  }, [open]);
  const normalized = code.toUpperCase().replace(/[\s-]/g, '');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('classes.joinTitle')} size="sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalized.length >= 4) navigate(`/join/${normalized}`);
          }}
        >
          <Field label={t('classes.joinCode')} hint={t('classes.joinCodeHint')}>
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                className="font-mono text-lg tracking-widest uppercase"
              />
            )}
          </Field>
          <Button type="submit" disabled={normalized.length < 4}>
            {t('classes.find')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */

function DueLabel({ dueAt }: { dueAt: string | null }) {
  const { t, formatDate } = useI18n();
  if (!dueAt) return <span className="text-muted-foreground">{t('classes.noDue')}</span>;
  const overdue = new Date(dueAt).getTime() < Date.now();
  const date = formatDate(dueAt, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <span className={cn('inline-flex items-center gap-1', overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
      <CalendarClock className="size-4" aria-hidden="true" />
      {overdue ? t('classes.overdue', { date }) : t('classes.due', { date })}
    </span>
  );
}

function StudentAssignment({ assignment, showClass }: { assignment: AssignmentDto; showClass?: boolean }) {
  const { t } = useI18n();
  const mastery = assignment.mine?.mastery ?? 0;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Link to={`/sets/${assignment.set.id}`} className="font-bold hover:underline" dir="auto">
          {assignment.set.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {showClass ? <span className="text-muted-foreground">{t('classes.classLabel', { name: assignment.className })}</span> : null}
          <DueLabel dueAt={assignment.dueAt} />
          <span className="text-muted-foreground">{t('classes.cards', { count: assignment.set.cardCount })}</span>
        </p>
        {assignment.note ? (
          <p className="mt-1 text-sm" dir="auto">
            {assignment.note}
          </p>
        ) : null}
        <ProgressBar className="mt-2 max-w-xs" value={mastery} label={t('classes.yourMastery', { percent: mastery })} />
        <p className="mt-1 text-xs text-muted-foreground">{t('classes.yourMastery', { percent: mastery })}</p>
      </div>
      <Button asChild variant={mastery >= 100 ? 'secondary' : 'primary'}>
        <Link to={`/sets/${assignment.set.id}/learn`}>{t('classes.study')}</Link>
      </Button>
    </li>
  );
}

function ClassCard({ cls }: { cls: ClassSummary }) {
  const { t } = useI18n();
  return (
    <Link to={`/classes/${cls.id}`} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/50">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground" aria-hidden="true">
        <GraduationCap className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span dir="auto" className="truncate font-bold">
            {cls.name}
          </span>
          {cls.archived ? <Badge variant="outline">{t('classes.archived')}</Badge> : null}
        </span>
        <span className="block text-sm text-muted-foreground">
          {cls.isTeacher ? t('classes.students', { count: cls.studentCount }) : t('classes.taughtBy', { name: cls.teacher.name })} ·{' '}
          {t('classes.assignmentsCount', { count: cls.assignmentCount })}
        </span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* /classes                                                            */

export default function Classes() {
  const { t } = useI18n();
  usePageTitle(t('classes.title'));
  const user = useUser();
  const classes = useClasses();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [joining, setJoining] = useState(params.get('join') === '1');
  useEffect(() => {
    if (params.get('new') || params.get('join')) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isTeacher = user?.role === 'teacher';
  const data = classes.data;
  const nothing = data && data.teaching.length === 0 && data.enrolled.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t('sets.yourLibrary')}</h1>
        <div className="flex gap-2">
          <Button variant={isTeacher ? 'secondary' : 'primary'} onClick={() => setJoining(true)}>
            <UserPlus aria-hidden="true" />
            {t('classes.joinClass')}
          </Button>
          {isTeacher ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              {t('classes.newClass')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <LibraryTabs />
      </div>

      {classes.isPending ? (
        <Skeleton className="mt-5 h-24 rounded-2xl" />
      ) : classes.isError ? (
        <Alert variant="error" className="mt-5">
          {t('errors.generic')}
        </Alert>
      ) : nothing ? (
        <EmptyState
          className="mt-5"
          icon={<GraduationCap />}
          title={t('classes.emptyTitle')}
          description={isTeacher ? t('classes.emptyTeacher') : t('classes.emptyStudent')}
          action={isTeacher ? <Button onClick={() => setCreating(true)}>{t('classes.newClass')}</Button> : <Button onClick={() => setJoining(true)}>{t('classes.joinClass')}</Button>}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {data!.enrolled.length ? (
            <section aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="text-xl font-bold">
                {t('classes.upcoming')}
              </h2>
              {data!.upcoming.length ? (
                <ul className="mt-3 flex flex-col gap-3">
                  {data!.upcoming.map((a) => (
                    <StudentAssignment key={a.id} assignment={a} showClass />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-muted-foreground">{t('classes.upcomingEmpty')}</p>
              )}
            </section>
          ) : null}
          {[
            { key: 'teaching', title: t('classes.teaching'), items: data!.teaching },
            { key: 'enrolled', title: t('classes.enrolled'), items: data!.enrolled },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.key} aria-labelledby={`${group.key}-heading`}>
                <h2 id={`${group.key}-heading`} className="text-xl font-bold">
                  {group.title}
                </h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((cls) => (
                    <li key={cls.id}>
                      <ClassCard cls={cls} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      <ClassForm open={creating} onOpenChange={setCreating} />
      <JoinDialog open={joining} onOpenChange={setJoining} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* /classes/:id                                                        */

function AssignDialog({ cls, open, onOpenChange }: { cls: ClassDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const refresh = useRefreshClasses();
  const errorMessage = useErrorMessage();
  const mine = useLibrary('mine', '');
  const assignedIds = new Set(cls.assignments.map((a) => a.set.id));
  const options = (mine.data?.pages.flatMap((p) => p.items) ?? []).filter((s) => s.cardCount > 0 && !assignedIds.has(s.id));
  const [setId, setSetId] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setSetId('');
      setDue('');
      setNote('');
    }
  }, [open]);
  const assign = useMutation({
    mutationFn: () => api(`/api/classes/${cls.id}/assignments`, { method: 'POST', body: { setId, dueAt: endOfLocalDay(due), note } }),
    onSuccess: () => {
      void refresh(cls.id);
      toast.success(t('classes.assigned'));
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('classes.assignTitle')} size="sm">
        {mine.isPending ? (
          <Skeleton className="h-24" />
        ) : options.length === 0 ? (
          <Alert>{t('classes.assignNoSets')}</Alert>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (setId) assign.mutate();
            }}
          >
            <Field label={t('classes.assignSet')}>
              {(p) => (
                <Select {...p} value={setId} onChange={(e) => setSetId(e.target.value)} required>
                  <option value="" disabled>
                    {t('classes.assignChoose')}
                  </option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({t('classes.cards', { count: s.cardCount })})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={optional(t('classes.dueDate'), t)}>
              {(p) => <Input {...p} type="date" value={due} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDue(e.target.value)} />}
            </Field>
            <Field label={optional(t('classes.note'), t)}>
              {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={CLASS_LIMITS.noteMax} placeholder={t('classes.notePlaceholder')} dir="auto" />}
            </Field>
            <Button type="submit" loading={assign.isPending} disabled={!setId}>
              {t('classes.assignButton')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function JoinCodeBox({ cls }: { cls: ClassDetail }) {
  const { t } = useI18n();
  const refresh = useRefreshClasses();
  const errorMessage = useErrorMessage();
  const [confirm, setConfirm] = useState(false);
  const regenerate = useMutation({
    mutationFn: () => api<{ joinCode: string }>(`/api/classes/${cls.id}/code`, { method: 'POST' }),
    onSuccess: () => {
      void refresh(cls.id);
      setConfirm(false);
      toast.success(t('classes.newCodeDone'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const link = `${window.location.origin}/join/${cls.joinCode}`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="me-auto">
        <p className="text-sm font-semibold text-muted-foreground">{t('classes.codeLabel')}</p>
        <p className="font-mono text-2xl font-bold tracking-[0.2em]" data-testid="join-code">
          {cls.joinCode}
        </p>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(link).then(
            () => toast.success(t('classes.linkCopied')),
            () => toast(link),
          );
        }}
      >
        <Copy aria-hidden="true" />
        {t('classes.copyLink')}
      </Button>
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        <RefreshCw aria-hidden="true" />
        {t('classes.newCode')}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('classes.newCodeTitle')}
        description={t('classes.newCodeBody')}
        confirmLabel={t('classes.newCode')}
        loading={regenerate.isPending}
        onConfirm={() => regenerate.mutate()}
      />
    </div>
  );
}

function ProgressTable({ cls }: { cls: ClassDetail }) {
  const { t, formatDate, formatRelative } = useI18n();
  const progress = useClassProgress(cls.id, true);
  if (progress.isPending) return <Skeleton className="h-32" />;
  if (progress.isError) return <Alert variant="error">{t('errors.generic')}</Alert>;
  const { students, assignments, cells } = progress.data;
  if (students.length === 0 || assignments.length === 0) return <p className="text-muted-foreground">{t('classes.progressEmpty')}</p>;
  const average = (assignmentId: string) => Math.round(students.reduce((sum, s) => sum + (cells[s.id]?.[assignmentId]?.mastery ?? 0), 0) / students.length);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card" tabIndex={0} role="region" aria-label={t('classes.tabProgress')}>
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="px-4 pt-3 text-start text-muted-foreground">{t('classes.progressCaption')}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky start-0 bg-card px-4 py-3 text-start font-semibold">
              {t('classes.student')}
            </th>
            {assignments.map((a) => (
              <th key={a.id} scope="col" className="max-w-40 px-3 py-3 text-start align-bottom font-semibold">
                <span className="line-clamp-2" dir="auto">
                  {a.title}
                </span>
                {a.dueAt ? <span className="block text-xs font-normal text-muted-foreground">{formatDate(a.dueAt, { month: 'short', day: 'numeric' })}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              <th scope="row" className="sticky start-0 bg-card px-4 py-2.5 text-start font-medium">
                <span className="flex items-center gap-2">
                  <Avatar name={s.name} image={s.image} className="size-7 text-xs" />
                  <span dir="auto">{s.name}</span>
                </span>
              </th>
              {assignments.map((a) => {
                const cell = cells[s.id]?.[a.id];
                if (!cell || cell.started === 0) {
                  return (
                    <td key={a.id} className="px-3 py-2.5 text-muted-foreground">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">{t('classes.notStarted')}</span>
                    </td>
                  );
                }
                return (
                  <td key={a.id} className="px-3 py-2.5" title={cell.lastStudiedAt ? t('classes.lastStudied', { when: formatRelative(cell.lastStudiedAt) }) : undefined}>
                    <span className="font-semibold tabular-nums">{cell.mastery}%</span>
                    <ProgressBar className="mt-1 w-20" value={cell.mastery} label={t('classes.masteryCell', { percent: cell.mastery })} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border">
            <th scope="row" className="sticky start-0 bg-card px-4 py-2.5 text-start font-semibold">
              {t('classes.average')}
            </th>
            {assignments.map((a) => (
              <td key={a.id} className="px-3 py-2.5 font-semibold tabular-nums">
                {average(a.id)}%
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TeacherView({ cls }: { cls: ClassDetail }) {
  const { t, formatDate } = useI18n();
  const refresh = useRefreshClasses();
  const errorMessage = useErrorMessage();
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const unassign = useMutation({
    mutationFn: (id: string) => api(`/api/classes/${cls.id}/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void refresh(cls.id);
      toast.success(t('classes.unassigned'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const removeStudent = useMutation({
    mutationFn: (id: string) => api(`/api/classes/${cls.id}/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void refresh(cls.id);
      setRemoving(null);
      toast.success(t('classes.removed'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <JoinCodeBox cls={cls} />
      <Tabs defaultValue="assignments" className="mt-6">
        <TabsList>
          <TabsTrigger value="assignments">{t('classes.tabAssignments')}</TabsTrigger>
          <TabsTrigger value="progress">{t('classes.tabProgress')}</TabsTrigger>
          <TabsTrigger value="students">
            {t('classes.tabStudents')} <Badge variant="neutral">{cls.studentCount}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assignments">
          <Button onClick={() => setAssigning(true)}>
            <Plus aria-hidden="true" />
            {t('classes.assign')}
          </Button>
          {cls.assignments.length === 0 ? (
            <p className="mt-4 text-muted-foreground">{t('classes.noAssignments')}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {cls.assignments.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="min-w-0 flex-1">
                    <Link to={`/sets/${a.set.id}`} className="font-bold hover:underline" dir="auto">
                      {a.set.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm">
                      <DueLabel dueAt={a.dueAt} />
                      <span className="text-muted-foreground">{t('classes.cards', { count: a.set.cardCount })}</span>
                    </p>
                    {a.note ? (
                      <p className="mt-1 text-sm" dir="auto">
                        {a.note}
                      </p>
                    ) : null}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={t('classes.unassign', { title: a.set.title })} onClick={() => unassign.mutate(a.id)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="progress">
          <ProgressTable cls={cls} />
        </TabsContent>
        <TabsContent value="students">
          {cls.students.length === 0 ? (
            <p className="text-muted-foreground">{t('classes.noStudents')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {cls.students.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={s.name} image={s.image} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold" dir="auto">
                      {s.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('classes.joinedOn', { date: formatDate(s.joinedAt) })}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={t('classes.remove', { name: s.name })} onClick={() => setRemoving(s)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
      <AssignDialog cls={cls} open={assigning} onOpenChange={setAssigning} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('classes.removeTitle', { name: removing?.name ?? '' })}
        description={t('classes.removeBody')}
        confirmLabel={t('common.remove')}
        destructive
        loading={removeStudent.isPending}
        onConfirm={() => removing && removeStudent.mutate(removing.id)}
      />
    </>
  );
}

export function ClassPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const refresh = useRefreshClasses();
  const errorMessage = useErrorMessage();
  const query = useClass(id);
  const cls = query.data;
  usePageTitle(cls?.name ?? t('classes.title'));
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);

  const action = useMutation({
    mutationFn: (kind: 'archive' | 'restore' | 'delete' | 'leave') =>
      kind === 'delete'
        ? api(`/api/classes/${id}`, { method: 'DELETE' })
        : kind === 'leave'
          ? api(`/api/classes/${id}/leave`, { method: 'POST' })
          : api(`/api/classes/${id}`, { method: 'PATCH', body: { archived: kind === 'archive' } }),
    onSuccess: (_data, kind) => {
      void refresh(id);
      setConfirm(null);
      if (kind === 'delete' || kind === 'leave') {
        toast.success(kind === 'delete' ? t('classes.deleted') : t('classes.left'));
        navigate('/classes', { replace: true });
      } else {
        toast.success(kind === 'archive' ? t('classes.archivedDone') : t('classes.restoredDone'));
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (query.isPending) return <PageLoading />;
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
  if (!cls) return <Alert variant="error">{t('errors.generic')}</Alert>;

  return (
    <div>
      <Link to="/classes" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t('classes.back')}
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold break-words" dir="auto">
            {cls.name}
          </h1>
          {cls.description ? (
            <p className="mt-1 text-muted-foreground" dir="auto">
              {cls.description}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span>{cls.isTeacher ? t('classes.youTeach') : t('classes.taughtBy', { name: cls.teacher.name })}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-4" aria-hidden="true" />
              {t('classes.students', { count: cls.studentCount })}
            </span>
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label={t('classes.classActions')}>
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {cls.isTeacher ? (
              <>
                <MenuItem onSelect={() => setEditing(true)}>{t('classes.edit')}</MenuItem>
                <MenuItem onSelect={() => action.mutate(cls.archived ? 'restore' : 'archive')}>{cls.archived ? t('classes.restore') : t('classes.archive')}</MenuItem>
                <MenuSeparator />
                <MenuItem destructive onSelect={() => setConfirm('delete')}>
                  {t('classes.delete')}
                </MenuItem>
              </>
            ) : (
              <MenuItem destructive onSelect={() => setConfirm('leave')}>
                {t('classes.leave')}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>

      {cls.archived ? (
        <Alert variant="warning" className="mt-4">
          {t('classes.archivedNote')}
        </Alert>
      ) : null}

      <div className="mt-5">
        {cls.isTeacher ? (
          <TeacherView cls={cls} />
        ) : (
          <section aria-labelledby="assignments-heading">
            <h2 id="assignments-heading" className="text-xl font-bold">
              {t('classes.tabAssignments')}
            </h2>
            {cls.assignments.length ? (
              <ul className="mt-3 flex flex-col gap-3">
                {cls.assignments.map((a) => (
                  <StudentAssignment key={a.id} assignment={a} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted-foreground">{t('classes.noAssignmentsStudent')}</p>
            )}
          </section>
        )}
      </div>

      {cls.isTeacher ? <ClassForm open={editing} onOpenChange={setEditing} existing={cls} /> : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'delete' ? t('classes.deleteTitle') : t('classes.leaveTitle')}
        description={confirm === 'delete' ? t('classes.deleteBody') : t('classes.leaveBody')}
        confirmLabel={confirm === 'delete' ? t('classes.delete') : t('classes.leave')}
        destructive
        loading={action.isPending}
        onConfirm={() => confirm && action.mutate(confirm)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* /join/:code                                                         */

export function JoinPage() {
  const { code: raw = '' } = useParams();
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  const { t } = useI18n();
  usePageTitle(t('classes.joinTitle'));
  const navigate = useNavigate();
  const refresh = useRefreshClasses();
  const errorMessage = useErrorMessage();
  const preview = useJoinPreview(code);
  const [manual, setManual] = useState(false);
  const join = useMutation({
    mutationFn: () => api<{ id: string }>('/api/classes/join', { method: 'POST', body: { code } }),
    onSuccess: ({ id }) => {
      void refresh(id);
      toast.success(t('classes.joined', { name: preview.data?.name ?? '' }));
      navigate(`/classes/${id}`, { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (code.length < 4) return <Navigate to="/classes?join=1" replace />;
  if (preview.isPending) return <PageLoading />;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">{t('classes.joinTitle')}</h1>
      {preview.isError ? (
        <>
          <Alert variant="error" className="mt-4">
            {preview.error instanceof ApiError && preview.error.status === 404 ? t('classes.codeNotFound') : errorMessage(preview.error)}
          </Alert>
          <Button className="mt-4" variant="secondary" onClick={() => setManual(true)}>
            {t('classes.joinCode')}
          </Button>
          <JoinDialog open={manual} onOpenChange={setManual} />
        </>
      ) : (
        <section className="mt-4 rounded-3xl border border-border bg-card p-6 shadow-card" aria-labelledby="join-class-name">
          <p className="text-sm font-semibold text-muted-foreground">{t('classes.joinPreview', { teacher: preview.data.teacherName })}</p>
          <h2 id="join-class-name" className="mt-1 text-2xl font-bold" dir="auto">
            {preview.data.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('classes.students', { count: preview.data.studentCount })}</p>
          {preview.data.alreadyMember || preview.data.isTeacher ? (
            <>
              <p className="mt-4">{preview.data.isTeacher ? t('classes.youTeach') : t('classes.alreadyMember')}</p>
              <Button asChild className="mt-4 w-full">
                <Link to={`/classes/${preview.data.id}`}>{t('classes.openClass')}</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm">{t('classes.joinPrivacy')}</p>
              <Button className="mt-4 w-full" size="lg" loading={join.isPending} onClick={() => join.mutate()}>
                {t('classes.joinButton')}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
