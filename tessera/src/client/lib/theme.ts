import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'tessera.theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(read);

  useEffect(() => {
    apply(theme);
    if (theme !== 'system') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
