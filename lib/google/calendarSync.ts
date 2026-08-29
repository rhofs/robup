import { calendar_v3, google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from './oauthClient';

// Google Calendar sync (backlog #13), per-assignee — matches the ClickUp behavior the user
// pointed to directly: each person connects their *own* Google account (Account Settings), and
// whatever's assigned to *them* — Task or Event, with at least one date set — shows up on *their*
// own primary Google Calendar. Not "whoever created it." See TaskGoogleSync/EventGoogleSync in
// schema.prisma for the per-(item, assignee) join rows this drives off of.
//
// Task sync is push-only (Siqt -> Google): a Task can have several independently-connected
// assignees, each with their own calendar copy — letting edits on any one of those copies write
// back to the single shared Task would be genuine, unresolved multi-writer conflict territory a
// v1 pass doesn't take on. Event sync stays genuinely two-way (pullChangesFromGoogle below), same
// as before, just re-keyed off EventGoogleSync instead of a single owner field.
//
// **Polling, not real-time push webhooks**, for the Google -> Siqt direction. Google's
// `events.watch` push-notification channels need a public HTTPS callback (siqt.no has one now)
// but also expire (max 7 days for Calendar) and need active renewal, plus header-signature
// verification — real infrastructure on top of what's here. Polling (pullChangesFromGoogle, run
// on a schedule — see scripts/syncGoogleCalendar.ts, plus an on-demand call whenever Planner
// opens) is simpler and correct, just not instant.

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

function isNotFoundError(err: any): boolean {
  return err?.code === 404 || err?.response?.status === 404 || err?.code === 410 || err?.response?.status === 410;
}

async function deleteGoogleEvent(userId: string, googleEventId: string): Promise<void> {
  const owner = await getConnectedUser(userId);
  if (!owner) return;
  const client = toCalendarClient(owner.googleRefreshToken!);
  try {
    await client.events.delete({ calendarId: 'primary', eventId: googleEventId });
  } catch (err: any) {
    if (!isNotFoundError(err)) console.error('deleteGoogleEvent failed:', err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// Task sync (push-only)
// ---------------------------------------------------------------------------

type SyncableTask = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  archived: boolean;
  deletedAt: Date | null;
  assignees: { id: string }[];
};

function taskDateRange(task: { startDate: Date | null; dueDate: Date | null }): { start: Date; endInclusive: Date } | null {
  if (!task.startDate && !task.dueDate) return null;
  const start = task.startDate ?? task.dueDate!;
  const endInclusive = task.dueDate ?? task.startDate!;
  return start <= endInclusive ? { start, endInclusive } : { start: endInclusive, endInclusive: start };
}

// Tasks have no explicit time-of-day concept (unlike Event's own allDay flag) — mirrored as a
// plain all-day (date-only) Google event spanning startDate..dueDate inclusive, or a single day
// if only one of the two is set.
function toGoogleAllDayFields(start: Date, endInclusive: Date) {
  const endExclusive = new Date(endInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
  return { start: { date: dateOnly(start) }, end: { date: dateOnly(endExclusive) } };
}

// Creates, updates, or removes ONE assignee's own calendar copy of a Task, based on its current
// state — the single function every Task-mutating route calls (for every potentially-affected
// user) after a change to assignees, dates, title/description, or archived/deleted status.
export async function syncTaskForUser(taskId: string, userId: string): Promise<void> {
  const [task, syncRow] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, description: true, startDate: true, dueDate: true, archived: true, deletedAt: true, assignees: { select: { id: true } } },
    }),
    prisma.taskGoogleSync.findUnique({ where: { taskId_userId: { taskId, userId } } }),
  ]);

  const range = task ? taskDateRange(task) : null;
  const shouldSync = !!task && !task.deletedAt && !task.archived && !!range && task.assignees.some((a) => a.id === userId);

  if (!shouldSync) {
    if (syncRow) {
      await deleteGoogleEvent(userId, syncRow.googleEventId);
      await prisma.taskGoogleSync.delete({ where: { id: syncRow.id } }).catch(() => {});
    }
    return;
  }

  const owner = await getConnectedUser(userId);
  if (!owner) return; // not (or no longer) Google-connected — nothing to push

  const client = toCalendarClient(owner.googleRefreshToken!);
  const requestBody: calendar_v3.Schema$Event = {
    summary: (task as SyncableTask).title,
    description: (task as SyncableTask).description ?? undefined,
    ...toGoogleAllDayFields(range!.start, range!.endInclusive),
  };

  try {
    if (syncRow) {
      await client.events.update({ calendarId: 'primary', eventId: syncRow.googleEventId, requestBody });
    } else {
      const created = await client.events.insert({ calendarId: 'primary', requestBody });
      if (created.data.id) {
        await prisma.taskGoogleSync.create({ data: { taskId, userId, googleEventId: created.data.id } });
      }
    }
  } catch (err: any) {
    if (isNotFoundError(err) && syncRow) {
      // Deleted directly on the Google side — clear the stale row so the next sync just creates
      // a fresh one instead of failing forever on the same dangling reference.
      await prisma.taskGoogleSync.delete({ where: { id: syncRow.id } }).catch(() => {});
    } else {
      console.error('syncTaskForUser failed:', err?.message || err);
    }
  }
}

