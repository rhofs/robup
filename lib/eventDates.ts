// An event's dates, as the pickers hand them over: ISO strings where midnight means "no time" — the
// convention every date in the app uses (DatePickerPopover, DateSheet).

const parse = (iso: string | null) => (iso ? new Date(iso) : null);

export const hasTime = (iso: string | null) => {
  const d = parse(iso);
  return !!d && !isNaN(d.getTime()) && (d.getHours() !== 0 || d.getMinutes() !== 0);
};

// The same date with no time.
export const dropTime = (iso: string | null) => {
  const d = parse(iso);
  if (!d || isNaN(d.getTime())) return iso;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

// What to store for an event whose pickers say `start` and `end`. One rule for creating and for
// editing (2026-11-13 — editing used to have an "All day" checkbox of its own, which could disagree
// with the times):
//
//  - all day unless a time was added to either end — a time is what makes it timed;
//  - never an end before its start. "Add start time" alone leaves the end at midnight of the same day,
//    which is *before* the start; the end then becomes an hour after the start (kept inside the day).
export function eventRange(start: string, end: string | null): { startDate: string; endDate: string; allDay: boolean } {
  const s = new Date(start);
  let e = end ? new Date(end) : new Date(s);
  const allDay = !hasTime(start) && !hasTime(end ?? start);
  if (e < s) {
    const sameDay = e.getFullYear() === s.getFullYear() && e.getMonth() === s.getMonth() && e.getDate() === s.getDate();
    if (!allDay && sameDay && !hasTime(end ?? start)) {
      e = new Date(s.getTime() + 60 * 60 * 1000);
      if (e.getDate() !== s.getDate()) e = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59);
    } else {
      e = new Date(s);
    }
  }
  return { startDate: s.toISOString(), endDate: e.toISOString(), allDay };
}
