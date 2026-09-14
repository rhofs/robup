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

  // Tasks AND Planner events. Events were missing from this feed entirely — the whole Planner was
  // invisible to anyone subscribing from an iPhone, which is the one place this feed matters, since
  // Apple has no equivalent of the two-way Google sync. Asked for directly: "jeg vil fikse så
  // planner også er med på iphone".
  //
  // Both use "assigned to you", not "created by you". That is the same rule lib/google/calendarSync
  // already applies (see EventGoogleSync's own note in schema.prisma) — one calendar should not
  // quietly disagree with the other about what belongs on it.
  const [tasks, events] = await Promise.all([
    prisma.task.findMany({
      where: {
        archived: false,
        deletedAt: null,
        assignees: { some: { id: user.id } },
        OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.event.findMany({
      where: { deletedAt: null, assignees: { some: { id: user.id } } },
      orderBy: { startDate: 'asc' },
    }),
  ]);

  const now = icsStamp(new Date());
  const taskEvents = tasks.map((t) => {
    const start = t.startDate ?? t.dueDate!;
    const end = t.dueDate ?? t.startDate!;
    // All-day events: ICS DTEND is exclusive, so a task due the same day it starts still needs
    // its end pushed one day forward, or single-day tasks would render as zero-length.
    const dtend = addDays(end, 1);
    const lines = [
      'BEGIN:VEVENT',
      `UID:${t.id}@siqt`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(dtend)}`,
      `SUMMARY:${icsEscape(t.title)}`,
    ];
    if (t.description) lines.push(`DESCRIPTION:${icsEscape(t.description)}`);
    lines.push('STATUS:CONFIRMED', 'END:VEVENT');
    return lines.join('\r\n');
  });

  const plannerEvents = events.map((e) => {
    const lines = ['BEGIN:VEVENT', `UID:${e.id}@siqt-event`, `DTSTAMP:${now}`];

    if (e.allDay) {
      // Same exclusive-DTEND rule as the tasks above: a one-day all-day event has to end on the
      // following date or calendars render it as zero-length.
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.startDate)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.endDate, 1))}`);
    } else {
      // A timed event carries real times, unlike everything else in this feed. Emitted as UTC
      // instants (the trailing Z) rather than local times with a VTIMEZONE block: the stored values
      // are already absolute, and a wrong or missing VTIMEZONE shifts events by hours in a way that
      // is very hard to notice and worse than not supporting times at all.
      lines.push(`DTSTART:${icsStamp(e.startDate)}`, `DTEND:${icsStamp(e.endDate)}`);
    }

    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    lines.push('STATUS:CONFIRMED', 'END:VEVENT');
    return lines.join('\r\n');
  });

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Siqt//Task Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Siqt \u2014 ${icsEscape(user.name)}`,
    ...taskEvents,
    ...plannerEvents,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(calendar, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="siqt.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
