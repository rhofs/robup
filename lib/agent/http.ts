import { NextResponse } from 'next/server';
import { verifyApiToken } from '@/lib/auth/apiToken';
import { AgentError, baseUrlFor, callTool } from '@/lib/agent/operations';

// The plain-HTTP face of the agent operations (/api/v1/*): check the key, run one operation, answer
// in JSON. Every v1 route is this function with a different operation name, which is what keeps
// /api/v1 and /api/mcp from ever disagreeing about what a key can do — neither has rules of its own.
export async function runV1(req: Request, tool: string, args: Record<string, unknown>) {
  const check = await verifyApiToken(req);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error },
      { status: check.status, headers: check.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined }
    );
  }
  try {
    return NextResponse.json(await callTool(tool, args, { token: check.token, baseUrl: baseUrlFor(req) }));
  } catch (err) {
    if (err instanceof AgentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(`Agent API: ${tool} failed`, err);
    return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
  }
}

export const jsonBody = async (req: Request): Promise<Record<string, unknown>> => {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
};
