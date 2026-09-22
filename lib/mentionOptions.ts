import type { AppUser, HierarchyWorkspace, Task } from '../store/useTaskStore';
import { scoreMatch } from './search';
import type { MentionKind } from './mentions';

export type MentionOption = {
  kind: MentionKind;
  id: string;
  label: string;
  sub?: string;
  score: number;
  // When the thing was created, as a timestamp. Used only to break ties — see the sort at the end.
  createdAt?: number;
};

export const MENTION_MAX_RESULTS = 8;

// The one place that decides what a mention picker offers.
//
// Extracted because there are now two pickers over the same data — the <textarea> one used by task
// comments, and the TipTap one used by the chat composer — and this session has already paid twice
// for two copies of one rule drifting apart (the push layer's header, and the tab state). The
// scoring, the ordering, the scoping and the sub-labels are decisions about the product, not about
// which editor happens to be on screen.
export function buildMentionOptions({
  query,
  sigil,
  workspaceId,
  tasks,
  users,
  workspaces,
}: {
  query: string;
  // '@' searches people, tasks and docs together; '#' narrows to tasks.
  sigil: '@' | '#';
  // null means "everything", which is right inside a task comment (already in a workspace) and wrong
  // in a message — see the callers.
  workspaceId?: string | null;
  tasks: Task[];
  users: AppUser[];
  workspaces: HierarchyWorkspace[];
}): MentionOption[] {
  const q = query.toLowerCase();
  const results: MentionOption[] = [];

  const scopeWorkspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : null;
  const listIds = scopeWorkspace ? new Set(scopeWorkspace.spaces.flatMap((sp) => sp.lists.map((l) => l.id))) : null;
  const memberIds = scopeWorkspace ? new Set(scopeWorkspace.members.map((m) => m.id)) : null;

  // Where each task lives, so two subtasks with the same name can be told apart. In a real workspace
  // a name like "Påsyn" repeats across every video, and without this the list is identical rows.
  const listNameById = new Map(
    workspaces.flatMap((w) => w.spaces).flatMap((sp) => sp.lists.map((l) => [l.id, l.name] as const))
  );

  for (const t of tasks) {
    if (t.archived) continue;
    if (listIds && !listIds.has(t.listId)) continue;
    const score = q ? scoreMatch(t.title, q) : 1;
    if (score === null) continue;
    const parent = t.parentId ? tasks.find((p) => p.id === t.parentId) : null;
    results.push({
      kind: 'task',
      id: t.id,
      label: t.title,
      sub: parent ? parent.title : listNameById.get(t.listId),
      score,
      createdAt: new Date(t.createdAt).getTime(),
    });
  }

  // Attachments, searched by their own file name. Offered under '@' alongside everything else and
  // under '#' with tasks, because a file belongs to a task and someone reaching for one by name is
  // usually reaching for the work it is attached to.
  for (const t of tasks) {
    if (listIds && !listIds.has(t.listId)) continue;
    for (const a of t.attachments ?? []) {
      const label = a.fileName || 'File';
      const score = q ? scoreMatch(label, q) : 1;
      if (score === null) continue;
      results.push({
        kind: 'file',
        id: a.id,
        label,
        // Which task it hangs off, for the same reason a task shows its list: two files called
        // "utkast.pdf" are indistinguishable without it.
        sub: t.title,
        score,
        createdAt: new Date(a.createdAt).getTime(),
      });
    }
  }

  if (sigil === '@') {
    for (const u of users) {
      if (memberIds && !memberIds.has(u.id)) continue;
      const score = q ? scoreMatch(u.name, q) : 1;
      if (score !== null) results.push({ kind: 'user', id: u.id, label: u.name, score });
    }
    for (const ws of workspaces) {
      if (workspaceId && ws.id !== workspaceId) continue;
      for (const space of ws.spaces) {
        for (const doc of space.spaceDocs) {
          const label = doc.title || 'Untitled';
          const score = q ? scoreMatch(label, q) : 1;
          if (score !== null) {
            results.push({
              kind: 'doc',
              id: doc.id,
              label,
              sub: space.name,
              score,
              createdAt: new Date(doc.createdAt).getTime(),
            });
          }
        }
      }
    }
  }

  // People first under '@'. '@' reads as addressing a person in every app that has ever had it, and
  // a task list crowding out the one name you were reaching for is the failure that gets noticed.
  const kindRank: Record<MentionKind, number> = { user: 0, task: 1, file: 2, doc: 3 };
  return results
    .sort(
      (a, b) =>
        kindRank[a.kind] - kindRank[b.kind] ||
        a.score - b.score ||
        // Newest first among equal matches, and it does most of the work before you have typed
        // anything: with an empty query every task scores the same, so this IS the order. It used to
        // fall through to the shortest name, which is not relevance — it is an accident of naming.
        //
        // Deliberately BELOW the score, not above it. Once you have typed something, what you typed
        // is a far better signal than when a thing was made; recency only decides between candidates
        // the query could not separate.
        (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
        a.label.length - b.label.length
    )
    .slice(0, MENTION_MAX_RESULTS);
}
