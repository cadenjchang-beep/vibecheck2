CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"set_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"due_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_distractors" (
	"card_id" text PRIMARY KEY NOT NULL,
	"source_hash" text NOT NULL,
	"definition_options" jsonb NOT NULL,
	"term_options" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_progress" (
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"set_id" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_progress_user_id_card_id_pk" PRIMARY KEY("user_id","card_id"),
	CONSTRAINT "card_progress_stage_check" CHECK ("card_progress"."stage" in ('new', 'learning', 'familiar', 'mastered'))
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"position" integer NOT NULL,
	"term" text NOT NULL,
	"term_plain" text NOT NULL,
	"definition" text NOT NULL,
	"definition_plain" text NOT NULL,
	"term_image_id" text,
	"definition_image_id" text,
	"term_audio_id" text,
	"definition_audio_id" text,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"class_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_members_class_id_user_id_pk" PRIMARY KEY("class_id","user_id"),
	CONSTRAINT "class_members_role_check" CHECK ("class_members"."role" in ('teacher', 'student'))
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"join_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"seconds_studied" integer DEFAULT 0 NOT NULL,
	"cards_studied" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_activity_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"set_id" text NOT NULL,
	"time_ms" integer NOT NULL,
	"pairs" integer NOT NULL,
	"mistakes" integer DEFAULT 0 NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('image', 'audio'))
);
--> statement-breakpoint
CREATE TABLE "parental_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "parental_consents_status_check" CHECK ("parental_consents"."status" in ('pending', 'granted', 'declined'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"set_id" text NOT NULL,
	"mode" text NOT NULL,
	"kind" text NOT NULL,
	"correct" boolean,
	"rating" smallint,
	"stage_after" text NOT NULL,
	"interval_after" integer DEFAULT 0 NOT NULL,
	"ease_after" real DEFAULT 2.5 NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"client_event_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_folder_links" (
	"folder_id" text NOT NULL,
	"set_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_folder_links_folder_id_set_id_pk" PRIMARY KEY("folder_id","set_id")
);
--> statement-breakpoint
CREATE TABLE "set_user_state" (
	"user_id" text NOT NULL,
	"set_id" text NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"last_opened_at" timestamp with time zone,
	"last_studied_at" timestamp with time zone,
	CONSTRAINT "set_user_state_user_id_set_id_pk" PRIMARY KEY("user_id","set_id")
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT 'other' NOT NULL,
	"term_lang" text DEFAULT 'en' NOT NULL,
	"definition_lang" text DEFAULT 'en' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"terms_text" text DEFAULT '' NOT NULL,
	"source_set_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', "sets"."title"), 'A') || setweight(to_tsvector('simple', replace("sets"."subject", '-', ' ')), 'B') || setweight(to_tsvector('simple', "sets"."description"), 'C') || setweight(to_tsvector('simple', left("sets"."terms_text", 100000)), 'D')) STORED,
	CONSTRAINT "sets_visibility_check" CHECK ("sets"."visibility" in ('private', 'unlisted', 'public'))
);
--> statement-breakpoint
CREATE TABLE "storage_usage" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_day" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"set_id" text,
	"mode" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"cards_studied" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"score" real,
	"details" jsonb,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_mode_check" CHECK ("study_sessions"."mode" in ('flashcards', 'learn', 'test', 'match', 'review', 'listen'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"customer_id" text,
	"subscription_id" text,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"birth_year" smallint,
	"birth_month" smallint,
	"consent_status" text DEFAULT 'unknown' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"daily_goal" integer DEFAULT 20 NOT NULL,
	"reminder_channel" text DEFAULT 'off' NOT NULL,
	"reminder_hour" smallint DEFAULT 18 NOT NULL,
	"last_reminder_day" date,
	"stripe_customer_id" text,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('student', 'teacher')),
	CONSTRAINT "users_plan_check" CHECK ("users"."plan" in ('free', 'premium')),
	CONSTRAINT "users_consent_check" CHECK ("users"."consent_status" in ('unknown', 'not_required', 'pending', 'granted'))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_distractors" ADD CONSTRAINT "card_distractors_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_progress" ADD CONSTRAINT "card_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_progress" ADD CONSTRAINT "card_progress_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_progress" ADD CONSTRAINT "card_progress_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_term_image_id_media_id_fk" FOREIGN KEY ("term_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_definition_image_id_media_id_fk" FOREIGN KEY ("definition_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_term_audio_id_media_id_fk" FOREIGN KEY ("term_audio_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_definition_audio_id_media_id_fk" FOREIGN KEY ("definition_audio_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_folder_links" ADD CONSTRAINT "set_folder_links_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_folder_links" ADD CONSTRAINT "set_folder_links_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_user_state" ADD CONSTRAINT "set_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_user_state" ADD CONSTRAINT "set_user_state_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_key" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_class_set_key" ON "assignments" USING btree ("class_id","set_id");--> statement-breakpoint
