export type Theme = 'light' | 'dark';
const storageKey = 'smart-library-theme';
type BrowserStorageSource = Pick<Window, 'localStorage'>;

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

export function readBrowserTheme(source: BrowserStorageSource | undefined): Theme | undefined {
  try {
    return readTheme(source?.localStorage);
  } catch {
    return undefined;
  }
}

export function saveBrowserTheme(theme: Theme, source: BrowserStorageSource | undefined): void {
  try {
    saveTheme(theme, source?.localStorage);
  } catch {
    /* browser storage can be blocked before it is returned */
  }
}

export const nextTheme = (theme: Theme): Theme => (theme === 'light' ? 'dark' : 'light');
