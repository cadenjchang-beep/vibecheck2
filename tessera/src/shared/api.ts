/** Shapes that cross the HTTP boundary. Imported by both the server and the client. */
import type { ConsentStatus, Plan, ReminderChannel, Role, Stage, StudyMode, Subject, Visibility } from './constants';
import type { Entitlements } from './entitlements';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface MeUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  plan: Plan;
  consentStatus: ConsentStatus;
  onboarded: boolean;
  /** Under 13: cannot publish publicly and is hidden from shared leaderboards. */
  isChild: boolean;
  locale: string;
  timezone: string;
  dailyGoal: number;
  reminderChannel: ReminderChannel;
  reminderHour: number;
  hasPassword: boolean;
  createdAt: string;
}

export interface Features {
  googleAuth: boolean;
  ai: boolean;
  /** True when AI answers come from the built-in mock rather than a model. */
  aiMock: boolean;
  payments: 'stripe' | 'mock' | 'off';
  push: boolean;
  vapidPublicKey: string | null;
}

export interface MeResponse {
  user: MeUser | null;
  entitlements: Entitlements;
  features: Features;
}

export interface MediaRef {
  id: string;
  url: string;
}

export interface CardDto {
  id: string;
  position: number;
  /** Sanitised inline markup. Render with <RichText>, never as raw HTML. */
  term: string;
  termPlain: string;
  definition: string;
  definitionPlain: string;
  termImage: MediaRef | null;
  definitionImage: MediaRef | null;
  termAudio: MediaRef | null;
  definitionAudio: MediaRef | null;
  aiGenerated: boolean;
}

export interface OwnerDto {
  id: string;
  name: string;
  image: string | null;
}

export interface SetSummary {
  id: string;
  title: string;
  description: string;
  subject: Subject;
  termLang: string;
  definitionLang: string;
  visibility: Visibility;
  cardCount: number;
  owner: OwnerDto;
  isOwner: boolean;
  starred: boolean;
  updatedAt: string;
  createdAt: string;
  /** 0-100 for the viewer, or null when they have not studied it. */
  mastery: number | null;
  dueCount: number;
  lastStudiedAt: string | null;
}

export interface CardProgressDto {
  cardId: string;
  stage: Stage;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string | null;
  lastReviewedAt: string | null;
  correctCount: number;
  incorrectCount: number;
  streak: number;
  starred: boolean;
}

export interface SetDetail extends SetSummary {
  cards: CardDto[];
  /** The viewer's progress, keyed by card id. Empty for signed-out visitors. */
  progress: Record<string, CardProgressDto>;
  folderIds: string[];
  canEdit: boolean;
  /** Present when the viewer reaches this set through a class assignment. */
  viaClass: { id: string; name: string } | null;
  sourceSet: { id: string; title: string } | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface FolderDto {
  id: string;
  name: string;
  description: string;
  setCount: number;
  updatedAt: string;
}

export interface StudySessionDto {
  id: string;
  setId: string | null;
  setTitle: string | null;
  mode: StudyMode;
  startedAt: string;
  durationSeconds: number;
  cardsStudied: number;
  correctCount: number;
  incorrectCount: number;
  score: number | null;
}

export interface ReviewItem {
  card: CardDto;
  setId: string;
  setTitle: string;
  termLang: string;
  definitionLang: string;
  progress: CardProgressDto | null;
}

export interface ReviewQueueResponse {
  items: ReviewItem[];
  /** All cards due now, which can be more than one page of `items`. */
  dueCount: number;
}

export interface ReviewSummary {
  dueCount: number;
  sets: Array<{ setId: string; title: string; dueCount: number; cardCount: number }>;
  /** When the next card comes due, if nothing is due now. */
  nextDueAt: string | null;
}

export interface MatchScoresResponse {
  /** The viewer's own best times for this board size, fastest first. */
  personal: Array<{ timeMs: number; mistakes: number; createdAt: string }>;
  /** Fastest time per player among everyone who can see the set. `name` is null for hidden names. */
  leaders: Array<{ name: string | null; timeMs: number; isYou: boolean }>;
}

export interface DayActivity {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  cards: number;
  seconds: number;
}

export interface StatsOverview {
  streak: { current: number; longest: number };
  today: { cards: number; seconds: number; goal: number; goalMet: boolean };
  /** The last seven local days, oldest first, ending today. */
  week: DayActivity[];
  totals: { cards: number; seconds: number; daysActive: number; mastered: number; setsStudied: number };
}

export interface StatsDetailed {
  /** The last twelve weeks of days, oldest first. */
  days: DayActivity[];
  byMode: Array<{ mode: StudyMode; sessions: number; seconds: number; correct: number; incorrect: number }>;
  hardest: Array<{ cardId: string; setId: string; setTitle: string; term: string; definition: string; correct: number; incorrect: number }>;
  /** Reviews coming due on each of the next fourteen days; overdue cards count as today. */
  forecast: Array<{ day: string; due: number }>;
}

export interface CardHistory {
  progress: CardProgressDto | null;
  events: Array<{ at: string; mode: StudyMode; kind: string; correct: boolean | null; rating: number | null; stageAfter: Stage }>;
}

export interface DashboardResponse {
  overview: StatsOverview;
  review: ReviewSummary;
  recent: SetSummary[];
  starred: SetSummary[];
}

export interface FolderDetail {
  folder: FolderDto;
  sets: SetSummary[];
}

export interface SubjectCount {
  subject: Subject;
  count: number;
}
