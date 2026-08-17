import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess, ensureFolderAccess } from '@/lib/auth/resourceAccess';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(body.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });
  if (body.folderId && !(await ensureFolderAccess(body.folderId, userId))) {
    return NextResponse.json({ error: 'Not authorized for this folder' }, { status: 403 });
  }

  const list = await prisma.list.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      folderId: body.folderId ?? null,
    },
    // Must match GET /api/workspaces's own List select shape field-for-field — the sidebar tree's
    // getListsIn() filters on `list.archived === false`, so a response missing `archived` (as this
    // route's select did until now) makes every freshly created list invisible until a refetch
    // brings back the field it was silently omitting, even though the row was created correctly.
    select: { id: true, name: true, color: true, textColor: true, icon: true, spaceId: true, folderId: true, order: true, archived: true, isPrivate: true, accessJson: true },
  });
  return NextResponse.json(list);
}
