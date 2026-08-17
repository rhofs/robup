import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess } from '@/lib/auth/resourceAccess';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(body.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const field = await prisma.customField.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      listId: body.listId ?? null,
      name: body.name,
      type: body.type,
      options: JSON.stringify(body.options ?? []),
    },
  });
  return NextResponse.json({ ...field, options: JSON.parse(field.options) });
}