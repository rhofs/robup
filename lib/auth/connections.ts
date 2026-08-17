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

export type SendConnectionRequestResult =
  | { status: 'connected'; connectedUserId: string }
  | { status: 'requested'; connectedUserId: string }
  | { status: 'error'; error: string };

// Shared by both ways of starting a connection — opening someone's personal /connect/[code] link
// (app/api/connect/[code]/accept/route.ts) and searching for them directly
// (app/api/connections/requests/route.ts POST). Same rules either way: idempotent if already
// connected, instant mutual-accept if they'd already requested you back, otherwise a normal
// pending request (upsert, so re-sending is a no-op rather than a unique-constraint error).
export async function sendConnectionRequest(fromUserId: string, toUserId: string): Promise<SendConnectionRequestResult> {
  if (fromUserId === toUserId) return { status: 'error', error: "That's you" };

  const [userAId, userBId] = canonicalPair(fromUserId, toUserId);
  const existingConnection = await prisma.connection.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (existingConnection) return { status: 'connected', connectedUserId: toUserId };

  const reverseRequest = await prisma.connectionRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId } },
  });
  if (reverseRequest) {
    await prisma.$transaction([
      prisma.connection.create({ data: { userAId, userBId } }),
      prisma.connectionRequest.delete({ where: { id: reverseRequest.id } }),
    ]);
    return { status: 'connected', connectedUserId: toUserId };
  }

  await prisma.connectionRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId, toUserId } },
    update: {},
    create: { fromUserId, toUserId },
  });
  return { status: 'requested', connectedUserId: toUserId };
}
