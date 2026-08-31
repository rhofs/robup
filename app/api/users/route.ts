import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Everyone this caller can legitimately see: themselves, anyone they share a workspace with, and
// anyone they've explicitly connected with (Network). Deliberately NOT "every row in the User
// table," which is what this route used to return to any signed-in caller — publicUserSelect
// includes phone, googleEmail, bio and profile links, so a brand-new account could read the
// contact details of every stranger who had ever signed up, and every one of them showed up as a
// pickable assignee/attendee. Reported live: a newly-created account in its own fresh workspace
// could immediately assign work to an unrelated existing user.
//
// Connections are included alongside workspace co-members because that's exactly what the Network
// /DM feature is for — you can hold a DM with someone you share no workspace with, and their name
// and avatar have to resolve for that thread to render at all.
export async function GET() {
  const callerId = await getCurrentUserId();
  // No identity asserted -> no directory at all. Same rule GET /api/workspaces and GET /api/tasks
  // already enforce.
  if (!callerId) return NextResponse.json([]);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { id: callerId },
        { workspaceMemberships: { some: { workspace: { memberships: { some: { userId: callerId } } } } } },
        { connectionsAsA: { some: { userBId: callerId } } },
        { connectionsAsB: { some: { userAId: callerId } } },
      ],
    },
    orderBy: { name: 'asc' },
    select: publicUserSelect,
  });

  // Merges `email`/`hasPassword` onto the caller's own entry only — used by ProfilePage's
  // account-deletion confirmation (password re-entry vs. type-your-email-to-confirm for
  // Google-only accounts). Reuses this one already-fetched request rather than a separate
  // round trip; every other user's entry stays exactly what publicUserSelect produces, no leak.
  const me = await prisma.user.findUnique({ where: { id: callerId }, select: { email: true, password: true } });
  if (!me) return NextResponse.json(users);
  const withSelf = users.map((u) => (u.id === callerId ? { ...u, email: me.email, hasPassword: !!me.password } : u));
  return NextResponse.json(withSelf);
}

export async function POST(req: Request) {
  // No UI calls this anymore — the Team modal's old "+ Add user" quick-create (spawning a fake,
  // credential-less person) was removed once real signup existed. Kept only as a defensive
  // baseline (was previously reachable with zero auth check at all) rather than deleted outright,
  // since some future legitimate "invite" flow will likely still need a create-on-invite path.
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const user = await prisma.user.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      name: body.name,
      initials: body.initials,
      color: body.color ?? '#6366F1',
    },
    select: publicUserSelect,
  });
  return NextResponse.json(user);
}
