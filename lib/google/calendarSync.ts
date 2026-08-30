import { calendar_v3, google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from './oauthClient';

// Google Calendar sync (backlog #13), per-assignee AND per-workspace — matches the ClickUp
// behavior the user pointed to directly, on two separate axes:
// 1. Assignment, not creation: each person connects their *own* Google account (Account
//    Settings), and whatever's assigned to *them* — Task or Event, with at least one date set —
//    shows up on *their* own calendar. Not "whoever created it."
// 2. One calendar per workspace, not one global calendar: this person gets a SEPARATE dedicated
//    "Siqt - <workspace name>" calendar for each workspace they're in, created lazily
//    (calendars.insert) the first time they need one — so they can color-code/hide/mute each
//    workspace's calendar independently in Google Calendar, same as ClickUp's own per-List/
//    per-Space sync. See UserWorkspaceGoogleCalendar in schema.prisma.
//
// Deliberately isolated from the user's real primary calendar, per their own explicit privacy
// ask after seeing how broad `documents`/`calendar.events` sounded in Google's consent screen:
// this app requests `calendar.app.created` (see oauthClient.ts), a scope that can only ever see
// or touch calendars it itself created — Siqt has no API-level way to read, edit, or delete
// anything on the user's other calendars, full stop, not just "the code doesn't do that."
//
// Task sync is push-only (Siqt -> Google): a Task can have several independently-connected
// assignees, each with their own calendar copy — letting edits on any one of those copies write
// back to the single shared Task would be genuine, unresolved multi-writer conflict territory a
// v1 pass doesn't take on. Event sync stays genuinely two-way (pullChangesFromGoogle below),
// scoped per (user, workspace) same as everything else here — an event added directly to a real
// (non-personal) workspace's own dedicated calendar pulls back into THAT workspace, visible to
// its other members, exactly like adding it there from inside Siqt would be; only the Personal
// workspace's own calendar stays private by construction (nobody else is ever a member of it).
//
// **Polling, not real-time push webhooks**, for the Google -> Siqt direction. Google's
// `events.watch` push-notification channels need a public HTTPS callback (siqt.no has one now)
// but also expire (max 7 days for Calendar) and need active renewal, plus header-signature
// verification — real infrastructure on top of what's here. Polling (pullChangesFromGoogle, run
// on a schedule — see scripts/syncGoogleCalendar.ts, plus an on-demand call whenever Planner
// opens for a given workspace) is simpler and correct, just not instant.

function toCalendarClient(refreshToken: string) {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Keyed by `${userId}:${workspaceId}` — an in-process mutex so two near-simultaneous sync calls
// for the same (user, workspace) (e.g. a drag-move and a modal edit fired moments apart, both
// still fire-and-forget in flight when the DB has no calendar row yet) don't each independently
// call calendars.insert before either has a chance to write the row. The DB's own unique
// constraint (see the try/catch below) is what makes this actually *correct* if it's ever raced
// across more than one process — this Map is purely a fast-path that avoids ever creating the
// wasteful duplicate Google-side calendar in the far more common single-process case.
const calendarCreationLocks = new Map<string, Promise<Awaited<ReturnType<typeof prisma.userWorkspaceGoogleCalendar.create>>>>();

// Resolves everything a sync call needs for one (user, workspace) pair: their Calendar client,
// and the id of their dedicated calendar for that workspace — created lazily on first use and
// cached in UserWorkspaceGoogleCalendar from then on. Deliberately never 'primary' — see the
// file-level comment above.
async function getWorkspaceCalendarClient(userId: string, workspaceId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken) return null;
  const client = toCalendarClient(user.googleRefreshToken);

  const existing = await prisma.userWorkspaceGoogleCalendar.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (existing) return { client, calendarId: existing.googleCalendarId, calendarRow: existing };

  const lockKey = `${userId}:${workspaceId}`;
  const inFlight = calendarCreationLocks.get(lockKey);
  if (inFlight) {
    // Someone else in this same process is already creating this exact calendar — wait for it
    // rather than racing to create a second one.
    const row = await inFlight;
    return { client, calendarId: row.googleCalendarId, calendarRow: row };
  }

  const creation = (async () => {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    const created = await client.calendars.insert({ requestBody: { summary: `Siqt - ${workspace?.name ?? 'Workspace'}` } });
    const calendarId = created.data.id;
    if (!calendarId) throw new Error('Google did not return a calendar id from calendars.insert');
    // The lock above only covers this one process — the unique constraint on (userId,
    // workspaceId) is the real, always-correct tie-breaker if this ever races across more than
    // one (e.g. a deploy mid-request). Catch the loser's P2002 and defer to whichever row
    // actually won rather than crashing; that loser's own just-created Google calendar is left
    // orphaned (rare once the in-process lock above is doing its job) instead of risking a
    // second race trying to clean it up.
    try {
      return await prisma.userWorkspaceGoogleCalendar.create({ data: { userId, workspaceId, googleCalendarId: calendarId } });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      return prisma.userWorkspaceGoogleCalendar.findUniqueOrThrow({ where: { userId_workspaceId: { userId, workspaceId } } });
    }
  })();
  calendarCreationLocks.set(lockKey, creation);
  try {
    const calendarRow = await creation;
    return { client, calendarId: calendarRow.googleCalendarId, calendarRow };
  } finally {
    calendarCreationLocks.delete(lockKey);
  }
}

function isNotFoundError(err: any): boolean {
  return err?.code === 404 || err?.response?.status === 404 || err?.code === 410 || err?.response?.status === 410;
}

async function deleteGoogleEventById(client: calendar_v3.Calendar, calendarId: string, googleEventId: string): Promise<void> {
  try {
    await client.events.delete({ calendarId, eventId: googleEventId });
  } catch (err: any) {
    if (!isNotFoundError(err)) console.error('deleteGoogleEventById failed:', err?.message || err);
  }
}

// Task.workspaceId isn't a direct column — walks listId -> List.spaceId -> Space.workspaceId,
// the same chain every other Task-adjacent workspace lookup in this app uses.
async function getTaskWorkspaceId(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { list: { select: { space: { select: { workspaceId: true } } } } } });
  return task?.list.space.workspaceId ?? null;
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
//
// Both helpers below are deliberately independent of the SERVER PROCESS's own OS/`TZ` setting —
// an earlier version used `d.getFullYear()/getMonth()/getDate()` ("local" meaning whatever
// timezone the Node process itself is running in), on the assumption that the production
// container's `TZ` env var would actually be set to Europe/Oslo. In practice this app's real
// infrastructure proved unable to make that stick (the container kept reporting Europe/London —
// itself only 1 hour off from Oslo — even after setting the panel variable to Europe/Oslo,
// saving, restarting, *and* reinstalling), which is exactly the same 1-day-early bug from a
// different angle: Oslo midnight still falls on the *previous* calendar day when read back
// through a London-local clock. Intl.DateTimeFormat's own `timeZone` option does its own IANA
// timezone-database lookup regardless of the process's default, so pinning APP_TIMEZONE in code
// makes this correct without needing the server's own environment to cooperate at all.
const APP_TIMEZONE = 'Europe/Oslo';
const dateOnlyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

