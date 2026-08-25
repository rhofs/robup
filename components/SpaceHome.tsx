'use client';

import { useMemo, useState } from 'react';
import {
  Image as ImageIcon,
  Pencil,
  ChevronRight,
  Folder as FolderIconLucide,
  List as ListIcon,
  X,
} from 'lucide-react';
import { useTaskStore, HierarchySpace, Task } from '../store/useTaskStore';
import { getChildFolders, getListsIn } from '../lib/folderTree';
import { FOLDER_ICON_MAP } from './FolderTree';
import { useIsMobile } from '../hooks/useIsMobile';

type SpaceHomeProps = {
  space: HierarchySpace;
  tasks: Task[];
  onNavigateList: (listId: string) => void;
};

export default function SpaceHome({ space, tasks, onNavigateList }: SpaceHomeProps) {
  const { updateSpace } = useTaskStore();
  const isMobile = useIsMobile();

  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const breadcrumb = useMemo(() => {
    const trail: { id: string | null; name: string }[] = [{ id: null, name: space.name }];
    let cursor = browsePath;
    const chain: { id: string; name: string }[] = [];
    while (cursor) {
      const folder = space.folders.find((f) => f.id === cursor);
      if (!folder) break;
      chain.unshift({ id: folder.id, name: folder.name });
      cursor = folder.parentId;
    }
    return [...trail, ...chain];
  }, [space, browsePath]);

  const childFolders = getChildFolders(space, browsePath);
  const childLists = getListsIn(space, browsePath);

  return (
    <div className="space-y-5">
      <CoverBanner space={space} onCommit={(url) => updateSpace(space.id, { coverImageUrl: url })} />
      <DescriptionBlock
        value={space.description}
        onCommit={(value) => updateSpace(space.id, { description: value })}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-[11px] text-neutral-500">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <button
                onClick={() => setBrowsePath(crumb.id)}
                className={`cursor-pointer hover:text-neutral-300 ${i === breadcrumb.length - 1 ? 'text-neutral-300 font-medium' : ''}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {childFolders.length === 0 && childLists.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
            Nothing in here yet.
          </div>
        ) : isMobile ? (
          // Flat, full-width rows instead of the desktop card grid — a 3-per-row card grid at
          // phone width crams a name/icon/count into a cramped square and, worse, a folder row
          // looks visually identical to a List row even though tapping one drills further into
          // this same screen while the other navigates away entirely to the List itself. A plain
          // list (chevron only on Folders, matching MobileSpacesSheet.tsx's own drill-down
          // convention for the exact same "this expands vs. this navigates" distinction) reads as
          // one predictable action per row instead.
          <div className="space-y-0.5">
            {childFolders.map((folder) => {
              const subFolderCount = getChildFolders(space, folder.id).length;
              const subListCount = getListsIn(space, folder.id).length;
              const CustomIcon = folder.icon ? FOLDER_ICON_MAP[folder.icon] : null;
              const Icon = CustomIcon || FolderIconLucide;
              return (
                <button
                  key={folder.id}
                  onClick={() => setBrowsePath(folder.id)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                >
                  <span className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" style={{ color: folder.color || undefined }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-200 truncate">{folder.name}</span>
                    <span className="block text-[11px] text-neutral-500 font-mono">
                      {subFolderCount > 0 ? `${subFolderCount} folders, ` : ''}
                      {subListCount} lists
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                </button>
              );
            })}
            {childLists.map((list) => {
              const count = tasks.filter((t) => t.listId === list.id && t.parentId === null && !t.archived).length;
              const CustomIcon = list.icon ? FOLDER_ICON_MAP[list.icon] : null;
              const Icon = CustomIcon || ListIcon;
              return (
                <button
                  key={list.id}
                  onClick={() => onNavigateList(list.id)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer hover:bg-neutral-800/60"
                >
                  <span className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" style={{ color: list.color || undefined }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-200 truncate">{list.name}</span>
                    <span className="block text-[11px] text-neutral-500 font-mono">{count} tasks</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {childFolders.map((folder) => {
              const subFolderCount = getChildFolders(space, folder.id).length;
              const subListCount = getListsIn(space, folder.id).length;
              const CustomIcon = folder.icon ? FOLDER_ICON_MAP[folder.icon] : null;
              const Icon = CustomIcon || FolderIconLucide;
              return (
                <button
                  key={folder.id}
                  onClick={() => setBrowsePath(folder.id)}
                  className="text-left p-3 rounded bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: folder.color || undefined }} />
                    <span className="text-xs text-neutral-200 font-medium truncate">{folder.name}</span>
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">
                    {subFolderCount > 0 ? `${subFolderCount} folders, ` : ''}
                    {subListCount} lists
                  </div>
                </button>
              );
            })}
            {childLists.map((list) => {
              const count = tasks.filter((t) => t.listId === list.id && t.parentId === null && !t.archived).length;
              const CustomIcon = list.icon ? FOLDER_ICON_MAP[list.icon] : null;
              const Icon = CustomIcon || ListIcon;
              return (
                <button
                  key={list.id}
                  onClick={() => onNavigateList(list.id)}
                  className="text-left p-3 rounded bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: list.color || undefined }} />
                    <span className="text-xs text-neutral-200 font-medium truncate">{list.name}</span>
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">{count} tasks</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Only rendered at all once a cover is actually set — used to always render a h-36 gradient
// placeholder + hover "Add cover" button on *every* Space regardless (including the auto-created
// personal "My Tasks" space, which never has one), permanent clutter for something most Spaces
// never use. Setting one for the first time now happens in the Edit Space modal (app/page.tsx,
// "Cover image URL" field) instead; this component keeps only the "change an existing one inline"
// convenience, since that's a real save vs. reopening Edit Space every time.
function CoverBanner({ space, onCommit }: { space: HierarchySpace; onCommit: (url: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(space.coverImageUrl || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (!space.coverImageUrl && !editing) return null;

  return (
    <div
      className="relative h-36 rounded overflow-hidden border border-neutral-800/80"
      style={
        space.coverImageUrl
          ? { backgroundImage: `url(${space.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: `linear-gradient(135deg, ${space.color}55, ${space.color}15)` }
      }
    >
      {editing ? (
        <div className="absolute inset-0 bg-neutral-950/80 flex items-center justify-center gap-2 p-4">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(space.coverImageUrl || '');
                setEditing(false);
              }
            }}
            placeholder="Paste an image URL…"
            className="w-full max-w-md bg-neutral-950 border border-blue-500 rounded px-3 py-1.5 text-xs text-white focus:outline-none"
          />
          <button onClick={commit} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded cursor-pointer">
            Save
          </button>
          <button
            onClick={() => {
              setDraft(space.coverImageUrl || '');
              setEditing(false);
            }}
            className="text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Edit cover image"
          className="absolute bottom-2 right-2 bg-neutral-950/70 hover:bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[10px] text-neutral-300 flex items-center gap-1 cursor-pointer"
        >
          <ImageIcon className="w-3 h-3" /> {space.coverImageUrl ? 'Change cover' : 'Add cover'}
        </button>
      )}
    </div>
  );
}

function DescriptionBlock({ value, onCommit }: { value: string | null; onCommit: (value: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value || '');
            setEditing(false);
          }
        }}
        rows={3}
        placeholder="Add a description…"
        className="w-full bg-neutral-900/60 border border-blue-500 rounded px-3 py-2 text-xs text-white focus:outline-none resize-none"
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="group flex items-start gap-2 px-3 py-2 rounded hover:bg-neutral-900/60 cursor-text -mx-3"
    >
      {value ? (
        <p className="text-xs text-neutral-300 whitespace-pre-wrap flex-1">{value}</p>
      ) : (
        <p className="text-xs text-neutral-500 italic flex-1">Add a description…</p>
      )}
      <Pencil className="w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
    </div>
  );
}
