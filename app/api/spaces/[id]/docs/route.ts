import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = await getCurrentUserId();

  // A subpage (parentId set) inherits spaceId from its parent doc server-side rather than trusting
  // whatever spaceId the client sent — the parent doc is the source of truth for which Space (and
  // therefore Workspace) the whole subtree belongs to. It also gets no folderId of its own; it's
  // reached only through the parent doc's own Subpages table/sidebar expansion, never the flat
  // folder listing.
  let spaceId = id;
  let folderId = body.folderId ?? null;
  if (body.parentId) {
    const parent = await prisma.doc.findUniqueOrThrow({ where: { id: body.parentId }, select: { spaceId: true } });
    spaceId = parent.spaceId ?? id;
    folderId = null;
  }

  const order = await prisma.doc.count({ where: { spaceId, folderId, parentId: body.parentId ?? null } });
  const doc = await prisma.doc.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId,
      folderId,
      parentId: body.parentId ?? null,
      ownerId: userId,
      title: body.title || 'Untitled',
      content: body.content || '',
      order: body.order ?? order,
    },
  });
  return NextResponse.json(doc);
}
