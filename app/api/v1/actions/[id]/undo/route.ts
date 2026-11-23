import { runV1 } from '@/lib/agent/http';

// POST /api/v1/actions/:id/undo — undo one earlier action as a whole.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'undo_action', { actionId: id });
}
