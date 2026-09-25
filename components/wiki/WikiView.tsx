'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Check,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings,
  Bug,
  Lightbulb,
  MessageCircle,
  List as ListIcon,
} from 'lucide-react';
import type { HierarchyWorkspace } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useWikiStore, wikiChapters, wikiReadingOrder, type WikiPage } from '../../store/useWikiStore';
import type { MentionKind } from '../../lib/mentions';
import WikiSettingsDialog from './WikiSettingsDialog';
import WikiFeedbackDialog from './WikiFeedbackDialog';

const CollabDocEditor = dynamic(() => import('../collab/CollabDocEditor'), { ssr: false });

// The workspace's Wiki, drawn as a book: a cover, chapters with numbered pages, and one page at a
// time in a narrow reading column with previous/next at the bottom. Asked for as "nesten litt som en
// bok, men man må også kunne søke i den" — so reading is the default and editing is something a wiki
// editor switches on, and a search box sits above the contents at all times.
//
// Pages are ordinary Docs (see the Workspace.wikiPages comment in the schema), shown through the same
// collab editor as everywhere else — read-only unless editing. The server enforces who may edit; the
// buttons here only follow what it reports (`canEdit`).

type Props = {
  workspace: HierarchyWorkspace;
  pageId: string | null;
  onOpenPage: (pageId: string | null) => void;
  onJump: (kind: MentionKind, id: string) => void;
  onContactUser: (userId: string) => void;
  isMobile: boolean;
};

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// A few words either side of the first match, for the search results.
function snippet(text: string, q: string): { before: string; match: string; after: string } | null {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 50);
  const end = Math.min(text.length, i + q.length + 70);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, i).replace(/\s+/g, ' '),
    match: text.slice(i, i + q.length),
    after: text.slice(i + q.length, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : ''),
  };
}

