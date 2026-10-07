import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';
import { BUILTIN_STATUS_TEMPLATES, parseTemplateStatuses, type TemplateStatus } from '@/lib/statusTemplates';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getAccessContext(body.workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  const space = await prisma.space.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      workspaceId: body.workspaceId,
      name: body.name,
    },
  });
  // The workspace's default status template, if it has chosen one (Edit statuses → "Default for new
  // Spaces"). Without one a Space has no statuses of its own and shows the built-in four.
  const statuses = await defaultTemplateStatuses(body.workspaceId);
  if (statuses.length) {
    await prisma.status.createMany({
      data: statuses.map((s, order) => ({
        spaceId: space.id,
        name: s.name,
        color: s.color,
        isDone: s.kind === 'done',
        isClosed: s.kind === 'closed',
        icon: s.icon ?? null,
        order,
      })),
    });
  }
  const created = statuses.length ? await prisma.status.findMany({ where: { spaceId: space.id }, orderBy: { order: 'asc' } }) : [];
  return NextResponse.json({ ...space, folders: [], lists: [], statuses: created, customFields: [], docFolders: [], spaceDocs: [] });
}

async function defaultTemplateStatuses(workspaceId: string): Promise<TemplateStatus[]> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { defaultStatusTemplate: true } });
  const key = ws?.defaultStatusTemplate;
  if (!key) return [];
  const builtin = BUILTIN_STATUS_TEMPLATES.find((t) => t.id === key);
  if (builtin) return builtin.statuses;
  const t = await prisma.statusTemplate.findFirst({ where: { id: key, workspaceId }, select: { statusesJson: true } });
  return parseTemplateStatuses(t?.statusesJson);
}
