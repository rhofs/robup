import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getConnectedUserIds } from '@/lib/auth/connections';

// Free-text name search across every user in the app, so someone can find and directly request a
// person they share no workspace with (the personal /connect/[code] link remains the other way in,
// unchanged). Deliberately returns only publicUserSelect fields (no email/other PII) and a small
// capped result set — this is a real privacy tradeoff (any signed-in user can browse for anyone
// else by name), accepted explicitly by the user over the narrower "exact email only" alternative.
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const [users, connectedIds, requests] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: userId }, name: { contains: q } },
      select: publicUserSelect,
      take: 20,
      orderBy: { name: 'asc' },
    }),
    getConnectedUserIds(userId),
    prisma.connectionRequest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true },
    }),
  ]);

  const requestedByMe = new Set(requests.filter((r) => r.fromUserId === userId).map((r) => r.toUserId));
  const requestedByThem = new Set(requests.filter((r) => r.toUserId === userId).map((r) => r.fromUserId));

  const results = users.map((u) => ({
    ...u,
    status: connectedIds.has(u.id)
      ? ('connected' as const)
      : requestedByMe.has(u.id)
        ? ('requested-by-me' as const)
        : requestedByThem.has(u.id)
          ? ('requested-by-them' as const)
          : ('none' as const),
  }));

  return NextResponse.json(results);
}
