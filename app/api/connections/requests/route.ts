import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// My pending connection requests, both directions — incoming (someone opened my connect link,
// waiting on me to accept/decline) and outgoing (I opened someone else's link, waiting on them).
// `user` in each row is always the *other* person, not the caller, so the Connections tab can
// render both lists without the client re-deriving "which side am I on."
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ incoming: [], outgoing: [] });

  const [incomingRows, outgoingRows] = await Promise.all([
    prisma.connectionRequest.findMany({
      where: { toUserId: userId },
      include: { fromUser: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.connectionRequest.findMany({
      where: { fromUserId: userId },
      include: { toUser: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    incoming: incomingRows.map((r) => ({ id: r.id, createdAt: r.createdAt, user: r.fromUser })),
    outgoing: outgoingRows.map((r) => ({ id: r.id, createdAt: r.createdAt, user: r.toUser })),
  });
}
