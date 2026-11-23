import { runV1, jsonBody } from '@/lib/agent/http';

// PATCH /api/v1/events/:id — { title?, start?, end?, location?, description?, attendeeIds?, requestId? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'update_event', { ...(await jsonBody(req)), eventId: id });
}

// DELETE /api/v1/events/:id — to the Trash; it can be restored.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'trash_event', { eventId: id });
}
