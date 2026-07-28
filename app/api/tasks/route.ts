import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const tasks = await prisma.task.findMany({
    include: { assignees: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      title: body.title,
      listId: body.listId,
      parentId: body.parentId ?? null,
      status: body.status ?? 'To Do',
    },
    include: { assignees: true },
  });
  return NextResponse.json(task);
}