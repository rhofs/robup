import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { canonicalPair } from '@/lib/auth/connections';

// Removes an explicit Connection between the caller and `userId` — only ever meaningful for a
// `source: 'connection'` entry (GET /api/connections' own tag); a `source: 'workspace'` one has no
// underlying Connection row at all (see lib/auth/connections.ts's getConnectedUserIds), so this is
// a harmless no-op deleteMany against a pair that was never a real row in the first place. This
// can't "un-coworker" two people who share a workspace — only remove an *explicit* connection.
export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { userId } = await params;
  if (userId === callerId) return NextResponse.json({ error: "That's you" }, { status: 400 });

  const [userAId, userBId] = canonicalPair(callerId, userId);
  await prisma.connection.deleteMany({ where: { userAId, userBId } });
  return NextResponse.json({ ok: true });
}
