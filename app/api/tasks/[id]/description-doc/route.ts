import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { collabSchema } from '@/lib/collab/schema';
import { contentFromJSON } from '@/lib/collab/docContent';
import { legacyContentToDocJSON } from '@/lib/collab/legacyContentToDocJSON';
import { isRichHtml, richToPlainText } from '@/lib/richText';

// The Doc that is this task's description (Doc.descriptionTaskId) — found, or made the first time
// anyone opens the task, so the description is written with everything a Doc has: comments, images,
// files, task lists, live editing (components/TaskDescriptionDoc.tsx).
//
// It starts from the description the task already has. Turning that HTML into a document needs a
// DOM, which the browser has and this server does not, so the browser sends it along as ProseMirror
// JSON (`seed`), built against the same schema. It is checked against that schema here; if it does
// not fit, the plain text is used instead, so the words are never lost.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await ensureTaskAccess(id, userId);
  if (!access) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  const existing = await prisma.doc.findUnique({ where: { descriptionTaskId: id }, select: { id: true } });
  if (existing) return NextResponse.json(existing);

  const body = await req.json().catch(() => ({}));
  const { ydoc, content } = contentFromJSON(startingContent(body?.seed, access.task.description));
  try {
    const doc = await prisma.doc.create({
      data: { descriptionTaskId: id, title: 'Description', ownerId: userId, ydoc, content },
      select: { id: true },
    });
    return NextResponse.json(doc);
  } catch (err) {
    // Two people opening the task in the same moment: the second create meets the unique index and
    // gets the first one's doc.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const doc = await prisma.doc.findUnique({ where: { descriptionTaskId: id }, select: { id: true } });
      if (doc) return NextResponse.json(doc);
    }
    throw err;
  }
}

function startingContent(seed: unknown, description: string | null): Record<string, unknown> {
  if (seed && typeof seed === 'object') {
    try {
      collabSchema.nodeFromJSON(seed).check();
      return seed as Record<string, unknown>;
    } catch {
      // Falls through to the plain text.
    }
  }
  const text = description ? (isRichHtml(description) ? richToPlainText(description) : description) : '';
  return legacyContentToDocJSON(text);
}
