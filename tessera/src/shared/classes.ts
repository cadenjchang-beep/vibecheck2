import { z } from 'zod';
import type { Stage } from './constants';

export const CLASS_LIMITS = { nameMax: 80, descriptionMax: 500, noteMax: 500, studentsMax: 300, assignmentsMax: 200 } as const;

export const classInputSchema = z.object({
  name: z.string().trim().min(1).max(CLASS_LIMITS.nameMax),
  description: z.string().trim().max(CLASS_LIMITS.descriptionMax).default(''),
});

export const classUpdateSchema = z.object({
  name: z.string().trim().min(1).max(CLASS_LIMITS.nameMax).optional(),
  description: z.string().trim().max(CLASS_LIMITS.descriptionMax).optional(),
  archived: z.boolean().optional(),
});

export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((code) => code.toUpperCase().replace(/[\s-]/g, ''))
    .pipe(z.string().min(4).max(16)),
});

export const assignmentInputSchema = z.object({
  setId: z.string().min(1).max(64),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
  note: z.string().trim().max(CLASS_LIMITS.noteMax).default(''),
});

export const assignmentUpdateSchema = assignmentInputSchema.omit({ setId: true }).partial();

export interface ClassSummary {
  id: string;
  name: string;
  description: string;
  teacher: { id: string; name: string };
  isTeacher: boolean;
  studentCount: number;
  assignmentCount: number;
  archived: boolean;
  /** Only the teacher sees the code. */
  joinCode: string | null;
}

export interface AssignmentDto {
  id: string;
  classId: string;
  className: string;
  set: { id: string; title: string; cardCount: number };
  dueAt: string | null;
  note: string;
  createdAt: string;
  /** The viewer's own progress on the set, for students. */
  mine: { mastery: number; stages: Record<Stage, number>; lastStudiedAt: string | null } | null;
}

export interface ClassMemberDto {
  id: string;
  name: string;
  image: string | null;
  joinedAt: string;
}

export interface ClassDetail extends ClassSummary {
  assignments: AssignmentDto[];
  /** Listed for the teacher only. */
  students: ClassMemberDto[];
}

export interface ClassesResponse {
  teaching: ClassSummary[];
  enrolled: ClassSummary[];
  /** Assignments in the viewer's classes that are not mastered yet, soonest due first. */
  upcoming: AssignmentDto[];
}

export interface JoinPreview {
  id: string;
  name: string;
  teacherName: string;
  studentCount: number;
  alreadyMember: boolean;
  isTeacher: boolean;
}

export interface ProgressCell {
  mastery: number;
  /** Cards studied at least once. */
  started: number;
  lastStudiedAt: string | null;
}

export interface ClassProgress {
  students: ClassMemberDto[];
  assignments: Array<{ id: string; setId: string; title: string; cardCount: number; dueAt: string | null }>;
  /** cells[studentId][assignmentId] */
  cells: Record<string, Record<string, ProgressCell>>;
}
