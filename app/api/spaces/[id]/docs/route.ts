import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const order = await prisma.doc.count({ where: { spaceId: id, folderId: body.folderId ?? null } });
  const doc = await prisma.doc.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: id,
      folderId: body.folderId ?? null,
      title: body.title || 'Untitled',
      content: body.content || '',
      order: body.order ?? order,
    },
  });
  return NextResponse.json(doc);
}
