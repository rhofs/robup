import type { HierarchyWorkspace } from '../store/useTaskStore';
import type { ChatChannel } from '../store/useChatStore';
import type { GroupMentionScope } from './mentionOptions';

// What a chat composer may mention: which workspace's people, tasks and docs, and which of the
// many-people mentions. Shared by the main feed and the thread panel, which are the same
// conversation and must offer the same things.
//
// A channel belongs to a workspace, so that is the answer. A DM belongs to none — it exists between
// people, not inside a company — so mentioning anything would either be unscoped (offering work the
// other person cannot open) or impossible. The rule the user set: only where you share a workspace,
// and only from the shared one. Resolved as the first workspace whose membership contains every
// participant; with more than one shared workspace the first is picked, which is the same
// arbitrary-but-stable choice the rest of the app makes for "a workspace we both have".
//
// Groups: a channel gets @everyone and its workspace's roles. A group DM gets @everyone and no roles —
// a role is a workspace's, and this conversation is not in one. A one-to-one DM gets neither: there
// is exactly one other person, and @everyone would only be a longer way of writing their name.
// @assignee is never offered in chat; it only means something on a task.
export function chatMentionScope(
  channel: ChatChannel | null | undefined,
  workspaces: HierarchyWorkspace[]
): { workspaceId: string | null; groups: GroupMentionScope | null } {
  if (!channel) return { workspaceId: null, groups: null };
  if (channel.type === 'channel') {
    return {
      workspaceId: channel.workspaceId,
      groups: { everyone: true, assignee: false, rolesWorkspaceId: channel.workspaceId, everyoneHint: 'Everyone in this channel' },
    };
  }
  const participantIds = (channel.members ?? []).map((m) => m.user.id);
  const shared =
    participantIds.length > 0
      ? workspaces.find((w) => !w.isPersonal && participantIds.every((uid) => w.members.some((m) => m.id === uid)))
      : undefined;
  return {
    workspaceId: shared?.id ?? null,
    groups:
      channel.type === 'group_dm'
        ? { everyone: true, assignee: false, rolesWorkspaceId: null, everyoneHint: 'Everyone in this conversation' }
        : null,
  };
}
