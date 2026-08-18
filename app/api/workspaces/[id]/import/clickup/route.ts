import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

// Same gate as app/api/workspaces/[id]/invites/route.ts — anything that reshapes a workspace's
// own structure (here: bulk-creating Spaces/Folders/Lists/Statuses/Tasks) is Owner/Admin only.
async function requireManager(workspaceId: string) {
  const callerId = await getCurrentUserId();
  if (!callerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const role = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(role)) return { error: NextResponse.json({ error: 'Only the workspace owner/admins can import data' }, { status: 403 }) };
  return { callerId };
}

type ClickUpRow = Record<string, string>;

const PRIORITY_MAP: Record<string, number> = { urgent: 1, high: 2, normal: 3, low: 4 };

function parseFolderPath(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
  } catch {
    return [];
  }
}

// ClickUp's own export format here — "[Name One,Name Two]" — is bracket-wrapped but NOT JSON
// (names aren't quoted), so JSON.parse would throw. Best-effort: strip the brackets, split on
// comma. Assumes no individual name contains a literal comma (true for every name seen in
// practice), documented as a known limitation rather than silently mishandled.
function parseAssignees(raw: string | undefined): string[] {
  if (!raw) return [];
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseEpochMs(raw: string | undefined): Date | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  // ClickUp represents a date-only field (no specific time picked) as UTC midnight of the
  // intended calendar day, regardless of the workspace's own timezone — landing on a nonzero
  // *local* hour anywhere east of UTC (02:00 in Oslo during DST). This app's own date picker
  // (DatePickerPopover) always stores "no time set" as LOCAL midnight instead, and the Planner's
  // Day view infers "all day" from that local convention — so an unconverted import silently
  // misread as "has a specific time," landing at ~02:00 in the timeline instead of the All-day
  // strip. Re-anchor to local midnight of the same UTC calendar day so imported tasks match this
  // app's own convention. Safe without a separate "has time" column to consult: a row that
  // genuinely has a time-of-day set essentially never lands exactly on UTC midnight by coincidence.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return d;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const { error } = await requireManager(workspaceId);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const rows: ClickUpRow[] = Array.isArray(body?.rows) ? body.rows : [];

  const [existingSpaces, existingFolders, existingLists, existingStatuses, members] = await Promise.all([
    prisma.space.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.folder.findMany({ where: { space: { workspaceId } }, select: { id: true, name: true, spaceId: true, parentId: true } }),
    prisma.list.findMany({ where: { space: { workspaceId } }, select: { id: true, name: true, spaceId: true, folderId: true } }),
    prisma.status.findMany({ where: { space: { workspaceId } }, select: { id: true, name: true, spaceId: true } }),
    prisma.workspaceMembership.findMany({ where: { workspaceId }, select: { user: { select: { id: true, name: true } } } }),
  ]);

  const spaceByName = new Map(existingSpaces.map((s) => [s.name, s.id]));
  const folderByKey = new Map(existingFolders.map((f) => [`${f.spaceId}:${f.parentId ?? 'root'}:${f.name}`, f.id]));
  const listByKey = new Map(existingLists.map((l) => [`${l.spaceId}:${l.folderId ?? 'root'}:${l.name}`, l.id]));
  const statusByKey = new Map(existingStatuses.map((s) => [`${s.spaceId}:${s.name.toLowerCase()}`, s.name]));
  const userByName = new Map(members.map((m) => [m.user.name, m.user.id]));

  let spaceOrder = existingSpaces.length;
  const folderOrderBySpace = new Map<string, number>();
  const listOrderByScope = new Map<string, number>();
  const statusOrderBySpace = new Map<string, number>();
  for (const f of existingFolders) folderOrderBySpace.set(f.spaceId, (folderOrderBySpace.get(f.spaceId) ?? 0) + 1);
  for (const l of existingLists) listOrderByScope.set(`${l.spaceId}:${l.folderId ?? 'root'}`, (listOrderByScope.get(`${l.spaceId}:${l.folderId ?? 'root'}`) ?? 0) + 1);
  for (const s of existingStatuses) statusOrderBySpace.set(s.spaceId, (statusOrderBySpace.get(s.spaceId) ?? 0) + 1);

  let spacesCreated = 0;
  let foldersCreated = 0;
  let listsCreated = 0;
  let statusesCreated = 0;
  let tasksCreated = 0;
  const unmatchedAssignees = new Set<string>();
  const skippedRows: { taskName: string; reason: string }[] = [];
  const clickUpIdToTaskId = new Map<string, string>();
  const pendingParents: { taskId: string; clickUpParentId: string }[] = [];

  async function resolveSpace(name: string): Promise<string> {
    const existing = spaceByName.get(name);
    if (existing) return existing;
    const created = await prisma.space.create({ data: { workspaceId, name, order: spaceOrder++ }, select: { id: true } });
    spaceByName.set(name, created.id);
    spacesCreated++;
    return created.id;
  }

  async function resolveFolderChain(spaceId: string, segments: string[]): Promise<string | null> {
    let parentId: string | null = null;
    for (const name of segments) {
      const key = `${spaceId}:${parentId ?? 'root'}:${name}`;
      const existingFolderId: string | undefined = folderByKey.get(key);
      if (existingFolderId) {
        parentId = existingFolderId;
        continue;
      }
      const order = folderOrderBySpace.get(spaceId) ?? 0;
      folderOrderBySpace.set(spaceId, order + 1);
      const created: { id: string } = await prisma.folder.create({ data: { spaceId, parentId, name, order }, select: { id: true } });
      folderByKey.set(key, created.id);
      foldersCreated++;
      parentId = created.id;
    }
    return parentId;
  }

  async function resolveList(spaceId: string, folderId: string | null, name: string): Promise<string> {
    const key = `${spaceId}:${folderId ?? 'root'}:${name}`;
    const existing = listByKey.get(key);
    if (existing) return existing;
    const scopeKey = `${spaceId}:${folderId ?? 'root'}`;
    const order = listOrderByScope.get(scopeKey) ?? 0;
    listOrderByScope.set(scopeKey, order + 1);
    const created = await prisma.list.create({ data: { spaceId, folderId, name, order }, select: { id: true } });
    listByKey.set(key, created.id);
    listsCreated++;
    return created.id;
  }

  async function resolveStatus(spaceId: string, rawName: string): Promise<string> {
    const key = `${spaceId}:${rawName.toLowerCase()}`;
    const existing = statusByKey.get(key);
    if (existing) return existing;
    const order = statusOrderBySpace.get(spaceId) ?? 0;
    statusOrderBySpace.set(spaceId, order + 1);
    await prisma.status.create({ data: { spaceId, name: rawName, order } });
    statusByKey.set(key, rawName);
    statusesCreated++;
    return rawName;
  }

  for (const row of rows) {
    const title = row['Task Name']?.trim();
    if (!title) {
      skippedRows.push({ taskName: row['Task Name'] ?? '', reason: 'Missing Task Name' });
      continue;
    }
    const spaceName = row['Space Name']?.trim();
    const listName = row['List Name']?.trim();
    if (!spaceName || !listName) {
      skippedRows.push({ taskName: title, reason: 'Missing Space Name or List Name' });
      continue;
    }

    try {
      const spaceId = await resolveSpace(spaceName);
      const folderSegments = parseFolderPath(row['Folder Name/Path']);
      const folderId = await resolveFolderChain(spaceId, folderSegments);
      const listId = await resolveList(spaceId, folderId, listName);

      const statusRaw = row['Status']?.trim();
      const status = statusRaw ? await resolveStatus(spaceId, statusRaw) : await resolveStatus(spaceId, 'Open');

      const assigneeNames = parseAssignees(row['Assignees']);
      const assigneeIds: string[] = [];
      for (const name of assigneeNames) {
        const userId = userByName.get(name);
        if (userId) assigneeIds.push(userId);
        else unmatchedAssignees.add(name);
      }

      const priorityRaw = row['Priority']?.trim().toLowerCase();
      const priority = priorityRaw ? PRIORITY_MAP[priorityRaw] : undefined;

      const task = await prisma.task.create({
        data: {
          title,
          description: row['Task Content'] || undefined,
          status,
          priority,
          dueDate: parseEpochMs(row['Due Date']),
          startDate: parseEpochMs(row['Start Date']),
          listId,
          assignees: assigneeIds.length ? { connect: assigneeIds.map((id) => ({ id })) } : undefined,
        },
        select: { id: true },
      });
      tasksCreated++;

      const clickUpId = row['Task ID']?.trim();
      if (clickUpId) clickUpIdToTaskId.set(clickUpId, task.id);

      const parentClickUpId = row['Parent ID']?.trim();
      if (parentClickUpId && parentClickUpId !== 'null') {
        pendingParents.push({ taskId: task.id, clickUpParentId: parentClickUpId });
      }
    } catch (e) {
      skippedRows.push({ taskName: title, reason: e instanceof Error ? e.message : 'Unknown error' });
    }
  }

  for (const { taskId, clickUpParentId } of pendingParents) {
    const parentId = clickUpIdToTaskId.get(clickUpParentId);
    if (!parentId) continue; // parent wasn't included in this export — leave as top-level, silently
    await prisma.task.update({ where: { id: taskId }, data: { parentId } }).catch(() => {});
  }

  return NextResponse.json({
    tasksCreated,
    spacesCreated,
    foldersCreated,
    listsCreated,
    statusesCreated,
    unmatchedAssignees: [...unmatchedAssignees],
    skippedRows,
  });
}
