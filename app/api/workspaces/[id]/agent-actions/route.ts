import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { canManageWorkspace, getWorkspaceRole } from '@/lib/auth/access';
import { ensureDocAccess, ensureEventAccess, ensureFolderAccess, ensureListAccess, ensureTaskAccess } from '@/lib/auth/resourceAccess';
import type { RecordedChange } from '@/lib/agent/changes';

// The workspace's agent log (Settings → Workspace → Agent activity): what members' AI agents have
// done here, newest first, each as the one step it was — and whether the person looking may undo it.
//
// Every member can read it: an agent changes shared Lists, and "who did this, and with what" is not
// an administrative question. But a log line names a task, and tasks can be private — so a change
// is only described to someone who could open the thing it changed. To everyone else it is counted,
// not named, and the agent's own summary (free text that may quote a private title) is withheld
// along with it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const role = await getWorkspaceRole(id, userId);
  if (!role) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });

  const actions = await prisma.agentAction.findMany({
    where: { workspaceId: id, status: { not: 'running' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { id: true, name: true } } },
  });
  const undoers = await prisma.user.findMany({
    where: { id: { in: actions.map((a) => a.undoneById).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(undoers.map((u) => [u.id, u.name]));

  // Asked once per task or event, however many log lines mention it.
  const seen = new Map<string, Promise<boolean>>();
  type Kind = 't' | 'e' | 'l' | 'f' | 'd';
  const check: Record<Kind, (id: string) => Promise<unknown>> = {
    t: (id) => ensureTaskAccess(id, userId),
    e: (id) => ensureEventAccess(id, userId),
    l: (id) => ensureListAccess(id, userId),
    f: (id) => ensureFolderAccess(id, userId),
    d: (id) => ensureDocAccess(id, userId),
  };
  const canOpenOne = (kind: Kind, targetId: string): Promise<boolean> => {
    const key = `${kind}:${targetId}`;
    if (!seen.has(key)) seen.set(key, check[kind](targetId).then((a) => !!a));
    return seen.get(key)!;
  };
  // The thing changed, and every other task its description names.
  const canOpen = async (change: RecordedChange): Promise<boolean> => {
    const undo = change.undo;
    const target =
      'taskId' in undo
        ? canOpenOne('t', undo.taskId)
        : 'eventId' in undo
          ? canOpenOne('e', undo.eventId)
          : 'listId' in undo
            ? canOpenOne('l', undo.listId)
            : 'folderId' in undo
              ? canOpenOne('f', undo.folderId)
              : canOpenOne('d', undo.docId);
    const checks = [target, ...(change.mentions ?? []).map((id) => canOpenOne('t', id))];
    return (await Promise.all(checks)).every(Boolean);
  };

  const out = await Promise.all(
    actions.map(async (a) => {
      const changes = JSON.parse(a.changesJson) as RecordedChange[];
      const mine = a.userId === userId;
      const shown = await Promise.all(changes.map(async (c) => (mine || (await canOpen(c)) ? { label: c.label, outcome: c.undone ?? null } : null)));
      const hidden = shown.filter((c) => c === null).length;
      return {
        id: a.id,
        summary: hidden > 0 ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : a.summary,
        tokenName: a.tokenName,
        user: a.user,
        createdAt: a.createdAt,
        status: a.status,
        undoneAt: a.undoneAt,
        undoneBy: a.undoneById ? nameOf.get(a.undoneById) ?? null : null,
        changeCount: changes.length,
        hiddenCount: hidden,
        changes: shown.filter((c): c is { label: string; outcome: string | null } => c !== null),
        canUndo: a.status !== 'undone' && (mine || canManageWorkspace(role)),
      };
    })
  );
  return NextResponse.json(out);
}
