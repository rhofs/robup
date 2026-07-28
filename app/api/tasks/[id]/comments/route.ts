import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    include: { author: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }
    const comment = await prisma.comment.create({
      data: {
        taskId: id,
        body: body.body,
        type: 'comment',
        authorId: body.authorId || null,
      },
      include: { author: true },
    });
    return NextResponse.json(comment);
  } catch (error) {
    console.error('Feil ved oppretting av kommentar:', error);
    return NextResponse.json({ error: 'Kunne ikke opprette kommentar' }, { status: 500 });
  }
}