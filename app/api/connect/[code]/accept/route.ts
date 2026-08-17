import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { sendConnectionRequest } from '@/lib/auth/connections';

// Opening a personal connect link while signed in sends a connection REQUEST to the link owner —
// not an instant connection (superseded 2026-08-17; the original design here had no accept/decline
// step at all, see PLANNING.md's "Connections: request/accept flow" session note for why that
// changed). The link owner sees this as an incoming request in the Connections tab and explicitly
// accepts or declines it via /api/connections/requests/[id]/accept|decline. The actual
// create-or-mutual-accept logic is shared with the search-based "send request directly" flow (see
// lib/auth/connections.ts's sendConnectionRequest) — this route's own job is just resolving the
// link code to an owner id first.
export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const invite = await prisma.connectionInvite.findUnique({ where: { id: code } });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired connect link' }, { status: 404 });
  const ownerId = invite.createdById;
  if (ownerId === userId) {
    return NextResponse.json({ error: "That's your own connect link" }, { status: 400 });
  }

  const result = await sendConnectionRequest(userId, ownerId);
  if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
