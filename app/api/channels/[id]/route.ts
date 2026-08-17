import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const channel = await ensureChannelAccess(channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  const body = await req.json();
  const data: { name?: string; topic?: string | null } = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.topic !== undefined) data.topic = body.topic || null;

  const updated = await prisma.chatChannel.update({ where: { id: channelId }, data });
  return NextResponse.json(updated);
}
