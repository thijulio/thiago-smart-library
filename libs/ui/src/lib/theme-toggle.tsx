import { useEffect, useState } from 'react';
import { nextTheme, readBrowserTheme, saveBrowserTheme, type Theme } from './theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    return (
      readBrowserTheme(window) ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  });
  useEffect(() => {
    document.documentElement.dataset.mode = theme;
    saveBrowserTheme(theme, window);
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
