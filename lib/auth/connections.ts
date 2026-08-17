import { prisma } from '@/lib/prisma';

// The full "can these two/more users DM or group-chat together" answer: an explicit Connection
// row OR sharing at least one Workspace via WorkspaceMembership. Computed on the fly (two small
// queries), never materialized — avoids any backfill for the "coworkers are already connected"
// half of the rule, and stays correct automatically as workspace membership changes (leaving a
// workspace correctly stops counting someone as connected via that workspace, no separate cleanup
// needed).
export async function getConnectedUserIds(userId: string): Promise<Set<string>> {
  const [explicitRows, myMemberships] = await Promise.all([
    prisma.connection.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    }),
    prisma.workspaceMembership.findMany({ where: { userId }, select: { workspaceId: true } }),
  ]);

  const ids = new Set<string>();
  for (const row of explicitRows) ids.add(row.userAId === userId ? row.userBId : row.userAId);

  const workspaceIds = myMemberships.map((m) => m.workspaceId);
  if (workspaceIds.length > 0) {
    const coworkers = await prisma.workspaceMembership.findMany({
      where: { workspaceId: { in: workspaceIds }, userId: { not: userId } },
      select: { userId: true },
    });
    for (const c of coworkers) ids.add(c.userId);
  }
  return ids;
}

export async function areConnected(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return false;
  return (await getConnectedUserIds(userIdA)).has(userIdB);
}

// Canonical, sorted pair — every write site touching Connection must go through this so a pair is
// only ever representable by one row (see Connection's own schema comment).
export function canonicalPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}
