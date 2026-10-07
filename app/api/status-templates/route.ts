import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';
import { parseTemplateStatuses } from '@/lib/statusTemplates';

// A workspace's saved status templates (the built-in ones live in lib/statusTemplates.ts), and which one
// new Spaces start with. Any member may save one; only a manager may change the default
// (status-templates/default).
export async function GET(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get('workspaceId') ?? '';
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getAccessContext(workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  const [rows, ws] = await Promise.all([
    prisma.statusTemplate.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { defaultStatusTemplate: true } }),
  ]);
  return NextResponse.json({
    templates: rows.map((t) => ({ id: t.id, name: t.name, statuses: parseTemplateStatuses(t.statusesJson) })),
    defaultTemplate: ws?.defaultStatusTemplate ?? null,
    canSetDefault: ctx.isManager,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getAccessContext(body.workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  const statuses = parseTemplateStatuses(JSON.stringify(body.statuses ?? []));
  if (!name || statuses.length === 0) return NextResponse.json({ error: 'A template needs a name and statuses' }, { status: 400 });

  const t = await prisma.statusTemplate.create({
    data: { workspaceId: body.workspaceId, name, statusesJson: JSON.stringify(statuses), createdById: userId },
  });
  return NextResponse.json({ id: t.id, name: t.name, statuses });
}
