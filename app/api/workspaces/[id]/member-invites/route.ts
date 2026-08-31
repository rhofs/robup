import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';
import { getConnectedUserIds } from '@/lib/auth/connections';

// Pending targeted invites for THIS workspace (backlog #8) — Owner/Admin only, shown in Workspace
// Settings' Invite tab alongside the existing reusable-link list.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json([]);
  const role = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(role)) return NextResponse.json([]);

  const invites = await prisma.workspaceMemberInvite.findMany({
    where: { workspaceId: id },
    include: { toUser: { select: publicUserSelect }, invitedBy: { select: publicUserSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(invites);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const role = await getWorkspaceRole(id, callerId);
  if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can invite' }, { status: 403 });

  const body = await req.json();

  // Two ways in. Picking someone from your Network passes `toUserId` and stays scoped to that
  // Network, so this can't be used as an open invite-any-user-id-you-know endpoint. Typing an
  // address passes `email` instead — added because picking from Network alone left no way to
  // invite someone you simply know the address of ("bør også kunne skrive inn eposten"), and is
  // not Network-scoped, since knowing the address IS the deliberate act here.
  //
  // Worth naming the tradeoff: the email path lets a workspace owner/admin learn whether a given
  // address has an account, from the distinct 404 below. That's accepted rather than hidden —
  // responding identically either way would make the feature useless (you'd never know if the
  // invite landed), and the capability is already limited to owners/admins of a workspace. There
  // is no email SENDING here either way: an existing account sees the invite in-app, and for an
  // address with no account the caller is pointed at the shareable invite link instead.
  let toUserId: string | null = null;

  if (typeof body.email === 'string' && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    // Case-insensitive on purpose, via raw SQL: SQLite's unique index on email is case-SENSITIVE,
    // and Prisma's `mode: 'insensitive'` isn't supported on this provider. The signup route
    // lowercases before storing, so most rows match a plain lookup — but accounts created through
    // Google's adapter keep whatever casing the provider hands over, and those would silently come
    // back "no account uses that email" here. Caught by a test that stored a mixed-case address
    // and failed to find it.
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE LOWER(email) = ${email} LIMIT 1`;
    const target = rows[0] ?? null;
    if (!target) {
      return NextResponse.json(
        { error: 'No account uses that email yet — share the invite link below so they can join.' },
        { status: 404 }
      );
    }
    if (target.id === callerId) return NextResponse.json({ error: "That's your own account" }, { status: 400 });
    toUserId = target.id;
  } else if (body.toUserId) {
    // Scoped to the caller's own Network (Connections + coworkers across shared workspaces).
    const connectedIds = await getConnectedUserIds(callerId);
    if (!connectedIds.has(body.toUserId)) {
      return NextResponse.json({ error: 'You can only invite someone from your Network' }, { status: 403 });
    }
    toUserId = body.toUserId;
  } else {
    return NextResponse.json({ error: 'Missing toUserId or email' }, { status: 400 });
  }

  // Unreachable in practice (every branch above either assigns or returns), but narrows
  // `toUserId` from `string | null` for the queries below — the Network branch assigns from an
  // untyped request body, so control-flow analysis can't do it on its own.
  if (!toUserId) return NextResponse.json({ error: 'Missing toUserId or email' }, { status: 400 });

  const alreadyMember = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: toUserId } },
  });
  if (alreadyMember) return NextResponse.json({ error: 'That person is already a member' }, { status: 400 });

  try {
    const invite = await prisma.workspaceMemberInvite.create({
      data: {
        workspaceId: id,
        toUserId,
        invitedById: callerId,
        role: body.role === 'admin' ? 'admin' : 'member',
      },
      include: { toUser: { select: publicUserSelect }, invitedBy: { select: publicUserSelect } },
    });
    return NextResponse.json(invite);
  } catch {
    // Unique constraint (workspaceId, toUserId) — an invite to this person is already pending.
    return NextResponse.json({ error: 'An invite is already pending for that person' }, { status: 409 });
  }
}