// Convenience wrapper: syncs every user who's either currently assigned OR still has a sync row
// from before (covers both "newly assigned" and "removed as assignee" in one call, without the
// caller needing to diff old vs. new assignee lists itself). Call after any Task mutation that
// could affect assignment, dates, title/description, or archived status.
export async function syncTaskForAllRelevantUsers(taskId: string): Promise<void> {
  const [task, syncRows] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId }, select: { assignees: { select: { id: true } } } }),
    prisma.taskGoogleSync.findMany({ where: { taskId }, select: { userId: true } }),
  ]);
  const userIds = new Set<string>([...(task?.assignees.map((a) => a.id) ?? []), ...syncRows.map((r) => r.userId)]);
  await Promise.all([...userIds].map((uid) => syncTaskForUser(taskId, uid)));
}

// Called right before permanently deleting a Task (or soft-deleting it — see the route for why
// that path re-syncs instead) — removes every assignee's Google-side copy while the sync rows
// (and their googleEventId) are still readable, since a cascading DB delete wouldn't leave
// anything to look up afterward.
export async function deleteTaskGoogleSyncs(taskId: string): Promise<void> {
  const rows = await prisma.taskGoogleSync.findMany({ where: { taskId } });
  await Promise.all(rows.map((row) => deleteGoogleEvent(row.userId, row.googleEventId)));
}

// ---------------------------------------------------------------------------
// Event sync (two-way)
// ---------------------------------------------------------------------------

type SyncableEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  deletedAt: Date | null;
  assignees: { id: string; email: string | null; googleEmail: string | null }[];
};

function toGoogleDateFields(event: { startDate: Date; endDate: Date; allDay: boolean }) {
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

// Same shape as syncTaskForUser — creates/updates/removes ONE assignee's own calendar copy of an
// Event. Other assignees are still listed as Calendar attendees on each copy (so everyone can see
// who else is on it), same as the original single-owner version did.
export async function syncEventForUser(eventId: string, userId: string): Promise<void> {
  const [event, syncRow] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: { assignees: { select: { id: true, email: true, googleEmail: true } } },
    }),
    prisma.eventGoogleSync.findUnique({ where: { eventId_userId: { eventId, userId } } }),
  ]);

  const shouldSync = !!event && !event.deletedAt && event.assignees.some((a) => a.id === userId);

  if (!shouldSync) {
    if (syncRow) {
      await deleteGoogleEvent(userId, syncRow.googleEventId);
      await prisma.eventGoogleSync.delete({ where: { id: syncRow.id } }).catch(() => {});
    }
    return;
  }

  const owner = await getConnectedUser(userId);
  if (!owner) return;

  const client = toCalendarClient(owner.googleRefreshToken!);
  const ev = event as SyncableEvent;
  const attendees = ev.assignees
    .filter((a) => a.id !== userId)
    .map((a) => a.email ?? a.googleEmail)
    .filter((email): email is string => !!email)
    .map((email) => ({ email }));

  const requestBody: calendar_v3.Schema$Event = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    attendees,
    ...toGoogleDateFields(ev),
  };

  try {
    if (syncRow) {
      await client.events.update({ calendarId: 'primary', eventId: syncRow.googleEventId, requestBody });
    } else {
      const created = await client.events.insert({ calendarId: 'primary', requestBody });
      if (created.data.id) {
        await prisma.eventGoogleSync.create({ data: { eventId, userId, googleEventId: created.data.id } });
      }
    }
  } catch (err: any) {
    if (isNotFoundError(err) && syncRow) {
      await prisma.eventGoogleSync.delete({ where: { id: syncRow.id } }).catch(() => {});
    } else {
      console.error('syncEventForUser failed:', err?.message || err);
    }
  }
}

// Same "union of current assignees + stale sync rows" convenience as syncTaskForAllRelevantUsers.
export async function syncEventForAllRelevantUsers(eventId: string): Promise<void> {
  const [event, syncRows] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { assignees: { select: { id: true } } } }),
    prisma.eventGoogleSync.findMany({ where: { eventId }, select: { userId: true } }),
  ]);
  const userIds = new Set<string>([...(event?.assignees.map((a) => a.id) ?? []), ...syncRows.map((r) => r.userId)]);
  await Promise.all([...userIds].map((uid) => syncEventForUser(eventId, uid)));
}

// Same "read before cascade deletes it" reasoning as deleteTaskGoogleSyncs.
export async function deleteEventGoogleSyncs(eventId: string): Promise<void> {
  const rows = await prisma.eventGoogleSync.findMany({ where: { eventId } });
  await Promise.all(rows.map((row) => deleteGoogleEvent(row.userId, row.googleEventId)));
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
// this user is already synced to (matched via EventGoogleSync, scoped to just their own
// calendar), and a real new Siqt Event — landed in the user's personal ("My tasks") workspace,
// with them as its sole assignee and flagged importedFromGoogle — for anything genuinely new on
// the Google side.
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
      const existingSync = await prisma.eventGoogleSync.findUnique({ where: { userId_googleEventId: { userId, googleEventId: gEvent.id } } });

      if (!existingSync) {
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
            importedFromGoogle: true,
            assignees: { connect: [{ id: userId }] },
            googleSyncs: { create: { userId, googleEventId: gEvent.id } },
          },
        });
        created++;
        continue;
      }

      const existing = await prisma.event.findUnique({ where: { id: existingSync.eventId } });
      if (!existing) {
        await prisma.eventGoogleSync.delete({ where: { id: existingSync.id } }).catch(() => {});
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
