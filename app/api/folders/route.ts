import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess, ensureFolderAccess } from '@/lib/auth/resourceAccess';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(body.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });
  if (body.parentId && !(await ensureFolderAccess(body.parentId, userId))) {
    return NextResponse.json({ error: 'Not authorized for the parent folder' }, { status: 403 });
  }

  const folder = await prisma.folder.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      parentId: body.parentId ?? null,
    },
    select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true, isPrivate: true, accessJson: true },
  });
  return NextResponse.json(folder);
}
