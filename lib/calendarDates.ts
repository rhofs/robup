export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const startOfDay = (d: Date) => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

export const isSameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Monday-start week, matching DatePickerPopover's convention.
export const startOfWeek = (d: Date) => {
  const day = startOfDay(d);
  const weekday = (day.getDay() + 6) % 7; // Mon=0..Sun=6
  return addDays(day, -weekday);
};

export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

// 6 rows x 7 days covering the full month, including leading/trailing days from adjacent months.
export const monthGridDays = (monthAnchor: Date) => {
  const monthStart = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
};

export const chunkIntoWeeks = (days: Date[]) => {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
};

export const formatMonthYear = (d: Date) => `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;

export const formatDayLabel = (d: Date) => `${WEEKDAY_LABELS[(d.getDay() + 6) % 7]} ${d.getDate()}`;

export const formatFullDate = (d: Date) => `${d.getDate()}. ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;

// ISO-8601 week number (Norway/Europe convention: weeks start Monday, week 1 contains the year's first Thursday).
export const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
};
