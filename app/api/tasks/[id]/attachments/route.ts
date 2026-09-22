import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';

// Attachments on a task. The file itself is already on disk by the time this runs — the upload goes
// through POST /api/uploads/image (context=task), the same route and the same type allowlist chat
// uses. This only records that the file belongs to this task.
//
// Splitting it that way is deliberate: the upload route is the one place that decides what may be
// written into public/, and it should stay the only one.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) {
    return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // The url is only accepted in the shape this app's own upload route produces. Without this a
  // caller could point an "attachment" at any address at all, and everyone opening the task would
  // follow it — a link the app vouches for, to somewhere it has never seen.
  if (typeof body.url !== 'string' || !/^\/uploads\/[a-z]+\/[A-Za-z0-9._-]+$/.test(body.url)) {
    return NextResponse.json({ error: 'Invalid attachment url' }, { status: 400 });
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: id,
      url: body.url,
      kind: body.kind === 'image' ? 'image' : 'file',
      fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : null,
      byteSize: typeof body.byteSize === 'number' ? body.byteSize : null,
      uploadedById: userId,
    },
    include: { uploadedBy: { select: publicUserSelect } },
  });

  return NextResponse.json(attachment);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) {
    return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const attachmentId = searchParams.get('attachmentId');
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });

  // taskId is in the where clause, not just the id: without it, anyone with access to ANY task could
  // delete an attachment belonging to a task they cannot see, by id alone.
  await prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId: id } });

  // The file on disk is deliberately left alone. It may be referenced from a chat message or a doc,
  // and this route cannot know — the same reason chat attachments are never unlinked either.
  return NextResponse.json({ ok: true });
}
