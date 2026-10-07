import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess } from '@/lib/auth/resourceAccess';

// "Apply changes" in the Edit statuses window (components/StatusEditor.tsx): the Space's whole status
// set in one go, in its new order, rather than one PATCH per edit — the window edits a draft, the way
// ClickUp's does, and a template swaps every status at once.
//
// body.statuses: [{ id?, name, color, kind: 'open'|'done'|'closed', icon }] — an id keeps that status
//   (renamed, recoloured, reordered…); one without is created; an existing status left out is deleted.
// body.rename: { oldName: newName } — tasks are filed under a status *name*, so this moves them: the
//   renamed statuses, and the removed ones to whichever status the person chose for their tasks.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const incoming = (Array.isArray(body.statuses) ? body.statuses : [])
    .map((s: Record<string, unknown>) => ({
      id: typeof s.id === 'string' ? s.id : undefined,
      name: typeof s.name === 'string' ? s.name.trim().slice(0, 60) : '',
      color: typeof s.color === 'string' ? s.color.slice(0, 32) : '#94A3B8',
      kind: s.kind === 'done' || s.kind === 'closed' ? s.kind : 'open',
      icon: typeof s.icon === 'string' && s.icon ? s.icon.slice(0, 32) : null,
    }))
    .filter((s: { name: string }) => s.name);
  if (incoming.length === 0) return NextResponse.json({ error: 'A Space needs at least one status' }, { status: 400 });
  const lower = incoming.map((s: { name: string }) => s.name.toLowerCase());
  if (new Set(lower).size !== lower.length) return NextResponse.json({ error: 'Two statuses have the same name' }, { status: 400 });

  const newNames = new Set<string>(incoming.map((s: { name: string }) => s.name));
  const rename = Object.entries((body.rename ?? {}) as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[0] !== e[1] && newNames.has(e[1])
  );

  const existing = await prisma.status.findMany({ where: { spaceId: id }, select: { id: true } });
  const existingIds = new Set(existing.map((s) => s.id));
  const keepIds = new Set<string>(incoming.filter((s: { id?: string }) => s.id && existingIds.has(s.id)).map((s: { id: string }) => s.id));

  await prisma.$transaction(async (tx) => {
    const listIds = (await tx.list.findMany({ where: { spaceId: id }, select: { id: true } })).map((l) => l.id);
    // Through a placeholder name first, so swapping two names (A→B, B→A) doesn't merge their tasks.
    const moves = rename.map(([from, to], i) => ({ from, to, tmp: `\u0000siqt-status-${i}` }));
    for (const m of moves) await tx.task.updateMany({ where: { listId: { in: listIds }, status: m.from }, data: { status: m.tmp } });
    for (const m of moves) await tx.task.updateMany({ where: { listId: { in: listIds }, status: m.tmp }, data: { status: m.to } });

    await tx.status.deleteMany({ where: { spaceId: id, id: { notIn: [...keepIds] } } });
    for (const [order, s] of incoming.entries()) {
      const data = { name: s.name, color: s.color, isDone: s.kind === 'done', isClosed: s.kind === 'closed', icon: s.icon, order };
      if (s.id && keepIds.has(s.id)) await tx.status.update({ where: { id: s.id }, data });
      else await tx.status.create({ data: { ...data, spaceId: id } });
    }
  });

  const statuses = await prisma.status.findMany({ where: { spaceId: id }, orderBy: { order: 'asc' } });
  return NextResponse.json({ statuses });
}
