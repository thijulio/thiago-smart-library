export function decimal(text: string, max: number, scale: number): string {
  const s = text.replace(/⭐$/u, '').trim();
  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) > max || (s.split('.')[1]?.length ?? 0) > scale)
    throw new Error('INVALID_DECIMAL');
  return s
    .replace(/^0+(?=\d)/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}
export function integer(text: string, max: bigint, min = 0n): string {
  if (!/^\d+$/.test(text) || BigInt(text) > max || BigInt(text) < min)
    throw new Error('INVALID_INTEGER');
  return BigInt(text).toString();
}
export function safeUrl(text: string): string {
  const u = new URL(text);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || /\s/.test(text))
    throw new Error('INVALID_URL');
  return text;
}
