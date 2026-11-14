import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

// ── Accounts ─────────────────────────────────────────────────────────────────
// `users`, `sessions`, `accounts` and `verifications` are the tables Better Auth
// reads and writes. Property names follow its field names; columns are snake_case.

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),

    role: text('role').notNull().default('student'),
    plan: text('plan').notNull().default('free'),
    planExpiresAt: ts('plan_expires_at'),
    /** Month and year only: enough for the age gate, less than a full birth date. */
    birthYear: smallint('birth_year'),
    birthMonth: smallint('birth_month'),
    consentStatus: text('consent_status').notNull().default('unknown'),
    onboardedAt: ts('onboarded_at'),
    locale: text('locale').notNull().default('en'),
    timezone: text('timezone').notNull().default('UTC'),
    /** Cards per day; 0 switches the goal off. */
    dailyGoal: integer('daily_goal').notNull().default(20),
    reminderChannel: text('reminder_channel').notNull().default('off'),
    /** Local hour (0-23) at which a reminder may be sent. */
    reminderHour: smallint('reminder_hour').notNull().default(18),
    lastReminderDay: date('last_reminder_day'),
    stripeCustomerId: text('stripe_customer_id'),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    index('users_reminder_idx').on(t.reminderChannel, t.reminderHour).where(sql`${t.reminderChannel} <> 'off'`),
    check('users_role_check', sql`${t.role} in ('student', 'teacher')`),
    check('users_plan_check', sql`${t.plan} in ('free', 'premium')`),
    check('users_consent_check', sql`${t.consentStatus} in ('unknown', 'not_required', 'pending', 'granted')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: ts('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('sessions_token_key').on(t.token), index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    /** Scrypt hash for the email/password provider; never a plain password. */
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('accounts_user_idx').on(t.userId),
    uniqueIndex('accounts_provider_account_key').on(t.providerId, t.accountId),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/** One pending or decided approval from a parent or guardian of an under-13 user. */
export const parentalConsents = pgTable(
  'parental_consents',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentEmail: text('parent_email').notNull(),
    /** SHA-256 of the emailed token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    decidedAt: ts('decided_at'),
  },
  (t) => [
    uniqueIndex('parental_consents_token_key').on(t.tokenHash),
    index('parental_consents_user_idx').on(t.userId),
    check('parental_consents_status_check', sql`${t.status} in ('pending', 'granted', 'declined')`),
  ],
);

// ── Content ──────────────────────────────────────────────────────────────────

export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('media_owner_idx').on(t.ownerId), check('media_kind_check', sql`${t.kind} in ('image', 'audio')`)],
);

export const sets = pgTable(
  'sets',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    subject: text('subject').notNull().default('other'),
    termLang: text('term_lang').notNull().default('en'),
    definitionLang: text('definition_lang').notNull().default('en'),
    visibility: text('visibility').notNull().default('private'),
    cardCount: integer('card_count').notNull().default(0),
    /** Plain text of every term, kept in step with the cards so search needs one table. */
    termsText: text('terms_text').notNull().default(''),
    /** Set this one was duplicated from, if any. */
    sourceSetId: text('source_set_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Soft delete: lets a deletion be undone, purged later by the cleanup job. */
    deletedAt: ts('deleted_at'),
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple', ${sets.title}), 'A') || setweight(to_tsvector('simple', replace(${sets.subject}, '-', ' ')), 'B') || setweight(to_tsvector('simple', ${sets.description}), 'C') || setweight(to_tsvector('simple', left(${sets.termsText}, 100000)), 'D')`,
    ),
  },
  (t) => [
    index('sets_owner_idx').on(t.ownerId, t.updatedAt.desc()),
    // Full-text search over title, subject, description and terms.
    index('sets_search_idx').using('gin', t.searchTsv),
    // Typo-tolerant and prefix title matching.
    index('sets_title_trgm_idx').using('gin', t.title.op('gin_trgm_ops')),
    // Browse-by-subject listing of public sets.
    index('sets_public_subject_idx')
      .on(t.subject, t.updatedAt.desc())
      .where(sql`${t.visibility} = 'public' and ${t.deletedAt} is null`),
    index('sets_deleted_idx').on(t.deletedAt).where(sql`${t.deletedAt} is not null`),
    check('sets_visibility_check', sql`${t.visibility} in ('private', 'unlisted', 'public')`),
  ],
);

