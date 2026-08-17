import { prisma } from '@/lib/prisma';
import { getAccessContext, canSee } from '@/lib/auth/access';

// Shared by every route touching a specific channel (messages GET/POST, PATCH rename) — every
// channel operation is auth-gated, unlike Space/List's looser "only privacy-changing fields need
// auth" precedent (see the channels PATCH route's own comment for why that precedent doesn't
// apply here).
//
// DM/group-DM rows (Phase 3) branch away from canSee entirely — canSee's owner/admin-sees-
// everything rule is correct for a private List but would wrongly let a workspace owner read
// into two other members' private DM, per PLANNING.md's "canSee vs membership split" note. A DM's
// only real gate is "is this caller an actual ChatChannelMember of it."
export async function ensureChannelAccess(channelId: string, userId: string) {
  const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.deletedAt) return null;

  if (channel.type === 'dm' || channel.type === 'group_dm') {
    const isChatMember = await prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    return isChatMember ? channel : null;
  }

  // A real 'channel' row always has workspaceId set at creation and it's never un-set — this null
  // check is belt-and-suspenders defense against the FK's own SetNull, not an expected runtime path.
  if (!channel.workspaceId) return null;
  const ctx = await getAccessContext(channel.workspaceId, userId);
  if (!ctx.isMember || !canSee(channel, ctx)) return null;
  return channel;
}
