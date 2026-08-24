import { prisma } from '@/lib/prisma';

// Shared by GET /api/workspaces/[id]/channels and GET /api/dms — both already `include` the full
// `members` array (every ChatChannelMember scalar field, lastReadAt/userId/muted included, no
// query change needed there). One count query per channel, parallelized — cheap at this app's
// scale (a small, already canSee-filtered list, not a global scan). Excludes the caller's own
// authored messages from their own unread count, matching Slack/Discord's own convention — you
// don't need to be told about a message you just sent yourself.
export async function withUnreadCounts<
  T extends { id: string; members: { userId: string; lastReadAt: Date | null; muted: boolean }[] },
>(channels: T[], userId: string): Promise<(T & { unreadCount: number; muted: boolean })[]> {
  return Promise.all(
    channels.map(async (c) => {
      const myMembership = c.members.find((m) => m.userId === userId);
      const muted = myMembership?.muted ?? false;
      // Muted (backlog #6): still receives/stores messages normally for everyone else, just never
      // contributes to *this* member's own badge — skip the count query entirely, always 0.
      if (muted) return { ...c, unreadCount: 0, muted };
      const since = myMembership?.lastReadAt ?? new Date(0);
      // Top-level NOT (not the field-level `authorId: { not: userId }`) so a message whose author
      // was later hard-deleted (authorId: null, "history outlives the person") still correctly
      // counts as unread — field-level `not` on a nullable column excludes NULL rows in SQL's own
      // three-valued comparison logic, which would silently under-count here otherwise.
      const unreadCount = await prisma.chatMessage.count({
        where: { channelId: c.id, threadRootId: null, createdAt: { gt: since }, NOT: { authorId: userId } },
      });
      return { ...c, unreadCount, muted };
    })
  );
}
