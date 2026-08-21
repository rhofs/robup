import { google, calendar_v3 } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from './oauthClient';

// Google Calendar two-way sync (backlog #13). Two deliberate scope cuts, both worth knowing
// before extending this:
// 1. **Polling, not real-time push webhooks.** Google's `events.watch` push-notification channels
//    need a public HTTPS callback (siqt.no has one now) but also expire (max 7 days for Calendar)
//    and need active renewal, plus header-signature verification — real infrastructure on top of
//    what's here. Polling (this file's pullChangesFromGoogle, run on a schedule — see
//    scripts/syncGoogleCalendar.ts) is simpler and correct, just not instant; a few minutes of
//    latency on the Google→Siqt direction is the accepted tradeoff.
// 2. **Never auto-imports a brand-new event created directly on the Google side.** Only Events
//    that already have a googleEventId (i.e., originated in Siqt) get pulled back — a foreign
//    Google event with no known googleEventId is skipped, not created as a new Siqt Event, since
//    that would need picking a target workspace/Space with no natural answer. Two-way sync here
//    means "edits to a Siqt-created event flow both ways," not "any Google Calendar event
//    appears in Siqt."

const SIQT_CALENDAR_SUMMARY = 'Siqt';

function toCalendarClient(refreshToken: string) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

async function getConnectedUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken) return null;
  return user;
}

// Get-or-create — every user gets their own dedicated calendar the first time any of their
// Events needs to sync, never the account's primary calendar (keeps Siqt's events cleanly
// separate from personal ones, and means deleting/leaving Siqt never touches anything else).
async function ensureSiqtCalendarId(userId: string, client: calendar_v3.Calendar, existingId: string | null): Promise<string> {
  if (existingId) return existingId;
  const created = await client.calendars.insert({ requestBody: { summary: SIQT_CALENDAR_SUMMARY } });
  const calendarId = created.data.id!;
  await prisma.user.update({ where: { id: userId }, data: { googleCalendarId: calendarId } });
  return calendarId;
}

type SiqtEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  googleEventId: string | null;
  assignees: { email: string | null; googleEmail: string | null }[];
};

function toGoogleDateFields(event: SiqtEvent) {
  if (event.allDay) {
    // Google's all-day end date is exclusive; Siqt's own endDate is inclusive (same convention
    // ganttLayout.ts/clipRangeToWeek already use for Task ranges) — add one day going out.
    const endExclusive = new Date(event.endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
    return { start: { date: dateOnly(event.startDate) }, end: { date: dateOnly(endExclusive) } };
  }
  return {
    start: { dateTime: event.startDate.toISOString() },
    end: { dateTime: event.endDate.toISOString() },
  };
}

// Push one Event's current state to Google — create if it has no googleEventId yet, else update.
// Silently does nothing if the sync owner isn't connected (not an error state — an Event just
// stays Siqt-only until/unless they connect Google).
export async function pushEventToGoogle(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { assignees: { select: { email: true, googleEmail: true } } },
  });
  if (!event || !event.googleSyncOwnerId) return;

  const owner = await getConnectedUser(event.googleSyncOwnerId);
  if (!owner) return;

  const client = toCalendarClient(owner.googleRefreshToken!);
  const calendarId = await ensureSiqtCalendarId(owner.id, client, owner.googleCalendarId);

  const attendees = event.assignees
    .map((a) => a.email ?? a.googleEmail)
    .filter((email): email is string => !!email)
    .map((email) => ({ email }));

  const requestBody: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    attendees,
    ...toGoogleDateFields(event),
  };

  try {
    if (event.googleEventId) {
      await client.events.update({ calendarId, eventId: event.googleEventId, requestBody });
    } else {
      const created = await client.events.insert({ calendarId, requestBody });
      await prisma.event.update({ where: { id: event.id }, data: { googleEventId: created.data.id } });
    }
  } catch (err: any) {
    // A 404 here means the event was deleted directly on the Google side (or the whole calendar
    // was) — clear the stale id so the next push just creates a fresh one instead of failing
    // forever on the same dangling reference.
    if (err?.code === 404 || err?.response?.status === 404) {
      await prisma.event.update({ where: { id: event.id }, data: { googleEventId: null } });
    } else {
      console.error('pushEventToGoogle failed:', err?.message || err);
    }
  }
}

