import { prisma } from '@/lib/prisma';
import { MENTION_RE, isGroupMentionId, mentionsToPlainText } from '@/lib/mentions';
import { notify } from '@/lib/notifications';
import { buildFolderChainVisibility, canSee, getWorkspaceAccessContexts } from '@/lib/auth/access';

// Who a posted text actually pings.
//
// A mention token is text the client typed, so nothing in it is trusted: a user id is only notified
// if that person can open the place it was written, a role only counts inside the workspace it
// belongs to, and @everyone expands to the people who can see the task or channel — worked out here,
// from the database, never from anything the client sent along. Sending a notification about a task
// someone cannot open would be worse than silence, and for a private task it would leak its title.

type MentionTargets = {
  userIds: Set<string>;
  // The name it was written under ('everyone' or 'all'), for the notification's wording. Null when
  // neither was used.
  everyone: 'everyone' | 'all' | null;
  assignee: boolean;
  roleIds: Set<string>;
};

export function parseMentionTargets(body: string): MentionTargets {
  const targets: MentionTargets = { userIds: new Set(), everyone: null, assignee: false, roleIds: new Set() };
  for (const m of body.matchAll(MENTION_RE)) {
    const [, , kind, id] = m;
    if (kind === 'user') targets.userIds.add(id);
    else if (kind === 'role') targets.roleIds.add(id);
    else if (kind === 'group' && isGroupMentionId(id)) {
      if (id === 'assignee') targets.assignee = true;
      else targets.everyone ??= id;
    }
  }
  return targets;
}

const hasTargets = (t: MentionTargets) => t.userIds.size > 0 || t.everyone !== null || t.assignee || t.roleIds.size > 0;

// userId → how they were reached: 'you' when named, otherwise the group or role that reached them
// ('@everyone', '@assignee', '@Designers'). Being named wins over any group that also covers you,
// because "Robin mentioned you" is the more useful thing to read.
export type MentionRecipients = Map<string, string>;

async function roleNames(workspaceId: string, roleIds: Set<string>) {
  if (roleIds.size === 0) return [];
  // Scoped to the workspace: a role id from another workspace is simply not a role here.
  return prisma.role.findMany({
    where: { workspaceId, id: { in: [...roleIds] } },
    select: { name: true, members: { select: { id: true } } },
  });
}

// Fills `out` in precedence order: named first, then assignees, then roles, then @everyone — the most
// specific reason someone was reached is the one they are told.
function collect(
  out: MentionRecipients,
  eligible: Set<string>,
  t: MentionTargets,
  assigneeIds: string[],
  roles: { name: string; members: { id: string }[] }[],
  // Muted members are skipped for the broadcast kinds only. Muting says "stop telling me about this
  // conversation"; being named personally is still a direct question (the rule chat already had).
  muted: Set<string> = new Set()
) {
  const add = (uid: string, reason: string, broadcast: boolean) => {
    if (!eligible.has(uid) || out.has(uid)) return;
    if (broadcast && muted.has(uid)) return;
    out.set(uid, reason);
  };
  for (const uid of t.userIds) add(uid, 'you', false);
  if (t.assignee) for (const uid of assigneeIds) add(uid, '@assignee', true);
  for (const r of roles) for (const m of r.members) add(m.id, `@${r.name}`, true);
  if (t.everyone) for (const uid of eligible) add(uid, `@${t.everyone}`, true);
}

// A comment on a task: everyone who can see the task is reachable. @assignee is the task's own
// assignees (still only those who can see it — an assignee can lose access when a list goes private).
export async function resolveTaskMentionRecipients(taskId: string, body: string): Promise<MentionRecipients> {
  const out: MentionRecipients = new Map();
  const t = parseMentionTargets(body);
  if (!hasTargets(t)) return out;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      isPrivate: true,
      accessJson: true,
      assignees: { select: { id: true } },
      list: {
        select: {
          isPrivate: true,
          accessJson: true,
          folderId: true,
          space: { select: { id: true, isPrivate: true, accessJson: true, workspaceId: true } },
        },
      },
    },
  });
  if (!task) return out;
  const { space } = task.list;

  const [contexts, folders, roles] = await Promise.all([
    getWorkspaceAccessContexts(space.workspaceId),
    prisma.folder.findMany({ where: { spaceId: space.id }, select: { id: true, parentId: true, isPrivate: true, accessJson: true } }),
    roleNames(space.workspaceId, t.roleIds),
  ]);
  const folderChainVisible = buildFolderChainVisibility(folders);
  const eligible = new Set(
    [...contexts.values()]
      .filter((ctx) => canSee(space, ctx) && folderChainVisible(task.list.folderId, ctx) && canSee(task.list, ctx) && canSee(task, ctx))
      .map((ctx) => ctx.userId)
  );

  collect(out, eligible, t, task.assignees.map((a) => a.id), roles);
  return out;
}

