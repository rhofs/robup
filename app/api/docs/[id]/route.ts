import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.content !== undefined) data.content = body.content;
  if (body.order !== undefined) data.order = body.order;

  const doc = await prisma.doc.update({
    where: { id },
    data,
  });
  return NextResponse.json(doc);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.doc.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
