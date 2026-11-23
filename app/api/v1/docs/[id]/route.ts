import { runV1 } from '@/lib/agent/http';

// GET /api/v1/docs/:id — one Doc or wiki page in full, as text.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runV1(req, 'get_doc', { docId: id });
}
