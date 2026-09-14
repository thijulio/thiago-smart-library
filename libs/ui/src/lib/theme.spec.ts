import { describe, expect, it } from 'vitest';
import { nextTheme, readBrowserTheme, readTheme, saveBrowserTheme, saveTheme } from './theme';
describe('theme preference', () => {
  it('changes from light to dark', () => expect(nextTheme('light')).toBe('dark'));
  it('handles unavailable storage without throwing', () =>
    expect(() => saveTheme('dark', undefined)).not.toThrow());
  it('accepts only known stored values', () =>
    expect(readTheme({ getItem: () => 'other' } as unknown as Storage)).toBeUndefined());

  it('handles a blocked localStorage getter', () => {
    const blockedWindow = Object.defineProperty({}, 'localStorage', {
      get: () => {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });

    const source = blockedWindow as Pick<Window, 'localStorage'>;
    expect(readBrowserTheme(source)).toBeUndefined();
    expect(() => saveBrowserTheme('dark', source)).not.toThrow();
  });
});
