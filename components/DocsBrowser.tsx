'use client';

import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { HierarchySpace, TaskDoc } from '../store/useTaskStore';
import { getAllWorkspaceDocs } from '../lib/docFolderTree';

// Docs tab content — a flat, workspace-wide list of every Doc across every Space, not a per-Space
// folder browse. Used to require picking a Space first (this component took a single `space` prop
// and rendered its DocFolder tree, mirroring SpaceHome.tsx's card-grid); per direct feedback
// ("every single space has its own docs folder... I want that removed... the docs tab should list
// all docs in the workspace"), a Doc still genuinely belongs to whichever Space it's filed under —
// that association is untouched — this just aggregates across all of them instead of requiring one
// to be picked first. See lib/docFolderTree.ts's getAllWorkspaceDocs for the actual flattening
// logic (same "loop every space's spaceDocs" shape CommandPalette.tsx's own doc search already
// used). Folder-tree navigation is gone entirely from this view — with everything flattened, a
// folder hierarchy has nothing left to organize; finding a specific doc is now what the (now
// docs-scoped, see CommandPalette.tsx's scopeKind) top search bar is for.
type DocsBrowserProps = {
  // The two halves, kept apart rather than merged into one list. A private doc and a team doc are
  // the same object in the database — a Doc under a Space — and the only thing separating them is
  // which workspace that Space belongs to. That was true before this toggle existed too; the tab
  // simply showed one of them and never said which, which is the part that was confusing.
  spaces: HierarchySpace[];
  personalSpaces: HierarchySpace[];
  workspaceName: string;
  onOpenDoc: (spaceId: string, folderId: string | null, docId: string) => void;
  onDeleteDocRequest: (doc: TaskDoc) => void;
  // This tab had no create action at all — flattening it lost the per-Space "+ New > Doc" entry
  // point without replacing it, so the Docs tab could only ever *show* documents. Reported
  // directly: "Kan ikke lage ny doc på desktop." A Doc still genuinely belongs to a Space, so
  // creating one from this workspace-wide view has to say which — hence the picker below rather
  // than a bare button.
  onCreateDoc: (spaceId: string) => void;
};

export default function DocsBrowser({
  spaces,
  personalSpaces,
  workspaceName,
  onOpenDoc,
  onDeleteDocRequest,
  onCreateDoc,
}: DocsBrowserProps) {
  // Defaults to the workspace. The Docs tab only exists once there is a real workspace, so the team's
  // documents are what someone opening it is almost always after; your own are one tap away.
  const [scope, setScope] = useState<'workspace' | 'mine'>('workspace');
  const activeSpaces = scope === 'mine' ? personalSpaces : spaces;
  const entries = useMemo(() => getAllWorkspaceDocs(activeSpaces), [activeSpaces]);
  // Defaults to the first Space so the common single-Space case stays one click.
  const [targetSpaceId, setTargetSpaceId] = useState('');
  const resolvedSpaceId = targetSpaceId || activeSpaces[0]?.id || '';

  // The same two-option pill Home/Office and Settings use. Third time it appears, and deliberately
  // identical each time: it is this app's one way of saying "the same shape, seen two ways".
  const scopeToggle = (
    <div className="flex gap-0.5 rounded-full bg-neutral-800/60 p-0.5 mb-3 max-w-xs">
      {([
        ['workspace', workspaceName || 'Workspace'],
        ['mine', 'Mine'],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          onClick={() => {
            setScope(id);
            // The Space picker below is scoped to whichever half is showing, so a space chosen in
            // one is meaningless in the other — clearing it falls back to that half's first Space.
            setTargetSpaceId('');
          }}
          className={`flex-1 min-w-0 truncate rounded-full py-1.5 px-3 text-[13px] font-semibold transition cursor-pointer ${
            scope === id ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const createBar = activeSpaces.length > 0 && (
    <div className="flex items-center gap-2 mb-3">
      <button
        onClick={() => resolvedSpaceId && onCreateDoc(resolvedSpaceId)}
        disabled={!resolvedSpaceId}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] px-3 py-1.5 rounded font-medium cursor-pointer"
      >
        <Plus className="w-3 h-3" /> New doc
      </button>
      {/* Only worth asking which Space when there's actually a choice to make. */}
      {activeSpaces.length > 1 && (
        <select
          value={resolvedSpaceId}
          onChange={(e) => setTargetSpaceId(e.target.value)}
          className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-[11px] text-neutral-300 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          {activeSpaces.map((s) => (
            <option key={s.id} value={s.id}>
              in {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (entries.length === 0) {
    return (
      <div>
        {scopeToggle}
        {createBar}
        <div className="text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded-xl">
          {scope === 'mine' ? 'No private docs yet.' : 'No docs in this workspace yet.'}
        </div>
      </div>
    );
  }

  return (
    <>
    {scopeToggle}
    {createBar}
    <div className="grid grid-cols-3 gap-2">
      {entries.map(({ doc, space }) => (
        <div
          key={doc.id}
          onClick={() => onOpenDoc(space.id, doc.folderId, doc.id)}
          className="group text-left p-3 rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer relative"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs text-neutral-200 font-medium truncate">{doc.title || 'Untitled'}</span>
          </div>
          <div className="text-[10px] text-neutral-500 truncate mb-1">{doc.content ? doc.content.slice(0, 60) : 'Empty document'}</div>
          <span className="text-[9px] text-neutral-500 border border-neutral-700 rounded-lg px-1 shrink-0">{space.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteDocRequest(doc);
            }}
            title="Delete"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
    </>
  );
}
