import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureChannelAccess } from '@/lib/auth/chatAccess';

// Per-member mute (backlog #6) — never affects the channel/DM for anyone else, only this caller's
// own ChatChannelMember row (see lib/chatUnread.ts and messages/route.ts's push-notification skip
// for where `muted` actually takes effect). Upsert, not a plain update: a public channel's
// membership row is only lazily created on first GET/POST (see ensureChannelAccess's own callers),
// so muting a channel before ever opening it needs to be able to create that row too.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const channel = await ensureChannelAccess(channelId, userId);
  if (!channel) return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });

  const body = await req.json();
  const muted = !!body.muted;

  await prisma.chatChannelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    update: { muted },
    create: { channelId, userId, muted },
  });

  return NextResponse.json({ muted });
}
