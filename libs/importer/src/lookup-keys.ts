export const lookupKey = (value: string) => value.trim().normalize('NFC').toLowerCase();
export const ALIASES: Record<string, string> = {
  'n. gaiman': 'Neil Gaiman',
  't. pratchett': 'Terry Pratchett',
};
export function names(text: string, delimiter: string, aliases = false): string[] {
  const result = text
    .split(delimiter)
    .map((s) => s.trim())
    .map((s) => (aliases ? (ALIASES[lookupKey(s)] ?? s) : s));
  if (result.some((s) => !s) || new Set(result.map(lookupKey)).size !== result.length)
    throw new Error('INVALID_LOOKUP_LIST');
  return result;
}
