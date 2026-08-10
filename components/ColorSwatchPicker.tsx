'use client';

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

// Shared swatch row (preset choices) + one more swatch wrapping a native <input type="color">,
// so every color picker in the app (Space/Folder/List/Room/Role/Status/custom-field-option edit)
// isn't limited to the ~8 presets — the hidden-input-over-a-styled-label is the standard trick for
// making a native color input look like the rest of the swatch row instead of the browser default.
export default function ColorSwatchPicker({ value, onChange, choices, size = 'md' }: ColorSwatchPickerProps) {
  const dim = SIZE_CLASSES[size];
  const isCustom = value !== null && !choices.includes(value);
  return (
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
      <label
        title="Custom color"
        className={`${dim} rounded-full cursor-pointer shrink-0 relative overflow-hidden ring-1 ring-neutral-600 ${isCustom ? 'ring-2 ring-white' : ''}`}
        style={{ backgroundColor: value ?? '#3f3f46' }}
      >
        <input
          type="color"
          value={value ?? '#3f3f46'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -inset-1 opacity-0 cursor-pointer w-[calc(100%+8px)] h-[calc(100%+8px)]"
        />
      </label>
    </div>
  );
}
