import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';
import { parseTemplateStatuses } from '@/lib/statusTemplates';

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

// Edit a template in place — its name, its statuses, or both — instead of deleting it and saving a new
// one. Spaces and Lists that took their statuses from it keep theirs: a template is copied, never linked.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const t = await prisma.statusTemplate.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!t) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const ctx = await getAccessContext(t.workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; statusesJson?: string } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    if (!name) return NextResponse.json({ error: 'A template needs a name' }, { status: 400 });
    data.name = name;
  }
  if (body.statuses !== undefined) {
    const statuses = parseTemplateStatuses(JSON.stringify(body.statuses));
    if (statuses.length === 0) return NextResponse.json({ error: 'A template needs statuses' }, { status: 400 });
    data.statusesJson = JSON.stringify(statuses);
  }
  const updated = await prisma.statusTemplate.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id, name: updated.name, statuses: parseTemplateStatuses(updated.statusesJson) });
}
