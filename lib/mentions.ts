import type { AppUser, HierarchyWorkspace, Task } from '../store/useTaskStore';

// @-mentions are stored literally as plain text inside Comment.body / Doc.content — no schema
// change, just a convention: `@[Display Label](kind:id)`, markdown-link-like so it stays readable
// even in raw/edit-mode text. The label is only a fallback for a deleted entity — resolveMentionEntity
// always prefers a live lookup so a mention shows the CURRENT name, same as every other place in this
// app that displays a related entity's name (never a stored snapshot).
// 'file' is a task attachment. It is a mention rather than a plain link because a link would have
// to carry the URL in the message text, and the URL is an implementation detail that outlives
// nothing — rename the file, move it, and the link is stale. An id resolves to whatever the file is
// called now, which is the same reason every other kind here stores an id and not a name.
//
// 'group' and 'role' address several people at once rather than naming a thing. A group's id is one
// of GROUP_MENTION_IDS — who it expands to depends on where it was written (a task's assignees only
// mean something on a task), and that expansion happens on the server when the text is posted, never
// from anything the client claims. A role's id is a Role row, resolved live like every other kind.
export type MentionKind = 'task' | 'doc' | 'user' | 'file' | 'group' | 'role';

export const MENTION_RE = /@\[([^\]]+)\]\((task|doc|user|file|group|role):([a-zA-Z0-9_-]+)\)/g;

// 'all' and 'everyone' are the same group under two names, because people arrive with one habit or
// the other (Slack says @all/@channel, Discord says @everyone) and a picker that only answers to the
// word you did not type looks like it is missing the feature.
export const GROUP_MENTION_IDS = ['everyone', 'all', 'assignee'] as const;
export type GroupMentionId = (typeof GROUP_MENTION_IDS)[number];
export const isGroupMentionId = (id: string): id is GroupMentionId => (GROUP_MENTION_IDS as readonly string[]).includes(id);

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; kind: MentionKind; id: string; label: string };

export const buildMentionToken = (kind: MentionKind, id: string, label: string) => `@[${label}](${kind}:${id})`;

export const parseMentions = (text: string): MentionSegment[] => {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(text))) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'mention', kind: match[2] as MentionKind, id: match[3], label: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
};

export type MentionStoreData = {
  tasks: Task[];
  users: AppUser[];
  workspaces: HierarchyWorkspace[];
};

export type ResolvedMention = {
  label: string;
  found: boolean;
  // Present for 'doc' kind only, needed by jumpToMention to navigate to the right Space/Folder.
  spaceId?: string;
  folderId?: string | null;
  // Present for 'doc' kind only — the Doc's own assigned color, same field the sidebar tree
  // already renders it with. Lets a doc-mention chip match the doc's own color instead of a
  // fixed per-kind accent that ignores it.
  color?: string | null;
  // Present for 'file' kind only — where the attachment actually lives, so tapping the chip can open
  // it without the caller having to find the task it belongs to first.
  url?: string;
};

// Replaces every token with a readable `@Label`, for the places that show a message as plain text —
// a push notification or the bell. Uses the label baked into the token: the server has no store to
// resolve against, and a label that is a moment stale is still far better than a raw
// `@[Label](user:uuid)` on someone's lock screen, which is what the chat push showed before this.
export const mentionsToPlainText = (text: string): string =>
  text.replace(MENTION_RE, (_m, label: string) => `@${label}`);

// Live-resolves a mention's current display name from the store; falls back to the label baked
// into the token (found: false) if the entity has since been deleted.
export const resolveMentionEntity = (
  kind: MentionKind,
  id: string,
  fallbackLabel: string,
  { tasks, users, workspaces }: MentionStoreData
): ResolvedMention => {
  if (kind === 'group') {
    // Never "not found": the group itself always exists, even where it would expand to nobody.
    return { label: isGroupMentionId(id) ? id : fallbackLabel, found: isGroupMentionId(id) };
  }
  if (kind === 'role') {
    for (const ws of workspaces) {
      const role = ws.roles.find((r) => r.id === id);
      if (role) return { label: role.name, found: true, color: role.color };
    }
    return { label: fallbackLabel, found: false };
  }
  if (kind === 'task') {
    const task = tasks.find((t) => t.id === id);
    return task ? { label: task.title, found: true } : { label: fallbackLabel, found: false };
  }
  if (kind === 'user') {
    const user = users.find((u) => u.id === id);
    return user ? { label: user.name, found: true } : { label: fallbackLabel, found: false };
  }
  if (kind === 'file') {
    // Scanned across every loaded task rather than looked up by task id, because the token does not
    // carry one — a file mention is about the file, and which task it hangs off can change without
    // the mention meaning anything different.
    for (const t of tasks) {
      const found = (t.attachments ?? []).find((a) => a.id === id);
      if (found) return { label: found.fileName || 'File', found: true, url: found.url };
    }
    return { label: fallbackLabel, found: false };
  }
  // doc
  for (const ws of workspaces) {
    for (const space of ws.spaces) {
      const doc = space.spaceDocs.find((d) => d.id === id);
      if (doc) return { label: doc.title || 'Untitled', found: true, spaceId: space.id, folderId: doc.folderId, color: doc.color };
    }
  }
  return { label: fallbackLabel, found: false };
};
