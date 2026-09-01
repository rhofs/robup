import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getConnectedUserIds } from '@/lib/auth/connections';

// Exact lookup by username OR email — replaced the old free-text name search across every user
// (which the user later flagged as a real privacy problem: "random people cannot search you").
// Returns at most one match (a plain array, same shape the old search endpoint returned, for
// minimal client-side churn) — you need to already know someone's exact username or email address
// to find them this way, not just a fragment of their name. The personal /connect/[code] link
// (app/api/connect/[code]) remains the other, unchanged way in.
//
// Email was added alongside username on direct request ("can you fix so we can also add people
// through their email, not just username"). Same privacy shape as username: an exact match, never
// a browsable list, so this reveals nothing to someone who doesn't already know the address —
// exactly the tradeoff already accepted and named in the workspace invite-by-email route
// (app/api/workspaces/[id]/member-invites), which does the identical thing one level up.
//
// `q` is the current parameter; `username` is still accepted so an older client (or a cached
// bundle mid-deploy) keeps working. Both are matched the same way: an input containing '@' is
// treated as an email, everything else as a username.
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const params = new URL(req.url).searchParams;
  const query = (params.get('q') ?? params.get('username') ?? '').trim().toLowerCase();
  if (!query) return NextResponse.json([]);

  // Case-insensitive email match via raw SQL: SQLite's unique index on email is case-SENSITIVE and
  // Prisma's `mode: 'insensitive'` isn't supported on this provider. The signup route lowercases
  // before storing, but accounts created through Google's adapter keep whatever casing the
  // provider handed over — those would silently come back "not found" on a plain equality lookup.
  // Same reasoning (and the same bug, caught the same way) as the member-invites route's own
  // email path. `username` needs no such treatment: it's always stored lowercase by construction.
  const findUser = async () => {
    if (query.includes('@')) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE LOWER(email) = ${query} LIMIT 1`;
      if (!rows[0]) return null;
      return prisma.user.findUnique({ where: { id: rows[0].id }, select: publicUserSelect });
    }
    return prisma.user.findUnique({ where: { username: query }, select: publicUserSelect });
  };

  const [user, connectedIds, requests] = await Promise.all([
    findUser(),
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
