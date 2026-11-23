import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { actingAs } from '@/lib/auth/actAs';

// Revoke one of your own keys. It stops working at once: the key is looked up on every request.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = actingAs() ? null : await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // userId in the where clause, so someone else's key cannot be revoked by guessing its id.
  const { count } = await prisma.apiToken.deleteMany({ where: { id, userId } });
  if (count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
