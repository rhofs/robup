import { runV1, jsonBody } from '@/lib/agent/http';

// GET /api/v1/tasks/:id — the task in full, with subtasks and recent comments.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'get_task', { taskId: id });
}

// PATCH /api/v1/tasks/:id — { title?, description?, status?, startDate?, dueDate?, assigneeIds?, archived? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'update_task', { ...(await jsonBody(req)), taskId: id });
}
