import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { pullChangesFromGoogle } from '@/lib/google/calendarSync';

// On-demand trigger for the Google→Siqt pull direction — the scheduled script
// (scripts/syncGoogleCalendar.ts) is the reliable background path, but waiting for its next run
// after just editing something on Google's side is a bad first-look experience. The client calls
// this when opening Planner (see CalendarView.tsx); a silent no-op if Google isn't connected.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const result = await pullChangesFromGoogle(userId);
  return NextResponse.json(result);
}