// A chat message: a channel reaches every workspace member who can see the channel — not only the
// ones who happen to have opened it, which is all a ChatChannelMember row means for a public channel.
// A DM or group DM reaches its members and nobody else, and has no roles: it belongs to no workspace.
export async function resolveChatMentionRecipients(
  channel: { id: string; type: string; workspaceId: string | null; isPrivate: boolean; accessJson: string },
  body: string
): Promise<MentionRecipients> {
  const out: MentionRecipients = new Map();
  const t = parseMentionTargets(body);
  if (!hasTargets(t)) return out;

  const chatMembers = await prisma.chatChannelMember.findMany({
    where: { channelId: channel.id },
    select: { userId: true, muted: true },
  });
  const muted = new Set(chatMembers.filter((m) => m.muted).map((m) => m.userId));

  let eligible: Set<string>;
  let roles: { name: string; members: { id: string }[] }[] = [];
  if (channel.type === 'channel' && channel.workspaceId) {
    const contexts = await getWorkspaceAccessContexts(channel.workspaceId);
    eligible = new Set([...contexts.values()].filter((ctx) => canSee(channel, ctx)).map((ctx) => ctx.userId));
    roles = await roleNames(channel.workspaceId, t.roleIds);
  } else {
    eligible = new Set(chatMembers.map((m) => m.userId));
  }

  // @assignee has no meaning in chat and the picker never offers it there; a hand-typed one reaches
  // nobody rather than guessing.
  collect(out, eligible, { ...t, assignee: false }, [], roles, muted);
  return out;
}

// Groups recipients by reason, so each group gets one notify() call with its own wording.
export function groupByReason(recipients: MentionRecipients): Map<string, string[]> {
  const byReason = new Map<string, string[]>();
  for (const [uid, reason] of recipients) byReason.set(reason, [...(byReason.get(reason) ?? []), uid]);
  return byReason;
}

function mentionTitle(actorName: string, reason: string, where: string) {
  return reason === 'you' ? `${actorName} mentioned you${where}` : `${actorName} mentioned ${reason}${where}`;
}

// Notifies everyone a chat message mentions and returns who that was, so the caller's ordinary
// "new message" push can skip them — otherwise one message buzzes a mentioned phone twice, and
// @everyone would do that to the whole channel.
export async function notifyChatMentions(params: {
  channel: { id: string; type: string; name: string | null; workspaceId: string | null; isPrivate: boolean; accessJson: string };
  body: string;
  actorId: string;
  actorName: string;
}): Promise<Set<string>> {
  const recipients = await resolveChatMentionRecipients(params.channel, params.body);
  recipients.delete(params.actorId);
  const where = params.channel.type === 'channel' && params.channel.name ? ` in #${params.channel.name}` : '';
  const text = mentionsToPlainText(params.body).trim().slice(0, 140) || null;
  for (const [reason, userIds] of groupByReason(recipients)) {
    await notify({ userIds, actorId: params.actorId, type: 'chat_mention', title: mentionTitle(params.actorName, reason, where), body: text });
  }
  return new Set(recipients.keys());
}

// Same for a comment on a task. The notification carries the task, so tapping it in the bell opens
// the task the comment is on.
export async function notifyTaskCommentMentions(params: { taskId: string; body: string; actorId: string }): Promise<void> {
  const recipients = await resolveTaskMentionRecipients(params.taskId, params.body);
  recipients.delete(params.actorId);
  if (recipients.size === 0) return;
  const [actor, task] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.actorId }, select: { name: true } }),
    prisma.task.findUnique({ where: { id: params.taskId }, select: { title: true } }),
  ]);
  const where = task?.title ? ` on “${task.title}”` : '';
  const text = mentionsToPlainText(params.body).trim().slice(0, 140) || null;
  for (const [reason, userIds] of groupByReason(recipients)) {
    await notify({
      userIds,
      actorId: params.actorId,
      type: 'comment_mention',
      title: mentionTitle(actor?.name ?? 'Someone', reason, where),
      body: text,
      taskId: params.taskId,
    });
  }
}
