import { runV1, jsonBody } from '@/lib/agent/http';

// POST /api/v1/tasks/:id/comments — { body }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'add_comment', { ...(await jsonBody(req)), taskId: id });
}
