import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getConnectedUserIds } from '@/lib/auth/connections';

// Exact-username lookup — replaced the old free-text name search across every user (which the
// user later flagged as a real privacy problem: "random people cannot search you"). Returns at
// most one match (a plain array, same shape the old search endpoint returned, for minimal
// client-side churn) — you need to already know someone's exact username to find them this way,
// not just a fragment of their name. The personal /connect/[code] link (app/api/connect/[code])
// remains the other, unchanged way in. Always lowercased before comparing, matching how
// `username` is always stored lowercase (see schema.prisma's own comment) and the same
// normalization auth.ts's email lookup already uses.
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const username = new URL(req.url).searchParams.get('username')?.trim().toLowerCase() ?? '';
  if (!username) return NextResponse.json([]);

  const [user, connectedIds, requests] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: publicUserSelect }),
    getConnectedUserIds(userId),
    prisma.connectionRequest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true },
    }),
  ]);

  if (!user || user.id === userId) return NextResponse.json([]);

  const requestedByMe = requests.some((r) => r.fromUserId === userId && r.toUserId === user.id);
  const requestedByThem = requests.some((r) => r.toUserId === userId && r.fromUserId === user.id);

  return NextResponse.json([
    {
      ...user,
      status: connectedIds.has(user.id)
        ? ('connected' as const)
        : requestedByMe
          ? ('requested-by-me' as const)
          : requestedByThem
            ? ('requested-by-them' as const)
            : ('none' as const),
    },
  ]);
}
