import type { CellEvidence, Json } from './contracts';
export function dateText(c: CellEvidence): string | null {
  const v = c.value;
  if (v === null || v === '') return null;
  if (typeof v === 'object' && !Array.isArray(v) && 'iso' in v && typeof v.iso === 'string')
    return v.iso.slice(0, 10);
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}
function day(text: string): string {
  if (!/^\d{4}-\d\d-\d\d$/.test(text)) throw new Error('INVALID_DATE');
  const n = Date.parse(text + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== text || text < '0001-01-01')
    throw new Error('INVALID_DATE');
  return text;
}
function monthEnd(month: string): string {
  day(month + '-01');
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function parseTimestamp(text: string): string {
  const parts =
    /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|([+-])(\d\d):(\d\d))$/.exec(text);
  if (
    !parts ||
    Number(parts[2]) > 23 ||
    Number(parts[3]) > 59 ||
    Number(parts[4]) > 59 ||
    (parts[5] !== 'Z' &&
      (Number(parts[7]) > 14 ||
        Number(parts[8]) > 59 ||
        (Number(parts[7]) === 14 && Number(parts[8]) !== 0)))
  )
    throw new Error('INVALID_SOURCE_TIMESTAMP');
  day(parts[1]);
  return new Date(text).toISOString();
}
export function parseDate(text: string): { from: string; to: string; precision: string } {
  if (/^\d{4}$/.test(text))
    return { from: day(text + '-01-01'), to: day(text + '-12-31'), precision: 'year' };
  if (/^\d{4}-\d\d$/.test(text))
    return { from: day(text + '-01'), to: monthEnd(text), precision: 'month' };
  if (/^\d{4}-\d\d-\d\d$/.test(text)) return { from: day(text), to: day(text), precision: 'day' };
  const ds = /^(\d{4}-\d\d-)(\d\d)~(\d\d)$/.exec(text);
  const ms = /^(\d{4}-)(\d\d)~(\d\d)$/.exec(text);
  if (ds) {
    const from = day(ds[1] + ds[2]),
      to = day(ds[1] + ds[3]);
    if (from >= to) throw new Error('INVALID_RANGE');
    return { from, to, precision: 'range' };
  }
  if (ms) {
    const from = day(ms[1] + ms[2] + '-01'),
      to = monthEnd(ms[1] + ms[3]);
    if (ms[2] >= ms[3]) throw new Error('INVALID_RANGE');
    return { from, to, precision: 'range' };
  }
  throw new Error('INVALID_DATE');
}
export function parseCompletion(
  finished: CellEvidence,
  year: CellEvidence,
  dateSystem: '1900' | '1904',
): { value: Json | null; issues: string[] } {
  if (
    dateSystem === '1900' &&
    typeof finished.value === 'object' &&
    finished.value !== null &&
    !Array.isArray(finished.value) &&
    finished.value.excelSerial !== undefined &&
    Number(finished.value.excelSerial) === 60
  )
    return { value: null, issues: ['INVALID_COMPLETION'] };
  for (const c of [finished, year])
    if (
      typeof c.value === 'object' &&
      c.value !== null &&
      !Array.isArray(c.value) &&
      c.value.type === 'date' &&
      ((typeof c.value.excelSerial !== 'string' && typeof c.value.excelSerial !== 'number') ||
        !Number.isFinite(Number(c.value.excelSerial)) ||
        (dateSystem === '1900' && Number(c.value.excelSerial) === 60))
    )
      return { value: null, issues: ['INVALID_COMPLETION'] };
  const f = dateText(finished),
    y = dateText(year);
  if (!f && !y) return { value: null, issues: [] };
  try {
    if (
      (typeof finished.value === 'number' && finished.value === 60 && dateSystem === '1900') ||
      finished.formula ||
      year.formula
    )
      throw new Error('UNREVIEWED_DATE');
    const coerced = !!y && !/^\d{4}$/.test(y);
    const legacyMonth = y && /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/.exec(y);
    const yearPart = legacyMonth ? legacyMonth[2] : y?.slice(0, 4);
    if (legacyMonth && !f) throw new Error('INVALID_YEAR');
    if (y && !legacyMonth && (!/^\d{4}(-\d\d(-\d\d)?)?$/.test(y) || !yearPart))
      throw new Error('INVALID_YEAR');
    if (y && !legacyMonth) parseDate(y);
    const d = parseDate(f ?? yearPart!);
    if (f && y && d.from.slice(0, 4) !== yearPart)
      return { value: null, issues: ['COMPLETION_YEAR_CONFLICT'] };
    return {
      value: {
        finished_from: d.from,
        finished_to: d.to,
        finished_precision: d.precision,
        finished_date_raw: f,
        finished_year_raw: y,
      },
      issues: coerced ? ['YEAR_CELL_COERCION'] : [],
    };
  } catch {
    return { value: null, issues: ['INVALID_COMPLETION'] };
  }
}
