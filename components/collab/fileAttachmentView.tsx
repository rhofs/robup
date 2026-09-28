'use client';

import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { File, FileText, FileSpreadsheet, FileArchive, FileAudio, FileVideo, Presentation } from 'lucide-react';
import { FileAttachmentNode, fileAttachmentHref, type FileAttachmentAttrs } from '../../lib/collab/fileAttachmentNode';
import { formatBytes } from '../../lib/formatBytes';

// What kind of file, by extension — the icon and its colour are how a row of files in a doc can be
// told apart at a glance (the contract is the blue one, the budget the green one).
function fileLook(name: string): { Icon: typeof File; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { Icon: FileText, color: '#e5534b' };
  if (ext === 'doc' || ext === 'docx' || ext === 'txt') return { Icon: FileText, color: '#4f8ef7' };
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return { Icon: FileSpreadsheet, color: '#3fb27f' };
  if (ext === 'ppt' || ext === 'pptx') return { Icon: Presentation, color: '#e8903a' };
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return { Icon: FileArchive, color: '#a3a3a3' };
  if (ext === 'mp3' || ext === 'wav') return { Icon: FileAudio, color: '#b77cf0' };
  if (ext === 'mp4' || ext === 'mov') return { Icon: FileVideo, color: '#b77cf0' };
  return { Icon: File, color: '#a3a3a3' };
}

// The chip: the file's icon and name, like a link — clicking it opens the file (a PDF in the browser,
// anything else downloads, under its own name). Opens on click while editing too: it is a link to
// a file, and ClickUp's, which this was modelled on, does the same. To remove one, put the caret
// after it and press Backspace, or select it and delete — it is one unit.
function FileChip({ node, selected }: ReactNodeViewProps) {
  const { url, name, size } = node.attrs as FileAttachmentAttrs;
  const { Icon, color } = fileLook(name);
  return (
    <NodeViewWrapper as="span" className="inline">
      <a
        contentEditable={false}
        href={url ? fileAttachmentHref(url, name) : undefined}
        target="_blank"
        rel="noopener noreferrer"
        title={size ? `${name} · ${formatBytes(size)}` : name}
        onClick={(e) => {
          // Opened here rather than left to the browser: whether a link inside an editable area is
          // followed at all differs between browsers, and the editor's own link handling
          // (openLinkOnClick in CollabDocEditor) must not open it a second time.
          e.preventDefault();
          e.stopPropagation();
          if (url) window.open(fileAttachmentHref(url, name), '_blank', 'noopener,noreferrer');
        }}
        className={`siqt-file-chip inline-flex items-center gap-1.5 max-w-[280px] align-middle mx-0.5 pl-1.5 pr-2 py-0.5 rounded-md border text-[12.5px] font-medium no-underline cursor-pointer transition ${
          selected ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/60 hover:bg-neutral-800 hover:border-neutral-600'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="truncate text-app-strong">{name}</span>
      </a>
    </NodeViewWrapper>
  );
}

export const ClientFileAttachmentNode = FileAttachmentNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FileChip);
  },
});
