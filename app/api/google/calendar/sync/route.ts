import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { pullChangesFromGoogle } from '@/lib/google/calendarSync';

// On-demand trigger for the Google→Siqt pull direction — the scheduled script
// (scripts/syncGoogleCalendar.ts) is the reliable background path, but waiting for its next run
// after just editing something on Google's side is a bad first-look experience. The client calls
// this when opening Planner for a given workspace (see CalendarView.tsx) — each workspace has
// its own dedicated calendar now (UserWorkspaceGoogleCalendar), so this only ever pulls the one
// relevant to whatever's currently on screen, not every workspace this person is in. A silent
// no-op if Google isn't connected, or if this workspace has no calendar yet (nothing's ever been
// synced to/from it).
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.workspaceId || typeof body.workspaceId !== 'string') {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }

  const result = await pullChangesFromGoogle(userId, body.workspaceId);
  return NextResponse.json(result);
}
