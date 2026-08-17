import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Fetch-or-create MY personal connect link, atomic via upsert on the unique createdById column —
// same Workspace.personalOwnerId precedent this schema already uses to dodge a Strict-Mode
// double-invoke race (two near-simultaneous GETs from the Connections tab mounting twice in dev
// would otherwise both see "no invite yet" and both try to create one).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const invite = await prisma.connectionInvite.upsert({
    where: { createdById: userId },
    update: {},
    create: { createdById: userId },
  });
  return NextResponse.json(invite);
}

// Regenerate — invalidates the old code (delete) and issues a fresh one, for "I think this link
// leaked" without needing a separate list+revoke UI (there's only ever one link per user, unlike
// WorkspaceInvite's manageable list).
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await prisma.connectionInvite.deleteMany({ where: { createdById: userId } });
  const invite = await prisma.connectionInvite.create({ data: { createdById: userId } });
  return NextResponse.json(invite);
}
