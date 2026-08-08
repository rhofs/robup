import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, select: publicUserSelect });

  // Merges `email`/`hasPassword` onto the caller's own entry only — used by ProfilePage's
  // account-deletion confirmation (password re-entry vs. type-your-email-to-confirm for
  // Google-only accounts). Reuses this one already-fetched request rather than a separate
  // round trip; every other user's entry stays exactly what publicUserSelect produces, no leak.
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json(users);
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
