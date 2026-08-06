'use client';

import { ListChecks, FileText, UserCircle } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';
import { parseMentions, resolveMentionEntity, type MentionKind } from '../lib/mentions';

const KIND_ICON: Record<MentionKind, typeof ListChecks> = {
  task: ListChecks,
  doc: FileText,
  user: UserCircle,
};

// No natural per-entity color for tasks/docs the way assignees already have `user.color` — fixed
// accent per kind, pulled from the app's existing muted/pastel FIELD_COLOR_CHOICES palette.
const KIND_COLOR: Record<MentionKind, string> = {
  task: '#618cd1',
  doc: '#349f7c',
  user: '#8d97a5',
};

type MentionTextProps = {
  text: string;
  onJump: (kind: MentionKind, id: string) => void;
  className?: string;
};

// Read-only renderer for text containing @-mention tokens (`@[Label](kind:id)`) — used for posted
// comment bodies and the Doc editor's view-mode. Renders a <div>, not <p>, so it works in both spots.
export default function MentionText({ text, onJump, className }: MentionTextProps) {
  const { tasks, users, workspaces } = useTaskStore();
  const segments = parseMentions(text);

  return (
    <div className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        const resolved = resolveMentionEntity(seg.kind, seg.id, seg.label, { tasks, users, workspaces });
        const Icon = KIND_ICON[seg.kind];
        const color = seg.kind === 'user' ? users.find((u) => u.id === seg.id)?.color ?? KIND_COLOR.user : KIND_COLOR[seg.kind];
        if (!resolved.found) {
          return (
            <span
              key={i}
              title="No longer exists"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-medium text-neutral-500 bg-neutral-800/60 line-through align-middle"
            >
              <Icon className="w-3 h-3 shrink-0" />
              {resolved.label}
            </span>
          );
        }
        return (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onJump(seg.kind, seg.id);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-semibold text-white cursor-pointer hover:brightness-110 transition align-middle"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {resolved.label}
          </button>
        );
      })}
    </div>
  );
}
