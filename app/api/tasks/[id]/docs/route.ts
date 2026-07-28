import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docs = await prisma.doc.findMany({
    where: { taskId: id },
    orderBy: { order: 'asc' },
  });
  return NextResponse.json(docs);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const order = await prisma.doc.count({ where: { taskId: id } });
  const doc = await prisma.doc.create({
    data: {
      taskId: id,
      title: body.title || 'Untitled',
      content: '',
      order,
    },
  });
  return NextResponse.json(doc);
}