// Called right before (or instead of) deleting an Event row, while its googleEventId/
// googleSyncOwnerId are still known — removes the Google-side copy too, since a Siqt delete
// (soft or permanent) should mean "gone from the calendar," not "orphaned on Google forever."
export async function deleteEventFromGoogle(googleSyncOwnerId: string, googleEventId: string): Promise<void> {
  const owner = await getConnectedUser(googleSyncOwnerId);
  if (!owner?.googleCalendarId) return;
  const client = toCalendarClient(owner.googleRefreshToken!);
  try {
    await client.events.delete({ calendarId: owner.googleCalendarId, eventId: googleEventId });
  } catch (err: any) {
    // 404/410 — already gone, nothing to do.
    if (err?.code !== 404 && err?.code !== 410 && err?.response?.status !== 404 && err?.response?.status !== 410) {
      console.error('deleteEventFromGoogle failed:', err?.message || err);
    }
  }
}

function fromGoogleDateFields(gEvent: calendar_v3.Schema$Event): { startDate: Date; endDate: Date; allDay: boolean } {
  if (gEvent.start?.date) {
    // All-day, Google's end is exclusive — subtract a day to get back to Siqt's inclusive
    // convention.
    const start = new Date(gEvent.start.date + 'T00:00:00.000Z');
    const endExclusive = new Date((gEvent.end?.date ?? gEvent.start.date) + 'T00:00:00.000Z');
    const end = new Date(endExclusive);
    end.setDate(end.getDate() - 1);
    return { startDate: start, endDate: end < start ? start : end, allDay: true };
  }
  const start = new Date(gEvent.start?.dateTime ?? Date.now());
  const end = new Date(gEvent.end?.dateTime ?? gEvent.start?.dateTime ?? Date.now());
  return { startDate: start, endDate: end, allDay: false };
}

// Pulls whatever changed on this user's dedicated Siqt calendar since the last call (Google's own
// incremental-sync cursor, googleCalendarSyncToken) and applies it to whichever Siqt Events we
// already know about (matched by googleEventId — see this file's own top comment for why a
// wholly-foreign new Google event is deliberately skipped, not imported).
export async function pullChangesFromGoogle(userId: string): Promise<{ updated: number; deleted: number }> {
  const user = await getConnectedUser(userId);
  if (!user?.googleCalendarId) return { updated: 0, deleted: 0 };

  const client = toCalendarClient(user.googleRefreshToken!);
  let updated = 0;
  let deleted = 0;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    let page;
    try {
      page = await client.events.list({
        calendarId: user.googleCalendarId,
        syncToken: user.googleCalendarSyncToken ?? undefined,
        pageToken,
        showDeleted: true,
      });
    } catch (err: any) {
      // A 410 means the stored syncToken itself is no longer valid (too old, or the calendar
      // changed in a way Google no longer has history for) — the only correct recovery per
      // Google's own docs is to drop it and do one full resync from scratch.
      if (err?.code === 410 || err?.response?.status === 410) {
        await prisma.user.update({ where: { id: userId }, data: { googleCalendarSyncToken: null } });
        return pullChangesFromGoogle(userId);
      }
      throw err;
    }

    for (const gEvent of page.data.items ?? []) {
      if (!gEvent.id) continue;
      const existing = await prisma.event.findUnique({ where: { googleEventId: gEvent.id } });
      if (!existing) continue; // foreign event, not ours — see this file's top comment.

      if (gEvent.status === 'cancelled') {
        await prisma.event.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
        deleted++;
        continue;
      }

      // Last-write-wins, compared against this Event's own updatedAt — a plain, documented
      // policy rather than real merge/conflict resolution, which two-way sync in a v1 pass
      // doesn't attempt.
      const googleUpdated = gEvent.updated ? new Date(gEvent.updated) : new Date(0);
      if (googleUpdated <= existing.updatedAt) continue;

      const { startDate, endDate, allDay } = fromGoogleDateFields(gEvent);
      await prisma.event.update({
        where: { id: existing.id },
        data: {
          title: gEvent.summary || existing.title,
          description: gEvent.description ?? null,
          location: gEvent.location ?? null,
          startDate,
          endDate,
          allDay,
        },
      });
      updated++;
    }

    pageToken = page.data.nextPageToken ?? undefined;
    if (page.data.nextSyncToken) nextSyncToken = page.data.nextSyncToken;
  } while (pageToken);

  if (nextSyncToken) {
    await prisma.user.update({ where: { id: userId }, data: { googleCalendarSyncToken: nextSyncToken } });
  }
  return { updated, deleted };
}
