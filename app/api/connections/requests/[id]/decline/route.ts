import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Decline — works for either side: the recipient declining an incoming request, or the sender
// canceling their own still-pending outgoing one. Both are the same operation (delete the row),
// just reached from different UI buttons.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const request = await prisma.connectionRequest.findUnique({ where: { id } });
  if (!request || (request.toUserId !== userId && request.fromUserId !== userId)) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  await prisma.connectionRequest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
