import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { canonicalPair } from '@/lib/auth/connections';

// Opening a personal connect link while signed in sends a connection REQUEST to the link owner —
// not an instant connection (superseded 2026-08-17; the original design here had no accept/decline
// step at all, see PLANNING.md's "Connections: request/accept flow" session note for why that
// changed). The link owner sees this as an incoming request in the Connections tab and explicitly
// accepts or declines it via /api/connections/requests/[id]/accept|decline.
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

  // Already connected (e.g. re-opening the link after it was accepted, or already coworkers who
  // happen to also share this link) — idempotent no-op, same "click a link twice" precedent as
  // WorkspaceInvite's own accept route, just reporting the already-true state back.
  const [userAId, userBId] = canonicalPair(userId, ownerId);
  const existingConnection = await prisma.connection.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (existingConnection) {
    return NextResponse.json({ status: 'connected', connectedUserId: ownerId });
  }

  // Mutual request — the owner already separately opened *my* link and is waiting on me. Rather
  // than making them separately find and accept my now-also-pending request, treat this as an
  // instant mutual accept: create the real Connection and clear both pending rows. Matches how
  // real friend-request systems treat "you both added each other" as immediate friends, not a
  // redundant double-confirm.
  const reverseRequest = await prisma.connectionRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: ownerId, toUserId: userId } },
  });
  if (reverseRequest) {
    await prisma.$transaction([
      prisma.connection.create({ data: { userAId, userBId } }),
      prisma.connectionRequest.delete({ where: { id: reverseRequest.id } }),
    ]);
    return NextResponse.json({ status: 'connected', connectedUserId: ownerId });
  }

  // Normal case — upsert (not create) so re-clicking the same link while a request is already
  // pending is a friendly no-op, not a unique-constraint error.
  await prisma.connectionRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId: ownerId } },
    update: {},
    create: { fromUserId: userId, toUserId: ownerId },
  });
  return NextResponse.json({ status: 'requested', connectedUserId: ownerId });
}
