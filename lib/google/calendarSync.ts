import { calendar_v3, google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from './oauthClient';

// Google Calendar two-way sync (backlog #13). Syncs directly against the user's real *primary*
// Google Calendar — not a separate dedicated one (an earlier draft of this file used a lazily
// created "Siqt" secondary calendar; switched after direct user feedback pointing at ClickUp's
// own Calendar integration, which merges your actual Google Calendar in directly — a Google-
// native event just shows up, same as any Siqt-created one). One real scope cut remains, worth
// knowing before extending this further:
//
// **Polling, not real-time push webhooks.** Google's `events.watch` push-notification channels
// need a public HTTPS callback (siqt.no has one now) but also expire (max 7 days for Calendar)
// and need active renewal, plus header-signature verification — real infrastructure on top of
// what's here. Polling (this file's pullChangesFromGoogle, run on a schedule — see
// scripts/syncGoogleCalendar.ts, plus an on-demand call whenever Planner opens) is simpler and
// correct, just not instant; a few minutes of latency on the Google→Siqt direction is the
// accepted tradeoff.

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

// Same find-or-create-by-unique-owner shape as POST /api/workspaces/personal — reused here
// (not imported from that route, which is Next's own request-handler export, not a plain
// function) so a Google-native event pulled in for someone who has never once opened "My tasks"
// still has a real home to land in. A personal workspace is single-member by construction, so
// there's no ambiguity about who else could see it.
async function ensurePersonalWorkspaceId(userId: string): Promise<string> {
  const workspace = await prisma.workspace.upsert({
    where: { personalOwnerId: userId },
    update: {},
    create: {
      name: 'Personal',
      isPersonal: true,
      personalOwnerId: userId,
      memberships: { create: { userId, role: 'owner' } },
      spaces: { create: [{ name: 'Personal', lists: { create: [{ name: 'My tasks' }] } }] },
    },
  });
  return workspace.id;
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
      await client.events.update({ calendarId: 'primary', eventId: event.googleEventId, requestBody });
    } else {
      const created = await client.events.insert({ calendarId: 'primary', requestBody });
      await prisma.event.update({ where: { id: event.id }, data: { googleEventId: created.data.id } });
    }
  } catch (err: any) {
    // A 404 here means the event was deleted directly on the Google side — clear the stale id so
    // the next push just creates a fresh one instead of failing forever on the same dangling
    // reference.
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
  if (!owner) return;
  const client = toCalendarClient(owner.googleRefreshToken!);
  try {
    await client.events.delete({ calendarId: 'primary', eventId: googleEventId });
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

// A brand-new user's very first sync would otherwise pull in their *entire* Google Calendar
// history — every event they've ever had, going back years. Bounded to a reasonable rolling
// window instead: recent past (in case something just got moved) through a year out. Only
// applies to the initial full sync (no syncToken yet) — once a syncToken exists, Google's own
// incremental-sync API doesn't accept timeMin/timeMax alongside it (the token already encodes
// the scope established by that first call), so every later poll just uses the token as-is.
const INITIAL_SYNC_PAST_DAYS = 30;
const INITIAL_SYNC_FUTURE_DAYS = 365;

// Pulls whatever changed on this user's real Google Calendar since the last call (Google's own
// incremental-sync cursor, googleCalendarSyncToken) and applies it: updates/deletes for Events
// already known (matched by googleEventId — anything Siqt itself pushed), and a real new Siqt
// Event — landed in the user's personal ("My tasks") workspace, flagged importedFromGoogle — for
// anything genuinely new on the Google side. "Two-way" here means exactly that: a Google-native
// event really does show up in Siqt, and a Siqt-native event really does show up in Google.
export async function pullChangesFromGoogle(userId: string): Promise<{ created: number; updated: number; deleted: number }> {
  const user = await getConnectedUser(userId);
  if (!user) return { created: 0, updated: 0, deleted: 0 };

  const client = toCalendarClient(user.googleRefreshToken!);
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const isInitialSync = !user.googleCalendarSyncToken;

  do {
    let page;
    try {
      page = await client.events.list({
        calendarId: 'primary',
        syncToken: user.googleCalendarSyncToken ?? undefined,
        pageToken,
        showDeleted: true,
        ...(isInitialSync
          ? {
              timeMin: new Date(Date.now() - INITIAL_SYNC_PAST_DAYS * 86400_000).toISOString(),
              timeMax: new Date(Date.now() + INITIAL_SYNC_FUTURE_DAYS * 86400_000).toISOString(),
            }
          : {}),
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

      if (!existing) {
        if (gEvent.status === 'cancelled') continue; // never knew about it, nothing to delete
        const { startDate, endDate, allDay } = fromGoogleDateFields(gEvent);
        const workspaceId = await ensurePersonalWorkspaceId(userId);
        await prisma.event.create({
          data: {
            title: gEvent.summary || 'Untitled event',
            description: gEvent.description ?? null,
            location: gEvent.location ?? null,
            startDate,
            endDate,
            allDay,
            workspaceId,
            googleEventId: gEvent.id,
            googleSyncOwnerId: userId,
            importedFromGoogle: true,
          },
        });
        created++;
        continue;
      }

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
  return { created, updated, deleted };
}
