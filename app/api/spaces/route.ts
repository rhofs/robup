import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';

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
  return NextResponse.json({ ...space, folders: [], lists: [], statuses: [], customFields: [], docFolders: [], spaceDocs: [] });
}
