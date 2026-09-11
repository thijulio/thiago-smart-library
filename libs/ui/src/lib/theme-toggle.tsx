import { useEffect, useState } from 'react';
import { nextTheme, readTheme, saveTheme, type Theme } from './theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    return (
      readTheme(window.localStorage) ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  });
  useEffect(() => {
    document.documentElement.dataset.mode = theme;
    saveTheme(theme, window.localStorage);
  }, [theme]);
  return (
    <button
      className="themeToggle"
      type="button"
      onClick={() => setTheme(nextTheme(theme))}
      aria-label={`Switch to ${nextTheme(theme)} mode`}
    >
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </button>
  );
}
