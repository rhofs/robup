import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';
import { BUILTIN_STATUS_TEMPLATES } from '@/lib/statusTemplates';

// Which status template a new Space in this workspace starts with. A workspace-wide setting, so a
// manager's to change.
export async function PUT(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getAccessContext(body.workspaceId, userId);
  if (!ctx.isManager) return NextResponse.json({ error: 'Only workspace admins can change this' }, { status: 403 });

  const templateId: string | null = typeof body.templateId === 'string' && body.templateId ? body.templateId : null;
  if (templateId && !BUILTIN_STATUS_TEMPLATES.some((t) => t.id === templateId)) {
    const t = await prisma.statusTemplate.findFirst({ where: { id: templateId, workspaceId: body.workspaceId }, select: { id: true } });
    if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  await prisma.workspace.update({ where: { id: body.workspaceId }, data: { defaultStatusTemplate: templateId } });
  return NextResponse.json({ defaultTemplate: templateId });
}
