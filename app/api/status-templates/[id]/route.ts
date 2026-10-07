import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const t = await prisma.statusTemplate.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const ctx = await getAccessContext(t.workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  await prisma.$transaction([
    // A deleted template stops being the default — new Spaces fall back to the built-in set.
    prisma.workspace.updateMany({ where: { id: t.workspaceId, defaultStatusTemplate: id }, data: { defaultStatusTemplate: null } }),
    prisma.statusTemplate.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
