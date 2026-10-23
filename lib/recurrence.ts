// Repeating events — "Planner - Kunne sette events som recurring" (2026-10-23).
//
// An event that repeats is still one row (Event.recurrence holds its rule, Event.recurrenceExceptions
// the days left out). Its occurrences are worked out when they are shown, never stored, so a series
// has no end to store and changing the rule changes every occurrence at once. Dates are calendar
// dates in the person's own time zone: "every week" keeps 09:00 at 09:00 across a change of clocks.
//
// The rule is a small subset of RFC 5545's RRULE, so it goes to Google Calendar and the .ics feed as
// one (toRRule) — including the RFC's habit of skipping a month without the start's day (the 31st) or
// a year without the 29th of February, instead of moving it.

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceRule = {
  freq: RecurrenceFreq;
  // Every `interval` days / weeks / months / years.
  interval: number;
  // The last day it may happen on (YYYY-MM-DD, inclusive), or how many times it happens. Neither: for good.
  until?: string | null;
  count?: number | null;
};

const FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];

export function parseRecurrence(json: string | null | undefined): RecurrenceRule | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    if (!raw || !FREQS.includes(raw.freq)) return null;
    const interval = Math.min(99, Math.max(1, Math.round(Number(raw.interval) || 1)));
    const until = typeof raw.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.until) ? raw.until : null;
    const count = !until && Number.isFinite(Number(raw.count)) && Number(raw.count) >= 1 ? Math.min(999, Math.round(Number(raw.count))) : null;
    return { freq: raw.freq, interval, until, count };
  } catch {
    return null;
  }
}

// What the API stores: a rule as given, cleaned; null to stop repeating.
export function normalizeRecurrence(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const rule = parseRecurrence(typeof raw === 'string' ? raw : JSON.stringify(raw));
  return rule ? JSON.stringify(rule) : null;
}

