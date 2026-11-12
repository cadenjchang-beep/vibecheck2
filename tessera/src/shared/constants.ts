/** Values shared by the client and the server. Keep this file dependency-free. */

export const APP_NAME = 'Tessera';

export const SUBJECTS = [
  'languages',
  'science',
  'math',
  'history',
  'social-studies',
  'literature',
  'arts',
  'computer-science',
  'medicine',
  'business',
  'law',
  'test-prep',
  'other',
] as const;
export type Subject = (typeof SUBJECTS)[number];

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Mastery ladder shown for every card. */
export const STAGES = ['new', 'learning', 'familiar', 'mastered'] as const;
export type Stage = (typeof STAGES)[number];

export const STUDY_MODES = ['flashcards', 'learn', 'test', 'match', 'review', 'listen'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const ROLES = ['student', 'teacher'] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ['free', 'premium'] as const;
export type Plan = (typeof PLANS)[number];

export const CONSENT_STATUSES = ['unknown', 'not_required', 'pending', 'granted'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const REMINDER_CHANNELS = ['off', 'email', 'push'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const LIMITS = {
  titleMax: 120,
  descriptionMax: 1000,
  /** Characters of rich markup per side of a card. */
  cardSideMax: 2000,
  cardsPerSet: 2000,
  folderNameMax: 80,
  classNameMax: 80,
  nameMax: 60,
  imageBytes: 5 * 1024 * 1024,
  audioBytes: 10 * 1024 * 1024,
  aiSourceChars: 30_000,
  aiUploadBytes: 8 * 1024 * 1024,
  pageSize: 24,
} as const;

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'] as const;

/**
 * Languages offered for a set's term and definition sides. Codes are BCP 47 and
 * are used for the `lang` attribute, speech synthesis and AI generation.
 */
export const LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'sv', name: 'Svenska' },
  { code: 'nb', name: 'Norsk' },
  { code: 'da', name: 'Dansk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'pl', name: 'Polski' },
  { code: 'cs', name: 'Čeština' },
  { code: 'hu', name: 'Magyar' },
  { code: 'ro', name: 'Română' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'he', name: 'עברית' },
  { code: 'ar', name: 'العربية' },
  { code: 'fa', name: 'فارسی' },
  { code: 'ur', name: 'اردو' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'zh-CN', name: '中文 (简体)' },
  { code: 'zh-TW', name: '中文 (繁體)' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'fil', name: 'Filipino' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'la', name: 'Latina' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

/** Interface languages that ship with the app. */
export const UI_LOCALES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const;
export type UiLocale = (typeof UI_LOCALES)[number]['code'];

export const DAILY_GOAL_OPTIONS = [0, 10, 20, 30, 50, 100] as const;

/** Under this age an account needs a parent or guardian's approval. */
export const CHILD_AGE = 13;
