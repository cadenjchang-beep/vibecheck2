import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { UI_LOCALES, type UiLocale } from '@shared/constants';
import en from '@/locales/en';

/**
 * Small, dependency-free i18n.
 *
 * Messages live in src/client/locales/<locale>/ as JSON. Keys are dot paths
 * and are type-checked against the English catalogue. Message syntax is a
 * subset of ICU MessageFormat:
 *   "Hello {name}"
 *   "{count, plural, one {# card} other {# cards}}"
 * A missing translation falls back to English, so a partial locale still works.
 */

type Dictionary = typeof en;
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Dictionary>;
export type MessageVars = Record<string, string | number>;
type Messages = { [key: string]: string | Messages };

const loaders: Record<Exclude<UiLocale, 'en'>, () => Promise<{ default: Messages }>> = {
  es: () => import('@/locales/es'),
  ar: () => import('@/locales/ar'),
};

const STORAGE_KEY = 'tessera.locale';
const isLocale = (v: unknown): v is UiLocale => UI_LOCALES.some((l) => l.code === v);

export function detectLocale(): UiLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const base = lang.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Finds the index of the brace that closes the one at `open`. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

export function formatMessage(template: string, vars: MessageVars | undefined, locale: string): string {
  if (!template.includes('{')) return template;
  let out = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('{', i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = matchBrace(template, open);
    if (close === -1) {
      out += template.slice(open);
      break;
    }
    const body = template.slice(open + 1, close);
    const plural = /^\s*(\w+)\s*,\s*plural\s*,/.exec(body);
    if (plural) {
      const name = plural[1]!;
      const count = Number(vars?.[name] ?? 0);
      const options = parsePluralOptions(body.slice(plural[0].length));
      const category = new Intl.PluralRules(locale).select(count);
      const chosen = options[`=${count}`] ?? options[category] ?? options.other ?? '';
      const formatted = new Intl.NumberFormat(locale).format(count);
      out += formatMessage(chosen.replace(/#/g, formatted), vars, locale);
    } else {
      const name = body.trim();
      const value = vars?.[name];
      out += typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : (value ?? `{${name}}`);
    }
    i = close + 1;
  }
  return out;
}

function parsePluralOptions(text: string): Record<string, string> {
  const options: Record<string, string> = {};
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    const selector = text.slice(i, open).trim();
    const close = matchBrace(text, open);
    if (close === -1) break;
    if (selector) options[selector] = text.slice(open + 1, close);
    i = close + 1;
  }
  return options;
}

interface I18n {
  locale: UiLocale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: UiLocale) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
  /** Looks a key up at runtime (for example an error code); returns undefined if absent. */
  tMaybe: (key: string, vars?: MessageVars) => string | undefined;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatRelative: (value: Date | string | number) => string;
  formatDuration: (seconds: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(detectLocale);
  const [messages, setMessages] = useState<Messages | null>(null);

  useEffect(() => {
    let cancelled = false;
    const info = UI_LOCALES.find((l) => l.code === locale)!;
    document.documentElement.lang = locale;
    document.documentElement.dir = info.dir;
    if (locale === 'en') {
      setMessages(null);
      return;
    }
    loaders[locale]().then(
      (mod) => !cancelled && setMessages(mod.default),
      () => !cancelled && setMessages(null),
    );
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: UiLocale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setLocaleState(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const dir = UI_LOCALES.find((l) => l.code === locale)!.dir;
    const tMaybe = (key: string, vars?: MessageVars) => {
      const template = (messages && lookup(messages, key)) ?? lookup(en as Messages, key);
      return template === undefined ? undefined : formatMessage(template, vars, locale);
    };
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return {
      locale,
      dir,
      setLocale,
      tMaybe,
      t: (key, vars) => tMaybe(key, vars) ?? key,
      formatNumber: (v, o) => new Intl.NumberFormat(locale, o).format(v),
      formatDate: (v, o) => new Intl.DateTimeFormat(locale, o ?? { dateStyle: 'medium' }).format(new Date(v)),
      formatRelative: (v) => {
        const diff = (new Date(v).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return relative.format(Math.round(diff), 'second');
        if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
        if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour');
        if (abs < 86400 * 30) return relative.format(Math.round(diff / 86400), 'day');
        if (abs < 86400 * 365) return relative.format(Math.round(diff / (86400 * 30)), 'month');
        return relative.format(Math.round(diff / (86400 * 365)), 'year');
      },
      formatDuration: (seconds) => {
        const s = Math.max(0, Math.round(seconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const unit = (n: number, u: 'hour' | 'minute' | 'second') =>
          new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'narrow' }).format(n);
        if (h > 0) return `${unit(h, 'hour')} ${unit(m, 'minute')}`;
        if (m > 0) return unit(m, 'minute');
        return unit(s, 'second');
      },
    };
  }, [locale, messages, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Shorthand for components that only need to translate. */
export function useT() {
  return useI18n().t;
}
