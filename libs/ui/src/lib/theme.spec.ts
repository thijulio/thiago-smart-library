import { describe, expect, it } from 'vitest';
import { nextTheme, readTheme, saveTheme } from './theme';
describe('theme preference', () => {
  it('changes from light to dark', () => expect(nextTheme('light')).toBe('dark'));
  it('handles unavailable storage without throwing', () =>
    expect(() => saveTheme('dark', undefined)).not.toThrow());
  it('accepts only known stored values', () =>
    expect(readTheme({ getItem: () => 'other' } as unknown as Storage)).toBeUndefined());
});
