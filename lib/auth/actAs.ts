import { AsyncLocalStorage } from 'node:async_hooks';

// "This code is running on behalf of that person" — for a request that did not arrive with their
// session cookie. An AI agent calls /api/mcp or /api/v1 with an API key (lib/auth/apiToken.ts);
// once the key has been checked, the work is done by the SAME route handlers the app itself calls,
// run inside runAsUser(). getCurrentUserId() (lib/auth/session.ts) answers with this identity when
// one is set, so every access check, activity entry and notification those handlers already do
// applies to the agent unchanged. That is the point: there is one set of rules about who may see
// and change what, and an agent gets exactly its owner's — not a second, parallel set written for
// agents that would drift from the first.
//
// It is only ever set by lib/agent/operations.ts. A request cannot set it from outside: it is not
// read from a header or a cookie, it lives in this process for the length of one call.
//
// Kept on globalThis for the same reason the Prisma client is (lib/prisma.ts): a bundler may load
// this module more than once, and two stores would mean a handler looking in one for what was put
// in the other — which fails as "Not authenticated", not as an error anyone would trace here.
export type HeldNotification = {
  userIds: string[];
  actorId: string | null;
  type: string;
  title: string;
  body?: string | null;
  taskId?: string | null;
  url?: string;
};

// `held`: notifications the handlers wanted to send during this call. They are kept instead of sent
// (lib/notifications.ts) so that one thing an agent does reaches each person as ONE notification,
// however many tasks it touched — lib/agent/changes.ts sends them when the action is finished.
export type ActingAs = { userId: string; tokenId: string | null; tokenName: string; held?: HeldNotification[] };

const g = globalThis as unknown as { __siqtActingAs?: AsyncLocalStorage<ActingAs> };
const storage = (g.__siqtActingAs ??= new AsyncLocalStorage<ActingAs>());

export const runAsUser = <T>(who: ActingAs, fn: () => Promise<T>): Promise<T> => storage.run(who, fn);

export const actingAs = (): ActingAs | undefined => storage.getStore();
