export type DateBadgeColor = 'white' | 'yellow' | 'green' | 'red';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Due date's own three-state progression: white while comfortably ahead, yellow inside the last
// 24h, red once it's passed — the same "urgency creeps up" read a deadline chip should give at a
// glance across a whole list of tasks.
export function dueDateColor(dueDate: Date | string | null, now: Date = new Date()): DateBadgeColor | null {
  const d = toDate(dueDate);
  if (!d) return null;
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return 'red';
  if (diff <= DAY_MS) return 'yellow';
  return 'white';
}

// Start date mirrors the same white/yellow progression, but its "passed" state is green (task has
// started) rather than red — UNLESS the due date has also passed, in which case the whole task is
// overdue and the start badge turns red too, matching the due badge, since "overdue" is the more
// urgent signal and a started-but-blown-past-due task shouldn't still read as calmly green.
export function startDateColor(startDate: Date | string | null, dueDate: Date | string | null, now: Date = new Date()): DateBadgeColor | null {
  const d = toDate(startDate);
  if (!d) return null;
  if (dueDateColor(dueDate, now) === 'red') return 'red';
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return 'green';
  if (diff <= DAY_MS) return 'yellow';
  return 'white';
}

// Hex, not Tailwind classes — the badge itself is a filled pill (color/border/background via
// inline style, same `hex + alpha-suffix` trick TaskRow.tsx's own status pill already uses)
// rather than plain colored text, which turned out too subtle to read at a glance across a list.
export const DATE_BADGE_COLOR_HEX: Record<DateBadgeColor, string> = {
  white: '#A3A3A3', // neutral-400 — deliberately a pill too (not "no pill"), so the mechanism is
  // always the same shape and the only thing that changes is which color you're reading.
  yellow: '#FACC15', // yellow-400
  green: '#34D399', // emerald-400
  red: '#F87171', // red-400
};

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

// Human "2 days" / "18 hours" magnitude, used to build a tooltip's exact wording at the call site
// (e.g. "Overdue by 2 days", "Starts in 18 hours") — the badge color alone tells you the bucket,
// this tells you the precise distance without needing to open the date picker.
export function relativeMagnitude(date: Date | string | null, now: Date = new Date()): string | null {
  const d = toDate(date);
  if (!d) return null;
  const diffMs = Math.abs(d.getTime() - now.getTime());
  const days = Math.floor(diffMs / DAY_MS);
  if (days >= 1) return pluralize(days, 'day');
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return pluralize(hours, 'hour');
  const minutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  return pluralize(minutes, 'minute');
}

export function dueDateTooltip(dueDate: Date | string | null, now: Date = new Date()): string | undefined {
  const d = toDate(dueDate);
  if (!d) return undefined;
  const mag = relativeMagnitude(dueDate, now)!;
  return d.getTime() <= now.getTime() ? `Overdue by ${mag}` : `Due in ${mag}`;
}

export function startDateTooltip(startDate: Date | string | null, now: Date = new Date()): string | undefined {
  const d = toDate(startDate);
  if (!d) return undefined;
  const mag = relativeMagnitude(startDate, now)!;
  return d.getTime() <= now.getTime() ? `Started ${mag} ago` : `Starts in ${mag}`;
}
