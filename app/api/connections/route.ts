import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// List everyone the caller can DM/group with: explicit Connection rows plus every coworker
// across every workspace they belong to (see lib/auth/connections.ts's getConnectedUserIds for
// the same union used to gate POST /api/dms). Tags each person with where the connection comes
// from, purely for display ("Connected directly" vs "Coworker") — the underlying permission is
// identical either way.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const [explicitRows, myMemberships] = await Promise.all([
    prisma.connection.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    }),
    prisma.workspaceMembership.findMany({ where: { userId }, select: { workspaceId: true } }),
  ]);
  const explicitIds = new Set(explicitRows.map((r) => (r.userAId === userId ? r.userBId : r.userAId)));

  const workspaceIds = myMemberships.map((m) => m.workspaceId);
  const coworkerIds = new Set<string>();
  if (workspaceIds.length > 0) {
    const coworkers = await prisma.workspaceMembership.findMany({
      where: { workspaceId: { in: workspaceIds }, userId: { not: userId } },
      select: { userId: true },
    });
    for (const c of coworkers) coworkerIds.add(c.userId);
  }

  const allIds = new Set([...explicitIds, ...coworkerIds]);
  const people = await prisma.user.findMany({
    where: { id: { in: [...allIds] } },
    select: publicUserSelect,
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    people.map((p) => ({ ...p, source: explicitIds.has(p.id) ? 'connection' : 'workspace' }))
  );
}
