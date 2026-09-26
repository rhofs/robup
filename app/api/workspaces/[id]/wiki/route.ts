import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWikiAccess } from '@/lib/auth/wikiAccess';
import { parseAccessJson, type AccessJsonEntry } from '@/lib/auth/visibility';
import { ensureWikiSeeded } from '@/lib/wiki/seed';

// The whole wiki in one request: every page's title, place and plain text (Doc.content, the mirror
// the collab server keeps current), plus what the caller may do. A wiki is dozens of pages, not
// thousands, so sending the text along lets the search run instantly in the browser instead of a
// round-trip per keystroke. The pages' rich content still loads through the collab editor.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiAccess(workspaceId, userId);
  if (!access) return NextResponse.json({ error: 'No wiki here — it is turned off, or you are not a member' }, { status: 404 });

  await ensureWikiSeeded(workspaceId);
  const pages = await prisma.doc.findMany({
    where: { wikiWorkspaceId: workspaceId, deletedAt: null },
    select: { id: true, title: true, parentId: true, order: true, content: true, updatedAt: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({
    canEdit: access.canEdit,
    isManager: access.ctx.isManager,
    editors: parseAccessJson(access.ws.wikiEditorsJson),
    feedbackListId: access.ws.wikiFeedbackListId,
    pages: pages.map(({ content, ...p }) => ({ ...p, text: content })),
  });
}

// Wiki settings — who may edit, and where feedback goes. Owner/admin only: deciding who edits the
// company's shared reference is itself a management decision.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiAccess(workspaceId, userId);
  if (!access?.ctx.isManager) return NextResponse.json({ error: 'Only the owner or an admin can change wiki settings' }, { status: 403 });

  const body = await req.json();
  const data: { wikiEditorsJson?: string; wikiFeedbackListId?: string | null } = {};

  if (body.editors !== undefined) {
    if (!Array.isArray(body.editors)) return NextResponse.json({ error: 'editors must be a list' }, { status: 400 });
    // Only real members and real roles of this workspace — anything else is dropped, not stored.
    const [members, roles] = await Promise.all([
      prisma.workspaceMembership.findMany({ where: { workspaceId }, select: { userId: true } }),
      prisma.role.findMany({ where: { workspaceId }, select: { id: true } }),
    ]);
    const memberIds = new Set(members.map((m) => m.userId));
    const roleIds = new Set(roles.map((r) => r.id));
    const editors: AccessJsonEntry[] = (body.editors as AccessJsonEntry[]).filter(
      (e) => (e?.type === 'user' && memberIds.has(e.id)) || (e?.type === 'role' && roleIds.has(e.id))
    );
    data.wikiEditorsJson = JSON.stringify(editors);
  }

  if (body.feedbackListId !== undefined) {
    if (body.feedbackListId === null) data.wikiFeedbackListId = null;
    else {
      const list = await prisma.list.findFirst({ where: { id: body.feedbackListId, space: { workspaceId } }, select: { id: true } });
      if (!list) return NextResponse.json({ error: 'That list is not in this workspace' }, { status: 400 });
      data.wikiFeedbackListId = list.id;
    }
  }

  const ws = await prisma.workspace.update({ where: { id: workspaceId }, data, select: { wikiEditorsJson: true, wikiFeedbackListId: true } });
  return NextResponse.json({ editors: parseAccessJson(ws.wikiEditorsJson), feedbackListId: ws.wikiFeedbackListId });
}
