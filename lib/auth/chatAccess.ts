import { prisma } from '@/lib/prisma';
import { getAccessContext, canSee } from '@/lib/auth/access';

// Shared by every route touching a specific channel (messages GET/POST, PATCH rename) — every
// channel operation is auth-gated, unlike Space/List's looser "only privacy-changing fields need
// auth" precedent (see the channels PATCH route's own comment for why that precedent doesn't
// apply here).
export async function ensureChannelAccess(channelId: string, userId: string) {
  const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.deletedAt) return null;
  const ctx = await getAccessContext(channel.workspaceId, userId);
  if (!ctx.isMember || !canSee(channel, ctx)) return null;
  return channel;
}
