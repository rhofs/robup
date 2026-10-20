// "Create next episodes" (app/api/tasks/[id]/series): copies of a task, each one step further on in
// time — every date in it moved by the same number of days, step by step, like dragging a series in
// Excel ("Så det fungerer som en duplicate, men med da forskøvet datoer, med det mønsteret",
// 2026-10-20). The date arithmetic lives here, apart from the database, because it is the part that is
// easy to get subtly wrong.
//
// Days are calendar days in the person's own time zone, not multiples of 24 hours. A date with no time
// is stored as local midnight; adding 7 × 24h across the end of summer time lands at 23:00 the day
// before, and the copy would show the wrong date. Plain `YYYY-MM-DD` values (custom date fields often
// hold those) are moved as calendar dates directly.

const DAY_MS = 86_400_000;

function wallParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

// How far the zone's wall clock is ahead of UTC at that instant, in ms.
function zoneOffset(instant: Date, timeZone: string) {
  const p = wallParts(instant, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The same wall-clock time, `days` calendar days later (or earlier), in `timeZone`.
export function shiftInstant(date: Date, days: number, timeZone: string): Date {
  if (!days) return date;
  const p = wallParts(date, timeZone);
  const targetWall = Date.UTC(p.y, p.m - 1, p.d + days, p.h, p.mi, p.s, date.getUTCMilliseconds());
  // Two passes settle the offset even when the target sits on the far side of a clock change.
  let guess = targetWall - zoneOffset(new Date(targetWall), timeZone);
  guess = targetWall - zoneOffset(new Date(guess), timeZone);
  return new Date(guess);
}

// A custom date field's stored text, moved by `days`: `YYYY-MM-DD` as a calendar date, anything else
// as an instant. Values that are not dates are returned as they were.
export function shiftDateText(value: string, days: number, timeZone: string): string {
  if (!value || !days) return value;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) {
    const d = new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) + days * DAY_MS);
    return d.toISOString().slice(0, 10);
  }
  const t = new Date(value);
  if (isNaN(t.getTime())) return value;
  return shiftInstant(t, days, timeZone).toISOString();
}

// A task's custom field values (its JSON column) with its date fields moved.
export function shiftCustomDates(json: string, dateFieldIds: Set<string>, days: number, timeZone: string): string {
  if (!days || dateFieldIds.size === 0) return json;
  let values: Record<string, unknown>;
  try {
    values = JSON.parse(json || '{}');
  } catch {
    return json;
  }
  if (!values || typeof values !== 'object') return json;
  for (const [k, v] of Object.entries(values)) {
    if (dateFieldIds.has(k) && typeof v === 'string') values[k] = shiftDateText(v, days, timeZone);
  }
  return JSON.stringify(values);
}
