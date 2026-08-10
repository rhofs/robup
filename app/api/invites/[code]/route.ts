import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Deliberately public — no getCurrentUserId() check at all. The whole point of an invite link is
// that someone without an account yet needs to see "you're invited to join X" before they've
// signed in. Returns only what's needed to render that prompt — never a member list, never
// anything sensitive — so this being unauthenticated is safe by construction, not just "not
// gated yet."
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = await prisma.workspaceInvite.findUnique({
    where: { id: code },
    select: { role: true, workspace: { select: { name: true } } },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 });

  return NextResponse.json({ workspaceName: invite.workspace.name, role: invite.role });
}
