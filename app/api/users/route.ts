import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';

export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, select: publicUserSelect });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const body = await req.json();
  const user = await prisma.user.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      name: body.name,
      initials: body.initials,
      color: body.color ?? '#6366F1',
    },
    select: publicUserSelect,
  });
  return NextResponse.json(user);
}