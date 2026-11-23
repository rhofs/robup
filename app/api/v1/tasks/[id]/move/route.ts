import { runV1, jsonBody } from '@/lib/agent/http';

// POST /api/v1/tasks/:id/move — { beforeTaskId? | afterTaskId? | parentId? | listId?, requestId? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'move_task', { ...(await jsonBody(req)), taskId: id });
}
