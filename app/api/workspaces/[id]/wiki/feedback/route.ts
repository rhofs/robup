import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWikiAccess } from '@/lib/auth/wikiAccess';

// The wiki's "Report a bug" and "Request a feature" buttons. Any member can send one, and each
// becomes a task in the list an admin chose in the wiki settings — so feedback lands where the team
// already tracks work, instead of in a separate inbox nobody checks.
//
// Written server-side rather than through POST /api/tasks from the browser, because the person
// reporting a bug usually cannot see — and should not need access to — the list it goes into.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiAccess(workspaceId, userId);
  if (!access) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });

  const listId = access.ws.wikiFeedbackListId;
  if (!listId) return NextResponse.json({ error: 'No feedback list has been chosen yet — ask an admin to pick one in the wiki settings.' }, { status: 409 });
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { id: true, spaceId: true } });
  if (!list) return NextResponse.json({ error: 'The feedback list no longer exists — ask an admin to pick a new one.' }, { status: 409 });

  const body = await req.json();
  const kind = body.kind === 'feature' ? 'feature' : 'bug';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 5000) : '';
  if (!title) return NextResponse.json({ error: 'Give it a short title' }, { status: 400 });

  // The list's own first status, not a guessed 'To Do' — a Space can name its statuses anything.
  const [firstStatus, last, reporter] = await Promise.all([
    prisma.status.findFirst({ where: { spaceId: list.spaceId }, orderBy: { order: 'asc' }, select: { name: true } }),
    prisma.task.findFirst({ where: { listId, parentId: null, deletedAt: null }, orderBy: { order: 'desc' }, select: { order: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  const task = await prisma.task.create({
    data: {
      title: `${kind === 'bug' ? '[Bug]' : '[Feature]'} ${title}`,
      description: details || null,
      listId,
      status: firstStatus?.name ?? 'To Do',
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true },
  });
  await prisma.comment.create({
    data: {
      taskId: task.id,
      body: `${kind === 'bug' ? 'Bug reported' : 'Feature requested'} from the wiki by ${reporter?.name ?? 'someone'}`,
      type: 'activity',
      activityKind: 'created',
      authorId: userId,
    },
  });
  return NextResponse.json({ ok: true, taskId: task.id });
}
