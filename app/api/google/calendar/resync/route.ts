import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { resyncAllForUser } from '@/lib/google/calendarSync';

// "Send everything to Google Calendar again" from Settings (lib/google/calendarSync.ts
// resyncAllForUser). Started and answered at once — pushing a few hundred items takes a while, and
// the person does not need to wait for it.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  resyncAllForUser(userId).catch(() => {});
  return NextResponse.json({ started: true });
}
