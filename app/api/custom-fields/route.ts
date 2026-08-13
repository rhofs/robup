import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const field = await prisma.customField.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId: body.spaceId,
      listId: body.listId ?? null,
      name: body.name,
      type: body.type,
      options: JSON.stringify(body.options ?? []),
    },
  });
  return NextResponse.json({ ...field, options: JSON.parse(field.options) });
}