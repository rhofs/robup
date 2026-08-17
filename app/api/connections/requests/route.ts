import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { sendConnectionRequest } from '@/lib/auth/connections';

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

// Send a request directly to a user found via search (app/api/connections/search/route.ts) —
// the other way in besides opening someone's personal connect link. Same underlying
// create-or-mutual-accept rules either way (lib/auth/connections.ts's sendConnectionRequest).
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  if (!body.toUserId) return NextResponse.json({ error: 'Missing toUserId' }, { status: 400 });

  const result = await sendConnectionRequest(userId, body.toUserId);
  if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