export default function WikiView({ workspace, pageId, onOpenPage, onJump, onContactUser, isMobile }: Props) {
  const wiki = useWikiStore((s) => s.byWorkspace[workspace.id]);
  const loading = useWikiStore((s) => s.loading[workspace.id]);
  const { fetchWiki, createPage, updatePage, deletePage } = useWikiStore.getState();
  const currentUserId = useSessionStore((s) => s.currentUserId);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<'bug' | 'feature' | null>(null);
  // The term the reader came in on from a search, highlighted on the page they land on.
  const [highlight, setHighlight] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWiki(workspace.id);
  }, [workspace.id, fetchWiki]);

  // Every page opens in reading mode — except one just created, which opens ready to write in.
  // Reset while rendering, on the page id changing, rather than in an effect: an effect runs after
  // the render and so switched a new page's editing straight back off again.
  const [editOnOpen, setEditOnOpen] = useState<string | null>(null);
  const [shownPageId, setShownPageId] = useState(pageId);
  if (shownPageId !== pageId) {
    setShownPageId(pageId);
    setEditing(editOnOpen !== null && editOnOpen === pageId);
    setEditOnOpen(null);
    setTocOpen(false);
  }
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pageId]);

  const pages = useMemo(() => wiki?.pages ?? [], [wiki]);
  const chapters = useMemo(() => wikiChapters(pages), [pages]);
  const readingOrder = useMemo(() => wikiReadingOrder(pages), [pages]);
  const page = pageId ? pages.find((p) => p.id === pageId) ?? null : null;
  const canEdit = !!wiki?.canEdit;

  // "2" for a chapter, "2.3" for a page — the numbering a reader uses to say where something is.
  const numberOf = (p: WikiPage): string => {
    const ci = chapters.findIndex((c) => c.chapter.id === (p.parentId ?? p.id));
    if (ci < 0) return '';
    if (!p.parentId) return `${ci + 1}`;
    return `${ci + 1}.${chapters[ci].pages.findIndex((x) => x.id === p.id) + 1}`;
  };
  const chapterOf = (p: WikiPage) => (p.parentId ? pages.find((x) => x.id === p.parentId) ?? null : p);

  const idx = page ? readingOrder.findIndex((p) => p.id === page.id) : -1;
  const prev = idx > 0 ? readingOrder[idx - 1] : null;
  const next = idx >= 0 && idx < readingOrder.length - 1 ? readingOrder[idx + 1] : idx < 0 ? readingOrder[0] ?? null : null;

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const ql = q.toLowerCase();
    return readingOrder
      .map((p) => ({ page: p, titleHit: p.title.toLowerCase().includes(ql), snip: snippet(p.text, q) }))
      .filter((r) => r.titleHit || r.snip)
      .sort((a, b) => Number(b.titleHit) - Number(a.titleHit));
  }, [query, readingOrder]);

  const open = (id: string | null, term?: string) => {
    setHighlight(term ?? null);
    onOpenPage(id);
  };

  // Marks every occurrence of the search term on the page just opened, and scrolls to the first.
  // Uses the CSS Custom Highlight API, which paints over the text without touching the editor's DOM
  // — anything inserted into a live collaborative document would become part of the document. The
  // page's text arrives over the websocket a moment after mount, so this retries briefly.
  useEffect(() => {
    const cssHighlights = (typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }).highlights : undefined);
    if (!cssHighlights) return;
    cssHighlights.delete('wiki-search');
    if (!highlight || !page) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      const root = mainRef.current?.querySelector('.ProseMirror');
      if (!root) return;
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const needle = highlight.toLowerCase();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.textContent ?? '').toLowerCase();
        for (let i = t.indexOf(needle); i >= 0; i = t.indexOf(needle, i + needle.length)) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + needle.length);
          ranges.push(r);
        }
      }
      if (ranges.length || tries > 20) {
        window.clearInterval(timer);
        if (ranges.length) {
          const HighlightCtor = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
          cssHighlights.set('wiki-search', new HighlightCtor(...ranges));
          const rect = ranges[0].getBoundingClientRect();
          const main = mainRef.current;
          if (main) main.scrollTo({ top: main.scrollTop + rect.top - main.getBoundingClientRect().top - 120, behavior: 'smooth' });
        }
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      cssHighlights.delete('wiki-search');
    };
  }, [highlight, page]);

  // A swipe turns the page on a phone — only while reading, where a horizontal drag has no other use.
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || editing) return;
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || !isMobile || editing) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && next) open(next.id);
    if (dx > 0) open(prev ? prev.id : null);
  };

  const owner = workspace.members.find((m) => m.workspaceRole === 'owner');
  const admins = workspace.members.filter((m) => m.workspaceRole === 'admin');
  const contact = owner && owner.id !== currentUserId ? owner : admins.find((a) => a.id !== currentUserId) ?? null;

  const addChapter = async () => {
    const created = await createPage(workspace.id, 'New chapter', null);
    if (created) {
      setEditOnOpen(created.id);
      open(created.id);
    }
  };
  const addPage = async (chapterId: string) => {
    const created = await createPage(workspace.id, 'New page', chapterId);
    if (created) {
      setEditOnOpen(created.id);
      open(created.id);
    }
  };
  const move = (p: WikiPage, dir: -1 | 1) => {
    const siblings = pages.filter((x) => x.parentId === p.parentId).sort((a, b) => a.order - b.order);
    const i = siblings.findIndex((x) => x.id === p.id);
    const other = siblings[i + dir];
    if (!other) return;
    // Swap with the neighbour. Orders can be tied (0,0) after a delete — normalise first so a swap
    // always changes something.
    siblings.forEach((s, k) => s.order !== k && updatePage(workspace.id, s.id, { order: k }));
    updatePage(workspace.id, p.id, { order: i + dir });
    updatePage(workspace.id, other.id, { order: i });
  };
  const remove = (p: WikiPage) => {
    const childCount = pages.filter((x) => x.parentId === p.id).length;
    const what = p.parentId ? 'this page' : childCount ? `this chapter and its ${childCount} page${childCount === 1 ? '' : 's'}` : 'this chapter';
    if (!window.confirm(`Delete ${what}?`)) return;
    const back = p.parentId ?? null;
    deletePage(workspace.id, p.id);
    open(back);
  };

  const toc = (
    <nav className="flex flex-col min-h-0 h-full">
      <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
        <button onClick={() => open(null)} className="flex items-center gap-2 text-left cursor-pointer group">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: workspace.color ?? '#6366f1' }}
          >
            <BookOpen className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-app-strong truncate group-hover:text-blue-400">{workspace.name}</span>
            <span className="block text-[10px] uppercase tracking-wider text-neutral-500">Wiki</span>
          </span>
        </button>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the wiki…"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-7 py-2 md:py-1.5 text-[13px] md:text-xs text-app-strong placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/70"
          />
          {query && (
            <button onClick={() => setQuery('')} title="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-app-strong cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {results ? (
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </p>
            {results.map(({ page: p, snip }) => (
              <button
                key={p.id}
                onClick={() => open(p.id, query.trim())}
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-neutral-800/60 cursor-pointer"
              >
                <span className="block text-[12px] font-medium text-app-strong truncate">
                  <span className="text-neutral-500 tabular-nums mr-1.5">{numberOf(p)}</span>
                  {p.title}
                </span>
                {snip && (
                  <span className="block text-[11px] text-neutral-400 leading-snug mt-0.5 line-clamp-2">
                    {snip.before}
                    <mark className="bg-amber-400/25 text-app-strong rounded-sm px-0.5">{snip.match}</mark>
                    {snip.after}
                  </span>
                )}
              </button>
            ))}
            {results.length === 0 && <p className="px-2 py-2 text-[12px] text-neutral-500">Nothing matches “{query.trim()}”.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {chapters.map(({ chapter, pages: ps }, ci) => (
              <div key={chapter.id}>
                <button
                  onClick={() => open(chapter.id)}
                  className={`w-full flex items-baseline gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer transition ${
                    page?.id === chapter.id ? 'bg-neutral-800 text-blue-400' : 'text-app-strong hover:bg-neutral-800/60'
                  }`}
                >
                  <span className="text-[11px] font-semibold text-neutral-500 tabular-nums w-4 shrink-0">{ci + 1}</span>
                  <span className="text-[13px] font-semibold truncate">{chapter.title}</span>
                </button>
                <div className="ml-4 border-l border-neutral-800 pl-1.5 mt-0.5 space-y-px">
                  {ps.map((p, pi) => (
                    <button
                      key={p.id}
                      onClick={() => open(p.id)}
                      className={`w-full flex items-baseline gap-2 px-2 py-1 rounded-md text-left cursor-pointer transition ${
                        page?.id === p.id ? 'bg-neutral-800 text-blue-400' : 'text-neutral-400 hover:text-app-strong hover:bg-neutral-800/50'
                      }`}
                    >
                      <span className="text-[10px] text-neutral-600 tabular-nums w-6 shrink-0">
                        {ci + 1}.{pi + 1}
                      </span>
                      <span className="text-[12.5px] truncate">{p.title}</span>
                    </button>
                  ))}
                  {canEdit && (
                    <button
                      onClick={() => addPage(chapter.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] text-neutral-500 hover:text-blue-400 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add page
                    </button>
                  )}
                </div>
              </div>
            ))}
            {canEdit && (
              <button onClick={addChapter} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] text-neutral-500 hover:text-blue-400 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Add chapter
              </button>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-neutral-800 px-2 py-2 space-y-px">
        <p className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">Quick links</p>
        <QuickLink icon={Bug} label="Report a bug" onClick={() => setFeedbackKind('bug')} />
        <QuickLink icon={Lightbulb} label="Request a feature" onClick={() => setFeedbackKind('feature')} />
        {contact && <QuickLink icon={MessageCircle} label={`Contact ${contact.name.split(' ')[0]}`} onClick={() => onContactUser(contact.id)} />}
        {wiki?.isManager && <QuickLink icon={Settings} label="Wiki settings" onClick={() => setSettingsOpen(true)} />}
      </div>
    </nav>
  );

  return (
    <div className="flex flex-1 min-h-0">
      {!isMobile && <aside className="w-72 shrink-0 border-r border-neutral-800 bg-neutral-950/40">{toc}</aside>}

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {isMobile && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
            <button onClick={() => setTocOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800/70 text-[13px] text-app-strong cursor-pointer">
              <ListIcon className="w-4 h-4" /> Contents
            </button>
            <span className="flex-1 min-w-0 text-[12px] text-neutral-500 truncate text-right">
              {page ? `${numberOf(page)} · ${page.title}` : `${workspace.name} Wiki`}
            </span>
          </div>
        )}

        <div ref={mainRef} className="flex-1 min-h-0 overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {!wiki ? (
            <p className="p-8 text-sm text-neutral-500">{loading === false ? 'Could not load the wiki.' : 'Opening the wiki…'}</p>
          ) : !page ? (
            <Cover
              workspace={workspace}
              chapters={chapters}
              onOpen={(id) => open(id)}
              isMobile={isMobile}
              query={query}
              setQuery={setQuery}
              onSearchFocus={() => isMobile && setTocOpen(true)}
            />
          ) : (
            <article className="max-w-[720px] mx-auto px-5 md:px-10 pt-8 md:pt-14 pb-16">
              <div className="flex items-center gap-2 mb-3">
                <p className="flex-1 min-w-0 text-[11px] uppercase tracking-[0.14em] text-neutral-500 truncate">
                  {page.parentId ? `Chapter ${numberOf(chapterOf(page)!)} · ${chapterOf(page)?.title}` : `Chapter ${numberOf(page)}`}
                </p>
                {canEdit &&
                  (editing ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton title="Move up" onClick={() => move(page, -1)}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton title="Move down" onClick={() => move(page, 1)}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton title="Delete" onClick={() => remove(page)} danger>
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconButton>
                      <button
                        onClick={() => setEditing(false)}
                        className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Done
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-300 hover:text-app-strong hover:border-neutral-500 text-[12px] cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  ))}
              </div>

              {editing ? (
                <TitleInput key={page.id} value={page.title} onCommit={(title) => title !== page.title && updatePage(workspace.id, page.id, { title })} />
              ) : (
                <h1 className="wiki-title text-[30px] md:text-[38px] leading-[1.15] font-semibold text-app-strong">{page.title}</h1>
              )}
              <p className="mt-2 text-[12px] text-neutral-500">Updated {timeAgo(page.updatedAt)}</p>

              <div className="wiki-page mt-6">
                <CollabDocEditor
                  key={page.id}
                  docId={page.id}
                  onJump={onJump}
                  readOnly={!editing}
                  placeholder={editing ? 'Write this page… (type / for headings, lists and images)' : 'Nothing here yet.'}
                  className="text-[15px] text-neutral-300"
                />
              </div>

              {!page.parentId && (
                <ChapterContents
                  pages={chapters.find((c) => c.chapter.id === page.id)?.pages ?? []}
                  number={numberOf(page)}
                  onOpen={(id) => open(id)}
                />
              )}

              <div className="mt-14 pt-6 border-t border-neutral-800 grid grid-cols-2 gap-3">
                <button
                  onClick={() => open(prev ? prev.id : null)}
                  className="text-left px-3 py-3 rounded-xl border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/60 cursor-pointer transition"
                >
                  <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </span>
                  <span className="block text-[13px] text-app-strong truncate mt-0.5">{prev ? prev.title : 'Cover'}</span>
                </button>
                {next ? (
                  <button
                    onClick={() => open(next.id)}
                    className="text-right px-3 py-3 rounded-xl border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/60 cursor-pointer transition"
                  >
                    <span className="flex items-center justify-end gap-1 text-[11px] text-neutral-500">
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                    <span className="block text-[13px] text-app-strong truncate mt-0.5">{next.title}</span>
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </article>
          )}
        </div>
      </div>

      {isMobile && tocOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-scrim/60" onClick={() => setTocOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border-t border-neutral-800 rounded-t-2xl h-[85vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex justify-center pt-2 shrink-0">
              <span className="w-10 h-1 rounded-full bg-neutral-700" />
            </div>
            {toc}
          </div>
        </div>
      )}

      {settingsOpen && <WikiSettingsDialog workspace={workspace} onClose={() => setSettingsOpen(false)} />}
      {feedbackKind && (
        <WikiFeedbackDialog
          workspace={workspace}
          kind={feedbackKind}
          onClose={() => setFeedbackKind(null)}
          onOpenSettings={wiki?.isManager ? () => { setFeedbackKind(null); setSettingsOpen(true); } : undefined}
        />
      )}
    </div>
  );
}

function QuickLink({ icon: Icon, label, onClick }: { icon: typeof Bug; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12.5px] text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 cursor-pointer">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function IconButton({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition ${
        danger ? 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10' : 'text-neutral-500 hover:text-app-strong hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}

// The title while editing: saved on blur or Enter, not per keystroke — a rename is one change.
function TitleInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim() || 'Untitled')}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="wiki-title w-full bg-transparent text-[30px] md:text-[38px] leading-[1.15] font-semibold text-app-strong border-b border-dashed border-neutral-700 focus:border-blue-500 focus:outline-none pb-1"
    />
  );
}

