import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureDocAccess } from '@/lib/auth/resourceAccess';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  const comments = await prisma.docComment.findMany({
    where: { docId: id },
    include: { author: { select: publicUserSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  try {
    const body = await req.json();
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }
    if (!body.markId) {
      return NextResponse.json({ error: 'markId is required' }, { status: 400 });
    }
    const comment = await prisma.docComment.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        docId: id,
        body: body.body,
        markId: body.markId,
        parentId: body.parentId || null,
        quotedText: body.quotedText || null,
        // The real signed-in caller, not the client-supplied body.authorId this used to trust
        // directly — same spoofable-identity fix applied throughout this session.
        authorId: userId,
      },
      include: { author: { select: publicUserSelect } },
    });
    return NextResponse.json(comment);
  } catch (error) {
    console.error('Feil ved oppretting av dokumentkommentar:', error);
    return NextResponse.json({ error: 'Kunne ikke opprette kommentar' }, { status: 500 });
  }
}
