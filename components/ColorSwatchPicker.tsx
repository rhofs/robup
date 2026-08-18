'use client';

import { useState } from 'react';

type ColorSwatchPickerProps = {
  // Nullable because Folder/List colors can be null ("use the default look") — a separate
  // "Default" button stays outside this component at those call sites; null here just means the
  // custom-color swatch shows a neutral placeholder and never claims the "selected" ring.
  value: string | null;
  onChange: (color: string) => void;
  choices: string[];
  size?: 'sm' | 'md';
};

const SIZE_CLASSES = { sm: 'w-4 h-4', md: 'w-6 h-6' } as const;
const SAVED_COLORS_KEY = 'qvip.savedColors';
const MAX_SAVED_COLORS = 16;

// Shared app-wide across every color picker (Space/Folder/List/Room/Role/Status/custom-field/Doc
// text+highlight) rather than scoped per-usage — a color a user picks and saves once should be
// reachable everywhere, same "one shared list" precedent as qvip.collapsedFolders.
function readSavedColors(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_COLORS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSavedColors(colors: string[]) {
  try {
    localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(colors));
  } catch {}
}

// Shared swatch row (preset choices) + saved custom colors + one more swatch wrapping a native
// <input type="color"> (a real RGB/hue picker, no custom wheel-drawing needed) — the
// hidden-input-over-a-styled-label is the standard trick for making a native color input look
// like the rest of the swatch row instead of the browser default. Picking a custom color doesn't
// save it automatically (the native input's onChange fires continuously while dragging, which
// would spam the saved list with every intermediate color) — saving is a deliberate extra click.
export default function ColorSwatchPicker({ value, onChange, choices, size = 'md' }: ColorSwatchPickerProps) {
  const dim = SIZE_CLASSES[size];
  const [savedColors, setSavedColors] = useState<string[]>(readSavedColors);
  const isKnown = value !== null && (choices.includes(value) || savedColors.includes(value));
  const isCustom = value !== null && !isKnown;

  const saveCurrentColor = () => {
    if (!value || isKnown) return;
    const next = [value, ...savedColors].slice(0, MAX_SAVED_COLORS);
    setSavedColors(next);
    writeSavedColors(next);
  };

  const removeSavedColor = (color: string) => {
    const next = savedColors.filter((c) => c !== color);
    setSavedColors(next);
    writeSavedColors(next);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`${dim} rounded-full cursor-pointer shrink-0 ${value === c ? 'ring-2 ring-white' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
        {savedColors.map((c) => (
          <button
            key={c}
            type="button"
            title="Right-click to remove"
            onClick={() => onChange(c)}
            onContextMenu={(e) => {
              e.preventDefault();
              removeSavedColor(c);
            }}
            className={`${dim} rounded-full cursor-pointer shrink-0 ring-1 ring-neutral-700 ${value === c ? 'ring-2 ring-white' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label
          title="Pick a custom color"
          className={`${dim} rounded-full cursor-pointer shrink-0 relative overflow-hidden ring-1 ring-neutral-600 ${isCustom ? 'ring-2 ring-white' : ''}`}
          // A flat swatch showing whatever color is already selected reads as just another
          // (redundant) preset dot, not as "click me for more" — a conic-gradient spectrum is
          // the standard "more colors..." affordance and stays visually distinct from every
          // flat preset/saved swatch around it. Only shows the real picked color once it's
          // genuinely custom, same moment the white selection ring kicks in.
          style={{
            background: isCustom
              ? value ?? undefined
              : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
          }}
        >
          <input
            type="color"
            value={value ?? '#3f3f46'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-1 opacity-0 cursor-pointer w-[calc(100%+8px)] h-[calc(100%+8px)]"
          />
        </label>
      </div>
      {isCustom && (
        <button type="button" onClick={saveCurrentColor} className="text-[10px] text-neutral-400 hover:text-blue-400 cursor-pointer">
          + Save this color
        </button>
      )}
    </div>
  );
}