// Extracts a Google-Calendar-style "date-only" string (YYYY-MM-DD) for APP_TIMEZONE's own
// calendar day at this Date's real absolute instant. Confirmed live before this fix: a Task
// showing "the 4th" in Siqt landed on "the 3rd" in Google Calendar.
function localDateOnly(d: Date): string {
  return dateOnlyFormatter.format(d);
}

// How far APP_TIMEZONE's wall clock sits from UTC, in ms, at roughly the given instant —
// computed per-date (not a fixed constant) so it comes out right on either side of a DST
// transition. Standard trick: format the instant in APP_TIMEZONE, re-parse those same digits as
// if they were UTC, and diff against the real UTC instant.
function appTimezoneOffsetMs(atUtc: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(atUtc)) if (p.type !== 'literal') parts[p.type] = p.value;
  const wallClockAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wallClockAsUtc - atUtc.getTime();
}

// Inverse of localDateOnly, for the pull direction — the real absolute instant that's midnight
// in APP_TIMEZONE for a given Google "date-only" string, same TZ-independent approach.
function localMidnightFromDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d));
  return new Date(utcGuess.getTime() - appTimezoneOffsetMs(utcGuess));
}

function toGoogleAllDayFields(start: Date, endInclusive: Date) {
  const endExclusive = new Date(endInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { start: { date: localDateOnly(start) }, end: { date: localDateOnly(endExclusive) } };
}

// Creates, updates, or removes ONE assignee's own calendar copy of a Task, based on its current
// state — the single function every Task-mutating route calls (for every potentially-affected
// user) after a change to assignees, dates, title/description, or archived/deleted status.
// NOTE: if a Task moves to a List in a *different* workspace between syncs, this resolves the
// calendar for its new workspace — the old calendar's now-orphaned copy isn't cleaned up (a rare
// edge case a v1 pass doesn't chase; it just sits stale on the old calendar).
export async function syncTaskForUser(taskId: string, userId: string): Promise<void> {
  const [task, syncRow, workspaceId] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, description: true, startDate: true, dueDate: true, archived: true, deletedAt: true, assignees: { select: { id: true } } },
    }),
    prisma.taskGoogleSync.findUnique({ where: { taskId_userId: { taskId, userId } } }),
    getTaskWorkspaceId(taskId),
  ]);

  const range = task ? taskDateRange(task) : null;
  const shouldSync = !!task && !!workspaceId && !task.deletedAt && !task.archived && !!range && task.assignees.some((a) => a.id === userId);

  if (!shouldSync) {
    if (syncRow && workspaceId) {
      const connected = await getWorkspaceCalendarClient(userId, workspaceId);
      if (connected) await deleteGoogleEventById(connected.client, connected.calendarId, syncRow.googleEventId);
      await prisma.taskGoogleSync.delete({ where: { id: syncRow.id } }).catch(() => {});
    }
    return;
  }

  const connected = await getWorkspaceCalendarClient(userId, workspaceId!);
  if (!connected) return; // not (or no longer) Google-connected — nothing to push

  const requestBody: calendar_v3.Schema$Event = {
    summary: (task as SyncableTask).title,
    description: (task as SyncableTask).description ?? undefined,
    ...toGoogleAllDayFields(range!.start, range!.endInclusive),
  };

  try {
    if (syncRow) {
      await connected.client.events.update({ calendarId: connected.calendarId, eventId: syncRow.googleEventId, requestBody });
    } else {
      const created = await connected.client.events.insert({ calendarId: connected.calendarId, requestBody });
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
// (and their googleEventId, and the Task's own workspace chain) are still readable, since a
// cascading DB delete wouldn't leave anything to look up afterward.
export async function deleteTaskGoogleSyncs(taskId: string): Promise<void> {
  const [workspaceId, rows] = await Promise.all([getTaskWorkspaceId(taskId), prisma.taskGoogleSync.findMany({ where: { taskId } })]);
  if (!workspaceId || rows.length === 0) return;
  await Promise.all(
    rows.map(async (row) => {
      const connected = await getWorkspaceCalendarClient(row.userId, workspaceId);
      if (connected) await deleteGoogleEventById(connected.client, connected.calendarId, row.googleEventId);
    })
  );
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
  workspaceId: string;
  assignees: { id: string; email: string | null; googleEmail: string | null }[];
};

function toGoogleDateFields(event: { startDate: Date; endDate: Date; allDay: boolean }) {
  if (event.allDay) {
    // Google's all-day end date is exclusive; Siqt's own endDate is inclusive (same convention
    // ganttLayout.ts/clipRangeToWeek already use for Task ranges) — add one day going out.
    const endExclusive = new Date(event.endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);
    return { start: { date: localDateOnly(event.startDate) }, end: { date: localDateOnly(endExclusive) } };
  }
  return {
    start: { dateTime: event.startDate.toISOString() },
    end: { dateTime: event.endDate.toISOString() },
  };
}

// Same shape as syncTaskForUser — creates/updates/removes ONE assignee's own calendar copy of an
// Event, on that workspace's own dedicated calendar (Event.workspaceId is a direct column, no
// chain to walk). Other assignees are still listed as Calendar attendees on each copy (so
// everyone can see who else is on it), same as the original single-owner version did.
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
    if (syncRow && event) {
      const connected = await getWorkspaceCalendarClient(userId, event.workspaceId);
      if (connected) await deleteGoogleEventById(connected.client, connected.calendarId, syncRow.googleEventId);
      await prisma.eventGoogleSync.delete({ where: { id: syncRow.id } }).catch(() => {});
    }
    return;
  }

  const connected = await getWorkspaceCalendarClient(userId, event.workspaceId);
  if (!connected) return;

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
      await connected.client.events.update({ calendarId: connected.calendarId, eventId: syncRow.googleEventId, requestBody });
    } else {
      const created = await connected.client.events.insert({ calendarId: connected.calendarId, requestBody });
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
  const [event, rows] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { workspaceId: true } }),
    prisma.eventGoogleSync.findMany({ where: { eventId } }),
  ]);
  if (!event || rows.length === 0) return;
  await Promise.all(
    rows.map(async (row) => {
      const connected = await getWorkspaceCalendarClient(row.userId, event.workspaceId);
      if (connected) await deleteGoogleEventById(connected.client, connected.calendarId, row.googleEventId);
    })
  );
}

