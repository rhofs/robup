import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess } from '@/lib/auth/resourceAccess';

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(body.spaceId, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const count = await prisma.status.count({ where: { spaceId: body.spaceId } });
  const status = await prisma.status.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      name: body.name,
      color: body.color ?? '#94A3B8',
      order: body.order ?? count,
    },
  });
  return NextResponse.json(status);
}