export function parseExceptions(json: string | null | undefined): Set<string> {
  try {
    const v = JSON.parse(json || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
// A local calendar day as YYYY-MM-DD — how an occurrence is named and how an exception is stored.
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

// The k-th occurrence's start (k = 0 is the event's own start), or null when that one does not exist
// (a month without the start's day, a year without 29 February).
function nthStart(start: Date, rule: RecurrenceRule, k: number): Date | null {
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = start.getDate();
  const time: [number, number, number, number] = [start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()];
  const step = k * rule.interval;
  if (rule.freq === 'daily') return new Date(y, m, d + step, ...time);
  if (rule.freq === 'weekly') return new Date(y, m, d + 7 * step, ...time);
  if (rule.freq === 'monthly') {
    const total = m + step;
    const ty = y + Math.floor(total / 12);
    const tm = ((total % 12) + 12) % 12;
    return d > daysInMonth(ty, tm) ? null : new Date(ty, tm, d, ...time);
  }
  const ty = y + step;
  return d > daysInMonth(ty, m) ? null : new Date(ty, m, d, ...time);
}

// The starts of a series' occurrences that overlap [from, to], in order, leaving out its exceptions.
// `durationMs` is how long each one lasts (end − start of the event itself).
export function occurrenceStarts(
  start: Date,
  durationMs: number,
  rule: RecurrenceRule,
  exceptions: Set<string>,
  from: Date,
  to: Date,
  max = 400
): Date[] {
  const out: Date[] = [];
  const untilEnd = rule.until ? new Date(`${rule.until}T23:59:59.999`) : null;
  // Daily and weekly steps are a fixed number of days, so the first one near `from` can be jumped to.
  let k = 0;
  if (rule.freq === 'daily' || rule.freq === 'weekly') {
    const stepDays = rule.interval * (rule.freq === 'weekly' ? 7 : 1);
    const daysAway = Math.floor((from.getTime() - durationMs - start.getTime()) / 86_400_000);
    if (daysAway > stepDays) k = Math.max(0, Math.floor(daysAway / stepDays) - 1);
  }
  for (let guard = 0; guard < 5000 && out.length < max; guard++, k++) {
    if (rule.count && k >= rule.count) break;
    const s = nthStart(start, rule, k);
    if (!s) continue;
    if (untilEnd && s > untilEnd) break;
    if (s > to) break;
    if (s.getTime() + durationMs < from.getTime()) continue;
    if (exceptions.has(dayKey(s))) continue;
    out.push(s);
  }
  return out;
}

// "Every week", "Every 2 months until 1 Dec 2026", "Every day, 10 times".
export function recurrenceLabel(rule: RecurrenceRule): string {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
  const every = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  if (rule.until) {
    const [y, m, d] = rule.until.split('-').map(Number);
    return `${every} until ${new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (rule.count) return `${every}, ${rule.count} times`;
  return every;
}

// The rule as RFC 5545 lines, for Google Calendar's `recurrence` and the .ics feed. An all-day
// event's UNTIL and EXDATE are plain dates; a timed one's are UTC instants (its own start time on
// each excepted day).
export function toRRule(rule: RecurrenceRule, start: Date, allDay: boolean, exceptions: Set<string>): string[] {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`, `INTERVAL=${rule.interval}`];
  const compactDate = (key: string) => key.replace(/-/g, '');
  const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  if (rule.until) {
    parts.push(allDay ? `UNTIL=${compactDate(rule.until)}` : `UNTIL=${utcStamp(new Date(`${rule.until}T23:59:59`))}`);
  } else if (rule.count) parts.push(`COUNT=${rule.count}`);
  const lines = [`RRULE:${parts.join(';')}`];
  if (exceptions.size) {
    const keys = [...exceptions].sort();
    if (allDay) lines.push(`EXDATE;VALUE=DATE:${keys.map(compactDate).join(',')}`);
    else
      lines.push(
        `EXDATE:${keys
          .map((key) => {
            const [y, m, d] = key.split('-').map(Number);
            return utcStamp(new Date(y, m - 1, d, start.getHours(), start.getMinutes(), start.getSeconds()));
          })
          .join(',')}`
      );
  }
  return lines;
}

// An occurrence shown in the Planner carries the series' id and its own day: "<eventId>@@YYYY-MM-DD".
const OCC_SEP = '@@';
export const occurrenceId = (eventId: string, key: string) => `${eventId}${OCC_SEP}${key}`;
export function parseOccurrenceId(id: string): { eventId: string; key: string } | null {
  const i = id.indexOf(OCC_SEP);
  return i === -1 ? null : { eventId: id.slice(0, i), key: id.slice(i + OCC_SEP.length) };
}

// Events with their repeating ones laid out as occurrences overlapping [from, to] — each a copy of the
// series named by occurrenceId, on its own dates. One-off events pass through as they are. Each
// occurrence keeps the series' length in calendar days and its end's time of day, not its length in
// milliseconds, so a multi-day event stays the same days long across a change of clocks.
type Expandable = { id: string; startDate: Date | string; endDate: Date | string; recurrence?: string | null; recurrenceExceptions?: string };
export function expandOccurrences<E extends Expandable>(events: E[], from: Date, to: Date): E[] {
  const out: E[] = [];
  for (const e of events) {
    const rule = parseRecurrence(e.recurrence);
    if (!rule) {
      out.push(e);
      continue;
    }
    const start = new Date(e.startDate);
    const end = new Date(e.endDate);
    const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const spanDays = Math.round((dayOf(end) - dayOf(start)) / 86_400_000);
    for (const s of occurrenceStarts(start, end.getTime() - start.getTime(), rule, parseExceptions(e.recurrenceExceptions), from, to)) {
      const occEnd = new Date(s.getFullYear(), s.getMonth(), s.getDate() + spanDays, end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
      out.push({ ...e, id: occurrenceId(e.id, dayKey(s)), startDate: s, endDate: occEnd });
    }
  }
  return out;
}
