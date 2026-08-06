import { prisma } from '@/lib/prisma';

// RFC 5545 §3.3.11 — escape backslash, semicolon, comma, and newline in TEXT values.
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const icsDate = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await prisma.user.findUnique({ where: { calendarToken: token } });
  if (!user) return new Response('Not found', { status: 404 });

  const tasks = await prisma.task.findMany({
    where: {
      archived: false,
      deletedAt: null,
      assignees: { some: { id: user.id } },
      OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
    },
    orderBy: { dueDate: 'asc' },
  });

  const now = icsStamp(new Date());
  const events = tasks.map((t) => {
    const start = t.startDate ?? t.dueDate!;
    const end = t.dueDate ?? t.startDate!;
    // All-day events: ICS DTEND is exclusive, so a task due the same day it starts still needs
    // its end pushed one day forward, or single-day tasks would render as zero-length.
    const dtend = addDays(end, 1);
    const lines = [
      'BEGIN:VEVENT',
      `UID:${t.id}@robup`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(dtend)}`,
      `SUMMARY:${icsEscape(t.title)}`,
    ];
    if (t.description) lines.push(`DESCRIPTION:${icsEscape(t.description)}`);
    lines.push('STATUS:CONFIRMED', 'END:VEVENT');
    return lines.join('\r\n');
  });

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RobUp//Task Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:RobUp \u2014 ${icsEscape(user.name)}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(calendar, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="robup.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