CREATE INDEX "assignments_set_idx" ON "assignments" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "card_progress_due_idx" ON "card_progress" USING btree ("user_id","due_at") WHERE "card_progress"."due_at" is not null;--> statement-breakpoint
CREATE INDEX "card_progress_set_idx" ON "card_progress" USING btree ("user_id","set_id");--> statement-breakpoint
CREATE INDEX "cards_set_position_idx" ON "cards" USING btree ("set_id","position");--> statement-breakpoint
CREATE INDEX "cards_term_image_idx" ON "cards" USING btree ("term_image_id") WHERE "cards"."term_image_id" is not null;--> statement-breakpoint
CREATE INDEX "cards_definition_image_idx" ON "cards" USING btree ("definition_image_id") WHERE "cards"."definition_image_id" is not null;--> statement-breakpoint
CREATE INDEX "cards_term_audio_idx" ON "cards" USING btree ("term_audio_id") WHERE "cards"."term_audio_id" is not null;--> statement-breakpoint
CREATE INDEX "cards_definition_audio_idx" ON "cards" USING btree ("definition_audio_id") WHERE "cards"."definition_audio_id" is not null;--> statement-breakpoint
CREATE INDEX "class_members_user_idx" ON "class_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_join_code_key" ON "classes" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "classes_teacher_idx" ON "classes" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "folders_owner_idx" ON "folders" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "match_scores_client_key" ON "match_scores" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "match_scores_set_idx" ON "match_scores" USING btree ("set_id","pairs","time_ms");--> statement-breakpoint
CREATE INDEX "match_scores_user_idx" ON "match_scores" USING btree ("user_id","set_id","time_ms");--> statement-breakpoint
CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parental_consents_token_key" ON "parental_consents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "parental_consents_user_idx" ON "parental_consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_logs_client_key" ON "review_logs" USING btree ("user_id","client_event_id");--> statement-breakpoint
CREATE INDEX "review_logs_card_idx" ON "review_logs" USING btree ("user_id","card_id","reviewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_logs_user_time_idx" ON "review_logs" USING btree ("user_id","reviewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "set_folder_links_set_idx" ON "set_folder_links" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "set_user_state_recent_idx" ON "set_user_state" USING btree ("user_id","last_opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "set_user_state_starred_idx" ON "set_user_state" USING btree ("user_id") WHERE "set_user_state"."starred";--> statement-breakpoint
CREATE INDEX "sets_owner_idx" ON "sets" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sets_search_idx" ON "sets" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "sets_title_trgm_idx" ON "sets" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sets_public_subject_idx" ON "sets" USING btree ("subject","updated_at" DESC NULLS LAST) WHERE "sets"."visibility" = 'public' and "sets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sets_deleted_idx" ON "sets" USING btree ("deleted_at") WHERE "sets"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_client_key" ON "study_sessions" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "study_sessions_user_idx" ON "study_sessions" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "study_sessions_set_idx" ON "study_sessions" USING btree ("set_id","user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_subscription_idx" ON "subscriptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_reminder_idx" ON "users" USING btree ("reminder_channel","reminder_hour") WHERE "users"."reminder_channel" <> 'off';--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");