function ChapterContents({ pages, number, onOpen }: { pages: WikiPage[]; number: string; onOpen: (id: string) => void }) {
  if (pages.length === 0) return null;
  return (
    <div className="mt-10">
      <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-2">In this chapter</p>
      <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800 overflow-hidden">
        {pages.map((p, i) => (
          <button key={p.id} onClick={() => onOpen(p.id)} className="w-full flex items-baseline gap-3 px-4 py-3 text-left hover:bg-neutral-900/60 cursor-pointer">
            <span className="text-[12px] text-neutral-500 tabular-nums w-8 shrink-0">
              {number}.{i + 1}
            </span>
            <span className="text-[14px] text-app-strong">{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Cover({
  workspace,
  chapters,
  onOpen,
  isMobile,
  query,
  setQuery,
  onSearchFocus,
}: {
  workspace: HierarchyWorkspace;
  chapters: ReturnType<typeof wikiChapters>;
  onOpen: (id: string) => void;
  isMobile: boolean;
  query: string;
  setQuery: (q: string) => void;
  onSearchFocus: () => void;
}) {
  return (
    <div className="max-w-[880px] mx-auto px-5 md:px-10 pt-8 md:pt-16 pb-16">
      <div className="flex items-center gap-4">
        {workspace.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={workspace.avatarUrl} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-2xl object-cover shrink-0" />
        ) : (
          <span
            className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: workspace.color ?? '#6366f1' }}
          >
            <BookOpen className="w-7 h-7" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">The {workspace.name} Wiki</p>
          <h1 className="wiki-title text-[28px] md:text-[40px] leading-tight font-semibold text-app-strong">Everything you need to know</h1>
        </div>
      </div>

      {isMobile && (
        <div className="relative mt-6">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={onSearchFocus}
            placeholder="Search the wiki…"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-[15px] text-app-strong placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/70"
          />
        </div>
      )}

      <div className="mt-8 md:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {chapters.map(({ chapter, pages }, ci) => (
          <button
            key={chapter.id}
            onClick={() => onOpen(chapter.id)}
            className="group text-left rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-600 p-5 cursor-pointer transition"
          >
            <span className="block text-[11px] uppercase tracking-[0.16em] text-neutral-500">Chapter {ci + 1}</span>
            <span className="wiki-title block text-[20px] font-semibold text-app-strong mt-1 group-hover:text-blue-400 transition">{chapter.title}</span>
            <span className="block mt-3 space-y-1">
              {pages.slice(0, 4).map((p, pi) => (
                <span key={p.id} className="flex items-baseline gap-2 text-[12.5px] text-neutral-400">
                  <span className="text-neutral-600 tabular-nums w-7 shrink-0">
                    {ci + 1}.{pi + 1}
                  </span>
                  <span className="truncate">{p.title}</span>
                </span>
              ))}
              {pages.length > 4 && <span className="block text-[12px] text-neutral-500 pl-9">+{pages.length - 4} more</span>}
            </span>
          </button>
        ))}
      </div>
      {chapters.length === 0 && <p className="mt-10 text-sm text-neutral-500">This wiki is empty.</p>}
    </div>
  );
}