function fromGoogleDateFields(gEvent: calendar_v3.Schema$Event): { startDate: Date; endDate: Date; allDay: boolean } {
  if (gEvent.start?.date) {
    // All-day, Google's end is exclusive — subtract a day to get back to Siqt's inclusive
    // convention.
    const start = localMidnightFromDateOnly(gEvent.start.date);
    const endExclusive = localMidnightFromDateOnly(gEvent.end?.date ?? gEvent.start.date);
    const end = new Date(endExclusive);
    end.setDate(end.getDate() - 1);
    return { startDate: start, endDate: end < start ? start : end, allDay: true };
  }
  const start = new Date(gEvent.start?.dateTime ?? Date.now());
  const end = new Date(gEvent.end?.dateTime ?? gEvent.start?.dateTime ?? Date.now());
  return { startDate: start, endDate: end, allDay: false };
}

// A brand-new calendar's very first sync would otherwise pull in every event ever created on
// it — never actually a concern in practice (this app creates the calendar itself, empty), but
// kept as a defensive bound matching the original design in case a calendar somehow already had
// history (e.g. re-linked to a pre-existing one by hand later).
const INITIAL_SYNC_PAST_DAYS = 30;
const INITIAL_SYNC_FUTURE_DAYS = 365;

// Pulls whatever changed on this (user, workspace)'s dedicated Google calendar since the last
// call (Google's own incremental-sync cursor, stored per-calendar on UserWorkspaceGoogleCalendar)
// and applies it: updates/deletes for Events this user is already synced to (matched via
// EventGoogleSync), and a real new Siqt Event — landed in THIS workspace, with them as its sole
// assignee and flagged importedFromGoogle — for anything genuinely new on the Google side (i.e.
// an event the user added directly on this workspace's calendar in Google Calendar itself). A
// non-personal workspace's calendar is visible to its other members once pulled in, same as
// adding the event from inside Siqt would be — only the Personal workspace's own calendar stays
// private, since nobody else is ever a member of it.
export async function pullChangesFromGoogle(userId: string, workspaceId: string): Promise<{ created: number; updated: number; deleted: number }> {
  const connected = await getWorkspaceCalendarClient(userId, workspaceId);
  if (!connected) return { created: 0, updated: 0, deleted: 0 };
  const { client, calendarId, calendarRow } = connected;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const isInitialSync = !calendarRow.googleSyncToken;

  do {
    let page;
    try {
      page = await client.events.list({
        calendarId,
        syncToken: calendarRow.googleSyncToken ?? undefined,
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
        await prisma.userWorkspaceGoogleCalendar.update({ where: { id: calendarRow.id }, data: { googleSyncToken: null } });
        return pullChangesFromGoogle(userId, workspaceId);
      }
      throw err;
    }

    for (const gEvent of page.data.items ?? []) {
      if (!gEvent.id) continue;
      const existingSync = await prisma.eventGoogleSync.findUnique({ where: { userId_googleEventId: { userId, googleEventId: gEvent.id } } });

      if (!existingSync) {
        if (gEvent.status === 'cancelled') continue; // never knew about it, nothing to delete
        // A Task pushed to this same calendar (TaskGoogleSync — a separate table, since Task
        // sync is push-only/one-way, see the file-level comment) is invisible to the
        // EventGoogleSync check above by design. Without this second check, pulling would treat
        // every Task's own pushed copy as a brand-new Google-native event on every single poll,
        // phantom-reimporting it as a duplicate Event — confirmed live ("test task 1" showing up
        // twice, once as the real Task, once as a reimported Event with the Google badge).
        const isTasksOwnCopy = await prisma.taskGoogleSync.findUnique({ where: { userId_googleEventId: { userId, googleEventId: gEvent.id } } });
        if (isTasksOwnCopy) continue;
        const { startDate, endDate, allDay } = fromGoogleDateFields(gEvent);
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
    await prisma.userWorkspaceGoogleCalendar.update({ where: { id: calendarRow.id }, data: { googleSyncToken: nextSyncToken } });
  }
  return { created, updated, deleted };
}