export const cards = pgTable(
  'cards',
  {
    id: text('id').primaryKey(),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** Sanitised inline markup (see shared/richtext). */
    term: text('term').notNull(),
    termPlain: text('term_plain').notNull(),
    definition: text('definition').notNull(),
    definitionPlain: text('definition_plain').notNull(),
    termImageId: text('term_image_id').references(() => media.id, { onDelete: 'set null' }),
    definitionImageId: text('definition_image_id').references(() => media.id, { onDelete: 'set null' }),
    termAudioId: text('term_audio_id').references(() => media.id, { onDelete: 'set null' }),
    definitionAudioId: text('definition_audio_id').references(() => media.id, { onDelete: 'set null' }),
    aiGenerated: boolean('ai_generated').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('cards_set_position_idx').on(t.setId, t.position),
    // Media access checks look a file up by the cards that reference it.
    index('cards_term_image_idx').on(t.termImageId).where(sql`${t.termImageId} is not null`),
    index('cards_definition_image_idx').on(t.definitionImageId).where(sql`${t.definitionImageId} is not null`),
    index('cards_term_audio_idx').on(t.termAudioId).where(sql`${t.termAudioId} is not null`),
    index('cards_definition_audio_idx').on(t.definitionAudioId).where(sql`${t.definitionAudioId} is not null`),
  ],
);

/** Cached AI-written wrong answers for multiple choice, invalidated when the card changes. */
export const cardDistractors = pgTable('card_distractors', {
  cardId: text('card_id')
    .primaryKey()
    .references(() => cards.id, { onDelete: 'cascade' }),
  /** Hash of the card content the options were written for. */
  sourceHash: text('source_hash').notNull(),
  definitionOptions: jsonb('definition_options').$type<string[]>().notNull(),
  termOptions: jsonb('term_options').$type<string[]>().notNull(),
  createdAt: createdAt(),
});

export const folders = pgTable(
  'folders',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('folders_owner_idx').on(t.ownerId, t.updatedAt.desc())],
);

export const setFolderLinks = pgTable(
  'set_folder_links',
  {
    folderId: text('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'cascade' }),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    addedAt: ts('added_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.folderId, t.setId] }), index('set_folder_links_set_idx').on(t.setId)],
);

/** A user's relationship with a set: favourite flag and recency for the dashboard. */
export const setUserState = pgTable(
  'set_user_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    starred: boolean('starred').notNull().default(false),
    lastOpenedAt: ts('last_opened_at'),
    lastStudiedAt: ts('last_studied_at'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.setId] }),
    index('set_user_state_recent_idx').on(t.userId, t.lastOpenedAt.desc()),
    index('set_user_state_starred_idx').on(t.userId).where(sql`${t.starred}`),
  ],
);

// ── Studying ─────────────────────────────────────────────────────────────────

export const studySessions = pgTable(
  'study_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null for the cross-set review queue, or once the set has been deleted. */
    setId: text('set_id').references(() => sets.id, { onDelete: 'set null' }),
    mode: text('mode').notNull(),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at').notNull(),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    cardsStudied: integer('cards_studied').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    /** Percentage for scored modes (test), otherwise null. */
    score: real('score'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    /** Generated on the device so a session recorded offline is stored once. */
    clientId: text('client_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('study_sessions_client_key').on(t.userId, t.clientId),
    index('study_sessions_user_idx').on(t.userId, t.startedAt.desc()),
    index('study_sessions_set_idx').on(t.setId, t.userId),
    check(
      'study_sessions_mode_check',
      sql`${t.mode} in ('flashcards', 'learn', 'test', 'match', 'review', 'listen')`,
    ),
  ],
);

/** Per user, per card: mastery stage, spaced-repetition schedule, counts and star. */
export const cardProgress = pgTable(
  'card_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull().default('new'),
    easeFactor: real('ease_factor').notNull().default(2.5),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** Next review; null until the card has been studied once. */
    dueAt: ts('due_at'),
    lastReviewedAt: ts('last_reviewed_at'),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    starred: boolean('starred').notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    // The daily review queue: "what is due for this user, oldest first".
    index('card_progress_due_idx').on(t.userId, t.dueAt).where(sql`${t.dueAt} is not null`),
    index('card_progress_set_idx').on(t.userId, t.setId),
    check('card_progress_stage_check', sql`${t.stage} in ('new', 'learning', 'familiar', 'mastered')`),
  ],
);

