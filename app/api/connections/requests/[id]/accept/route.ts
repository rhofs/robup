import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { canonicalPair } from '@/lib/auth/connections';

// Accept an incoming request — only the recipient (toUserId) can accept, never the sender (that
// would let someone connect to themselves-by-proxy by accepting their own outgoing request).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const request = await prisma.connectionRequest.findUnique({ where: { id } });
  // Same "not found" for a missing row and a real one that isn't addressed to me — never confirms
  // whether a given request id exists to someone who can't act on it.
  if (!request || request.toUserId !== userId) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const [userAId, userBId] = canonicalPair(request.fromUserId, request.toUserId);
  await prisma.$transaction([
    prisma.connection.upsert({ where: { userAId_userBId: { userAId, userBId } }, update: {}, create: { userAId, userBId } }),
    prisma.connectionRequest.delete({ where: { id } }),
  ]);

  return NextResponse.json({ connectedUserId: request.fromUserId });
}
