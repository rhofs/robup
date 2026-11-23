import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { actingAs } from '@/lib/auth/actAs';
import { undoAction } from '@/lib/agent/changes';
import { AgentError } from '@/lib/agent/shared';

// Undo one thing an agent did, as a whole — pressed by a person in the workspace's agent log.
// Who may, and what "undo" does and does not put back, is decided in lib/agent/changes.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = actingAs() ? null : await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await undoAction(id, userId));
  } catch (err) {
    if (err instanceof AgentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Undo of agent action failed', err);
    return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
  }
}
