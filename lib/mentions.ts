import type { AppUser, HierarchyWorkspace, Task } from '../store/useTaskStore';

// @-mentions are stored literally as plain text inside Comment.body / Doc.content — no schema
// change, just a convention: `@[Display Label](kind:id)`, markdown-link-like so it stays readable
// even in raw/edit-mode text. The label is only a fallback for a deleted entity — resolveMentionEntity
// always prefers a live lookup so a mention shows the CURRENT name, same as every other place in this
// app that displays a related entity's name (never a stored snapshot).
export type MentionKind = 'task' | 'doc' | 'user';

export const MENTION_RE = /@\[([^\]]+)\]\((task|doc|user):([a-zA-Z0-9_-]+)\)/g;

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
};

// Live-resolves a mention's current display name from the store; falls back to the label baked
// into the token (found: false) if the entity has since been deleted.
export const resolveMentionEntity = (
  kind: MentionKind,
  id: string,
  fallbackLabel: string,
  { tasks, users, workspaces }: MentionStoreData
): ResolvedMention => {
  if (kind === 'task') {
    const task = tasks.find((t) => t.id === id);
    return task ? { label: task.title, found: true } : { label: fallbackLabel, found: false };
  }
  if (kind === 'user') {
    const user = users.find((u) => u.id === id);
    return user ? { label: user.name, found: true } : { label: fallbackLabel, found: false };
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
