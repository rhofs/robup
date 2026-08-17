import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Deliberately public — no getCurrentUserId() check, same reasoning as /api/invites/[code]:
// someone without a session yet needs to see "connect with X?" before signing in. Returns only
// display fields, never anything sensitive.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = await prisma.connectionInvite.findUnique({
    where: { id: code },
    select: { createdBy: { select: { id: true, name: true, initials: true, color: true, avatarUrl: true } } },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired connect link' }, { status: 404 });
  return NextResponse.json(invite.createdBy);
}
