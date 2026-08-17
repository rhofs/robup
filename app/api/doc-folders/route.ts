import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess, ensureDocFolderAccess } from '@/lib/auth/resourceAccess';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(body.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });
  if (body.parentId && !(await ensureDocFolderAccess(body.parentId, userId))) {
    return NextResponse.json({ error: 'Not authorized for the parent doc folder' }, { status: 403 });
  }

  const folder = await prisma.docFolder.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      parentId: body.parentId ?? null,
    },
    select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true },
  });
  return NextResponse.json(folder);
}