/** Append-only history of every answer and rating; the source for per-card history. */
export const reviewLogs = pgTable(
  'review_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    /** mc | written | tf | matching | flashcard | rating */
    kind: text('kind').notNull(),
    correct: boolean('correct'),
    /** 1 again, 2 hard, 3 good, 4 easy; only for spaced-repetition ratings. */
    rating: smallint('rating'),
    stageAfter: text('stage_after').notNull(),
    intervalAfter: integer('interval_after').notNull().default(0),
    easeAfter: real('ease_after').notNull().default(2.5),
    reviewedAt: ts('reviewed_at').notNull(),
    /** Generated on the device so replayed offline events are applied once. */
    clientEventId: text('client_event_id').notNull(),
  },
  (t) => [
    uniqueIndex('review_logs_client_key').on(t.userId, t.clientEventId),
    index('review_logs_card_idx').on(t.userId, t.cardId, t.reviewedAt.desc()),
    index('review_logs_user_time_idx').on(t.userId, t.reviewedAt.desc()),
  ],
);

export const matchScores = pgTable(
  'match_scores',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    timeMs: integer('time_ms').notNull(),
    pairs: integer('pairs').notNull(),
    mistakes: integer('mistakes').notNull().default(0),
    clientId: text('client_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('match_scores_client_key').on(t.userId, t.clientId),
    index('match_scores_set_idx').on(t.setId, t.pairs, t.timeMs),
    index('match_scores_user_idx').on(t.userId, t.setId, t.timeMs),
  ],
);

// ── Motivation ───────────────────────────────────────────────────────────────

export const streaks = pgTable('streaks', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  /** Last calendar day (in the user's time zone) with any study activity. */
  lastActiveDay: date('last_active_day'),
  updatedAt: updatedAt(),
});

/** One row per user per local calendar day; feeds the weekly chart and daily goal. */
export const dailyActivity = pgTable(
  'daily_activity',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    secondsStudied: integer('seconds_studied').notNull().default(0),
    cardsStudied: integer('cards_studied').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

// ── Classes ──────────────────────────────────────────────────────────────────

export const classes = pgTable(
  'classes',
  {
    id: text('id').primaryKey(),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    joinCode: text('join_code').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts('archived_at'),
  },
  (t) => [uniqueIndex('classes_join_code_key').on(t.joinCode), index('classes_teacher_idx').on(t.teacherId)],
);

export const classMembers = pgTable(
  'class_members',
  {
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('student'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    index('class_members_user_idx').on(t.userId),
    check('class_members_role_check', sql`${t.role} in ('teacher', 'student')`),
  ],
);

export const assignments = pgTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dueAt: ts('due_at'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('assignments_class_set_key').on(t.classId, t.setId), index('assignments_set_idx').on(t.setId)],
);

// ── AI, billing, notifications, infrastructure ───────────────────────────────

/** One row per AI request; counted for the monthly quota and the burst limit. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_user_idx').on(t.userId, t.createdAt.desc())],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    customerId: text('customer_id'),
    subscriptionId: text('subscription_id'),
    status: text('status').notNull(),
    currentPeriodEnd: ts('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_customer_idx').on(t.customerId),
    index('subscriptions_subscription_idx').on(t.subscriptionId),
  ],
);

/** Payment-provider webhook events already handled, so retries are harmless. */
export const billingEvents = pgTable('billing_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
});

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_key').on(t.endpoint), index('push_subscriptions_user_idx').on(t.userId)],
);

/** Fixed-window counters behind every rate limit (auth, AI, uploads, writes). */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: ts('window_start').notNull().defaultNow(),
  count: integer('count').notNull().default(0),
});

/** Bytes are counted here so nothing needs a table scan to enforce a storage cap. */
export const storageUsage = pgTable('storage_usage', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
});

export type UserRow = typeof users.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type CardProgressRow = typeof cardProgress.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
