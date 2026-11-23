import { NextResponse } from 'next/server';
import { verifyApiToken, type VerifiedToken } from '@/lib/auth/apiToken';
import { AgentError, baseUrlFor, callTool, toolsFor } from '@/lib/agent/operations';

// Siqt as an MCP server — the protocol AI agents (Claude, Cursor and others) use to reach tools.
// An agent is pointed at https://<host>/api/mcp with an API key from Settings and can then do what
// lib/agent/operations.ts lists, as the person who made the key.
//
// Written against the protocol directly rather than with the MCP SDK. What this server needs from
// it is small: it is stateless (no sessions, no server-initiated messages, no streaming), so every
// exchange is one JSON-RPC request in and one JSON answer out, which the "Streamable HTTP"
// transport allows. The SDK's HTTP transport is built around Node's req/res and long-lived
// sessions; fitting that into a route handler would have been more code than this file, and a
// dependency to keep in step with Next.
//
// What "stateless" costs: no progress updates and no push — an agent only learns what changed by
// asking. Fine for creating and editing tasks; it would not be for anything long-running.

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

type RpcId = string | number | null;
type RpcMessage = { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> };

const result = (id: RpcId, value: unknown) => ({ jsonrpc: '2.0', id, result: value });
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg: RpcMessage, token: VerifiedToken, req: Request) {
  const id = msg.id ?? null;
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '';
      return result(id, {
        // The client's version when this server knows it, else the newest one it does — the client
        // then decides whether it can live with that.
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'siqt', title: 'Siqt', version: '0.1.0' },
        instructions:
          'Siqt is a task manager. Call list_workspaces first: it gives the List ids, the status names each List uses, and the member ids, which the other tools need. Dates are days (YYYY-MM-DD). You act as the person who made this API key and see exactly what they see. You cannot delete anything.',
      });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: toolsFor(token).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const name = typeof msg.params?.name === 'string' ? msg.params.name : '';
      try {
        const value = await callTool(name, msg.params?.arguments, { token, baseUrl: baseUrlFor(req) });
        return result(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
      } catch (err) {
        // A refusal the agent can read and act on ("there is no status X, the statuses are …") is a
        // tool result with isError, not a protocol error: protocol errors are for the client
        // program, and the model never sees them.
        if (err instanceof AgentError) return result(id, { content: [{ type: 'text', text: err.message }], isError: true });
        console.error(`MCP: ${name} failed`, err);
        return result(id, { content: [{ type: 'text', text: 'Something went wrong on the Siqt server.' }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method ?? ''}`);
  }
}

export async function POST(req: Request) {
  const check = await verifyApiToken(req);
  if (!check.ok) {
    return NextResponse.json(rpcError(null, -32001, check.error), {
      status: check.status,
      headers: check.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined,
    });
  }
  const body = (await req.json().catch(() => undefined)) as RpcMessage | RpcMessage[] | undefined;
  if (body === undefined || body === null || typeof body !== 'object') {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  const messages = Array.isArray(body) ? body : [body];
  // Notifications and responses (no method, or no id) expect nothing back.
  const requests = messages.filter((m) => m && typeof m.method === 'string' && m.id !== undefined && m.id !== null);
  if (requests.length === 0) return new Response(null, { status: 202 });
  const answers = [];
  for (const m of requests) answers.push(await handle(m, check.token, req));
  return NextResponse.json(Array.isArray(body) ? answers : answers[0]);
}

// No server-to-client stream and no sessions to end — said the way the transport spec asks.
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
