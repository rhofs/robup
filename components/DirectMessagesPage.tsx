'use client';

import { useEffect, useState } from 'react';
import { Link2, Check, X, Clock, Search, UserPlus } from 'lucide-react';
import { useChatStore, type ConnectionRequest, type ConnectionSearchResult } from '../store/useChatStore';
import { useIsMobile } from '../hooks/useIsMobile';
import ChatPanel from './ChatPanel';
import ChatThreadPanel from './ChatThreadPanel';

// Top-level, workspace-agnostic "Me zone" destination — Discord-style Direct Messages, living
// beside "My tasks"/"My assigned tasks" in app/page.tsx's Me zone, not inside any one workspace's
// Chat view. Content pane only — navigation between its two sub-views (Chats vs Connections) lives
// in DirectMessagesSidebar.tsx, which swaps into the main left `<aside>` the same way
// ChatChannelSidebar does for the workspace-scoped Chat view (moved there so this destination gets
// the same sidebar-driven navigation every other top-level view already has, instead of its own
// internal tab strip). See PLANNING.md's Connections session notes for the request/accept pivot
// (opening the connect link now sends a request, not an instant connection).
export default function DirectMessagesPage({ onOpenMobilePicker }: { onOpenMobilePicker?: () => void } = {}) {
  const isMobile = useIsMobile();
  const {
    connections,
    connectionInvite,
    connectionRequestsIncoming,
    connectionRequestsOutgoing,
    activeDmTab,
    activeThreadRootId,
    messagesByChannel,
    setActiveThreadRootId,
    fetchConnectionInvite,
    regenerateConnectionInvite,
    acceptConnectionRequest,
    declineConnectionRequest,
    searchUsersToConnect,
    sendConnectionRequestTo,
  } = useChatStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (activeDmTab === 'connections') fetchConnectionInvite();
  }, [activeDmTab, fetchConnectionInvite]);

  const activeThreadRootMessage = activeThreadRootId
    ? Object.values(messagesByChannel).flat().find((m) => m.id === activeThreadRootId) ?? null
    : null;

  const copyLink = async () => {
    if (!connectionInvite) return;
    await navigator.clipboard.writeText(`${window.location.origin}/connect/${connectionInvite.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (activeDmTab === 'connections') {
    return (
      <div className="h-[75vh] overflow-y-auto">
        <div className="max-w-xl mx-auto space-y-6 py-2">
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Find people</p>
            <PeopleSearch onSearch={searchUsersToConnect} onSendRequest={sendConnectionRequestTo} />
          </div>

          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Your connect link</p>
            <p className="text-[11px] text-neutral-500 mb-2">
              Anyone who opens this link while signed in sends you a connection request — you decide whether to accept it below.
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={copyLink}
                disabled={!connectionInvite}
                className="flex-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 rounded px-2 py-1.5 text-neutral-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Link2 className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                onClick={regenerateConnectionInvite}
                title="Get a new link (old one stops working)"
                className="text-[11px] text-neutral-500 hover:text-blue-400 px-3 rounded border border-neutral-800 hover:border-neutral-700 cursor-pointer"
              >
                Get new link
              </button>
            </div>
          </div>

          {connectionRequestsIncoming.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Requests ({connectionRequestsIncoming.length})</p>
              <div className="space-y-0.5">
                {connectionRequestsIncoming.map((r) => (
                  <RequestRow key={r.id} request={r} onAccept={() => acceptConnectionRequest(r.id)} onDecline={() => declineConnectionRequest(r.id)} />
                ))}
              </div>
            </div>
          )}

          {connectionRequestsOutgoing.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Sent, waiting on them</p>
              <div className="space-y-0.5">
                {connectionRequestsOutgoing.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-neutral-900/40">
                    <span
                      className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: r.user.color }}
                    >
                      {r.user.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-neutral-200 truncate">{r.user.name}</div>
                      <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> Pending
                      </div>
                    </div>
                    <button
                      onClick={() => declineConnectionRequest(r.id)}
                      title="Cancel request"
                      className="shrink-0 text-neutral-500 hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Connections ({connections.length})</p>
            {connections.length === 0 && (
              <p className="text-[11px] text-neutral-500">
                Share your link above, or you&apos;ll automatically connect with anyone you share a workspace with.
              </p>
            )}
            <div className="space-y-0.5">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-neutral-900/40">
                  <span
                    className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-neutral-200 truncate">{c.name}</div>
                    <div className="text-[10px] text-neutral-500">{c.source === 'connection' ? 'Connected directly' : 'Coworker'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[75vh] flex gap-3">
      <div className={`flex-1 min-w-0 ${isMobile && activeThreadRootMessage ? 'hidden' : ''}`}>
        <ChatPanel onOpenMobilePicker={onOpenMobilePicker} />
      </div>
      {activeThreadRootMessage && (
        <ChatThreadPanel rootMessage={activeThreadRootMessage} onClose={() => setActiveThreadRootId(null)} fullWidth={isMobile} />
      )}
    </div>
  );
}

// Free-text name search — the other way in besides sharing/opening a personal connect link.
// Debounced (300ms) so every keystroke doesn't fire a request; a query under 2 chars is treated
// as "not searching yet" both here and server-side (app/api/connections/search/route.ts).
function PeopleSearch({
  onSearch,
  onSendRequest,
}: {
  onSearch: (query: string) => Promise<ConnectionSearchResult[]>;
  onSendRequest: (userId: string) => Promise<{ status: string } | null>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConnectionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      onSearch(q)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, onSearch]);

  const handleSend = async (userId: string) => {
    setSentIds((prev) => new Set(prev).add(userId));
    await onSendRequest(userId);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
          className="w-full bg-neutral-950 border border-neutral-800 rounded pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
        />
      </div>
      {loading && <p className="text-[11px] text-neutral-500 px-0.5">Searching…</p>}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-[11px] text-neutral-500 px-0.5">No one found.</p>
      )}
      <div className="space-y-0.5">
        {results.map((u) => {
          const justSent = sentIds.has(u.id) && u.status === 'none';
          return (
            <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-neutral-900/40">
              <span
                className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: u.color }}
              >
                {u.initials}
              </span>
              <div className="min-w-0 flex-1 text-xs text-neutral-200 truncate">{u.name}</div>
              {u.status === 'connected' ? (
                <span className="text-[10px] text-neutral-500 shrink-0">Connected</span>
              ) : u.status === 'requested-by-them' ? (
                <span className="text-[10px] text-neutral-500 shrink-0">Sent you a request</span>
              ) : u.status === 'requested-by-me' || justSent ? (
                <span className="text-[10px] text-neutral-500 flex items-center gap-1 shrink-0">
                  <Clock className="w-2.5 h-2.5" /> Requested
                </span>
              ) : (
                <button
                  onClick={() => handleSend(u.id)}
                  title="Send connection request"
                  className="shrink-0 text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One incoming connection request — someone opened my connect link and is waiting on me to
// accept or decline. Explicit two-button confirm/deny, not a single toggle like reactions —
// this creates a real, persistent Connection row, not a low-stakes reversible action.
function RequestRow({ request, onAccept, onDecline }: { request: ConnectionRequest; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-neutral-900/40">
      <span
        className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: request.user.color }}
      >
        {request.user.initials}
      </span>
      <div className="min-w-0 flex-1 text-xs text-neutral-200 truncate">{request.user.name}</div>
      <button onClick={onAccept} title="Accept" className="shrink-0 p-1.5 rounded text-neutral-500 hover:text-green-400 hover:bg-neutral-800 cursor-pointer">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onDecline} title="Decline" className="shrink-0 p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 cursor-pointer">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
