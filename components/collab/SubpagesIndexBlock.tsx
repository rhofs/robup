'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { FileText, Plus } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore';
import { getChildDocs } from '../../lib/docFolderTree';
import type { SubpagesIndexExtensionOptions } from './subpagesIndexNodeView';

const GRID_TEMPLATE = 'minmax(0,1fr) 72px 110px';

// Node view for the `subpagesIndex` node (lib/collab/subpagesIndexNode.ts) — a live "Subpages"
// table a user has inserted directly into a doc's own content via the "/" menu's "Subpages" item.
// Resurrects the table layout this app briefly had as a fixed block above the editor (before
// moving to the DocSubpagesPanel side panel), now as a real, positionable content block instead.
// Subscribes to the store via the hook (not getState()) so it re-renders live as children are
// added/removed elsewhere — same technique MentionChip.tsx uses for live entity resolution.
//
// Deliberately NOT collapsible — always shows the full table, matching ClickUp's own Subpages
// section exactly (a first cut made this an expand/collapse heading; reverted per explicit user
// feedback). No outer border/box either — reads as part of the document, not a floating card.
export default function SubpagesIndexBlock({ node, extension }: ReactNodeViewProps) {
  const { workspaces, createSpaceDoc } = useTaskStore();
  const { docId } = node.attrs as { docId: string };
  const onOpenDoc = (extension.options as SubpagesIndexExtensionOptions).onOpenDoc;
  const onContextMenu = (extension.options as SubpagesIndexExtensionOptions).onContextMenu;

  let space, doc;
  outer: for (const ws of workspaces) {
    for (const s of ws.spaces) {
      const d = s.spaceDocs.find((x) => x.id === docId);
      if (d) {
        space = s;
        doc = d;
        break outer;
      }
    }
  }

  if (!space || !doc) {
    return (
      <NodeViewWrapper as="div" contentEditable={false} className="my-1 not-prose">
        <div className="text-[11px] text-neutral-500">Subpages (doc no longer exists)</div>
      </NodeViewWrapper>
    );
  }

  const workspace = workspaces.find((ws) => ws.spaces.some((s) => s.id === space!.id))!;
  const membersById = new Map(workspace.members.map((m) => [m.id, m]));
  const children = getChildDocs(space, docId);

  return (
    <NodeViewWrapper as="div" contentEditable={false} className="my-1 not-prose">
      <div
        className="grid gap-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800/60"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <span>Subpages</span>
        <span>Owner</span>
        <span>Contributors</span>
      </div>
      {children.length === 0 ? (
        <div className="py-2 text-[11px] text-neutral-500">No subpages yet.</div>
      ) : (
        <div className="divide-y divide-neutral-800/40">
          {children.map((child) => {
            const owner = child.ownerId ? membersById.get(child.ownerId) : undefined;
            const contributors = child.contributorIds.map((id) => membersById.get(id)).filter((u): u is (typeof workspace.members)[number] => !!u);
            return (
              <div
                key={child.id}
                onClick={() => onOpenDoc?.(child.id)}
                onContextMenu={(e) => onContextMenu?.(e, child)}
                className="grid gap-2 items-center py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/30 -mx-1 px-1 rounded cursor-pointer transition"
                style={{ gridTemplateColumns: GRID_TEMPLATE }}
              >
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-500" style={{ color: child.color || undefined }} />
                  <span className="truncate">{child.title || 'Untitled'}</span>
                </span>
                <span>
                  {owner && (
                    <span
                      title={owner.name}
                      className="w-5 h-5 rounded-full border border-neutral-900 text-[9px] font-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: owner.color }}
                    >
                      {owner.initials}
                    </span>
                  )}
                </span>
                <span className="flex items-center -space-x-1.5">
                  {contributors.slice(0, 3).map((u) => (
                    <span
                      key={u.id}
                      title={u.name}
                      className="w-5 h-5 rounded-full border border-neutral-900 text-[9px] font-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.initials}
                    </span>
                  ))}
                  {contributors.length > 3 && (
                    <span className="w-5 h-5 rounded-full border border-neutral-900 bg-neutral-700 text-[8px] font-bold flex items-center justify-center text-neutral-200">
                      +{contributors.length - 3}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => createSpaceDoc(space!.id, null, { parentId: docId })}
        className="w-full flex items-center gap-1.5 py-1.5 text-[11px] text-neutral-500 hover:text-blue-400 cursor-pointer transition"
      >
        <Plus className="w-3.5 h-3.5" /> Add subpage
      </button>
    </NodeViewWrapper>
  );
}
