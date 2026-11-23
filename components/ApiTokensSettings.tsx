'use client';

import { useEffect, useState } from 'react';
import { Bot, Check, Copy, Plus, Trash2 } from 'lucide-react';
import { copyToClipboard } from '../lib/copyToClipboard';
import { useTaskStore } from '../store/useTaskStore';

// Settings → "AI agents & API": the keys a person gives their own AI agent so it can work in Siqt
// as them (app/api/me/tokens, lib/auth/apiToken.ts). A key is shown once, when it is made — after
// that only its first characters, because the server never keeps the key itself.
type TokenRow = {
  id: string;
  name: string;
  scope: 'read' | 'write';
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  // null: every workspace its owner is in.
  workspaceIds: string[] | null;
};

export default function ApiTokensSettings() {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  // One key reaches all of your workspaces unless it is narrowed here — so nobody needs a key (or
  // an agent) per workspace; narrowing is for an agent you would rather keep to one place.
  const workspaces = useTaskStore((s) => s.workspaces);
  const [limited, setLimited] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The key just made — in memory only, gone when this panel closes.
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tokens) return;
    fetch('/api/me/tokens')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setTokens(Array.isArray(rows) ? rows : []))
      .catch(() => setTokens([]));
  }, [open, tokens]);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const mcpUrl = `${origin}/api/mcp`;

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/me/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scope: readOnly ? 'read' : 'write', ...(limited ? { workspaceIds: chosen } : {}) }),
    }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok || !data?.token) {
      setError(data?.error ?? 'Could not create the key — try again.');
      return;
    }
    const { token, ...row } = data as TokenRow & { token: string };
    setTokens((t) => [...(t ?? []), row]);
    setFresh({ name: row.name, token });
    setName('');
    setReadOnly(false);
    setLimited(false);
    setChosen([]);
  };

  const revoke = async (row: TokenRow) => {
    if (!window.confirm(`Revoke "${row.name}"? Whatever uses this key stops working at once.`)) return;
    const res = await fetch(`/api/me/tokens/${row.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setTokens((t) => (t ?? []).filter((x) => x.id !== row.id));
    else setError('Could not revoke the key — try again.');
  };

  const copy = async (what: string, text: string) => {
    if (await copyToClipboard(text)) {
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    }
  };

  const copyButton = (id: string, text: string) => (
    <button
      onClick={() => copy(id, text)}
      className="shrink-0 p-1.5 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 cursor-pointer"
      title="Copy"
    >
      {copied === id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left transition"
      >
        <Bot className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="text-xs text-neutral-300">
          AI agents &amp; API keys
          <span className="block text-neutral-500 mt-0.5">Let your own AI agent create and update tasks as you</span>
        </span>
      </button>
      {open && (
        <div className="mx-3 mb-2 p-3 rounded-lg border border-neutral-800 space-y-3">
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            A key lets an agent see what you can see, and create and change tasks and calendar events as you. Nothing
            is deleted for good, and everything an agent does can be undone under Workspace → Agent activity. Anyone
            holding the key can do the same, so treat it like a password.
          </p>

          {fresh && (
            <div className="p-2.5 rounded border border-amber-500/40 bg-amber-500/5 space-y-2">
              <p className="text-[11px] text-amber-300">
                Copy the key for “{fresh.name}” now — it is not shown again.
              </p>
              <div className="flex items-center gap-1">
                <code className="flex-1 min-w-0 text-[11px] text-neutral-200 break-all select-all">{fresh.token}</code>
                {copyButton('token', fresh.token)}
              </div>
              <p className="text-[11px] text-neutral-400">Claude Code — run this in a terminal:</p>
              <div className="flex items-start gap-1">
                <code className="flex-1 min-w-0 text-[10px] text-neutral-300 break-all select-all">
                  {`claude mcp add --transport http siqt ${mcpUrl} --header "Authorization: Bearer ${fresh.token}"`}
                </code>
                {copyButton('claude', `claude mcp add --transport http siqt ${mcpUrl} --header "Authorization: Bearer ${fresh.token}"`)}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 pb-1">Server address (MCP)</p>
            <div className="flex items-center gap-1">
              <code className="flex-1 min-w-0 text-[11px] text-neutral-300 break-all select-all">{mcpUrl}</code>
              {copyButton('url', mcpUrl)}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 pb-1">Your keys</p>
            {tokens === null ? (
              <p className="text-[11px] text-neutral-500">Loading…</p>
            ) : tokens.length === 0 ? (
              <p className="text-[11px] text-neutral-500">No keys yet.</p>
            ) : (
              <ul className="space-y-1">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-neutral-200 truncate">
                        {t.name}
                        {t.scope === 'read' && <span className="ml-1.5 text-[10px] text-neutral-500">read-only</span>}
                      </span>
                      <span className="block text-[10px] text-neutral-500">
                        {t.prefix}… ·{' '}
                        {t.workspaceIds
                          ? t.workspaceIds.map((id) => workspaces.find((w) => w.id === id)?.name ?? 'a workspace').join(', ')
                          : 'all workspaces'}{' '}
                        · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}
                      </span>
                    </span>
                    <button
                      onClick={() => revoke(t)}
                      className="shrink-0 p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 cursor-pointer"
                      title="Revoke"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Name, e.g. “Claude on my laptop”"
                maxLength={60}
                className="flex-1 min-w-0 text-xs bg-transparent border border-neutral-700 rounded px-2 py-1.5 text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500/70 outline-none"
              />
              <button
                onClick={create}
                disabled={!name.trim() || busy || (limited && chosen.length === 0)}
                className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-neutral-700 text-neutral-200 hover:border-neutral-600 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Create key
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer">
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
              Read-only — the agent can look but not change anything
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer">
              <input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} />
              Only some workspaces — otherwise the key works in all of yours
            </label>
            {limited && (
              <div className="pl-5 space-y-1">
                {workspaces.map((w) => (
                  <label key={w.id} className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chosen.includes(w.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, w.id] : c.filter((id) => id !== w.id)))}
                    />
                    {w.name}
                  </label>
                ))}
              </div>
            )}
            {error && <p className="text-[11px] text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
