export type Theme = 'light' | 'dark';
const storageKey = 'smart-library-theme';

export function readTheme(storage: Storage | undefined): Theme | undefined {
  try {
    const saved = storage?.getItem(storageKey);
    return saved === 'light' || saved === 'dark' ? saved : undefined;
  } catch {
    return undefined;
  }
}
export function saveTheme(theme: Theme, storage: Storage | undefined): void {
  try {
    storage?.setItem(storageKey, theme);
  } catch {
    /* storage is optional */
  }
}
export const nextTheme = (theme: Theme): Theme => (theme === 'light' ? 'dark' : 'light');
