'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

// Drop-in replacement for a plain <input> for an event's Location field — same value/onChange
// contract, plus a suggestions dropdown backed by app/api/places/autocomplete (Google Places
// Autocomplete, proxied server-side). Debounced + abort-controlled so a burst of keystrokes
// collapses into the last real request, not one per character. Generates a random "session
// token" (Google's own cost-optimization convention for Autocomplete) once per search — reused
// across keystrokes, discarded once a suggestion is picked or the field is cleared, matching
// Google's documented session lifecycle.
//
// If GOOGLE_PLACES_API_KEY isn't set server-side, /api/places/autocomplete always returns
// `configured: false` — this component just never shows a dropdown in that case, behaving as a
// completely plain text input with zero visual difference. No error state, no "not configured"
// message — it should be invisible whether the feature is live or not.
export default function LocationAutocompleteInput({ value, onChange, placeholder, className }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const fetchSuggestions = (input: string) => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    if (input.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
      try {
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(input)}&sessionToken=${sessionTokenRef.current}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const next: string[] = data.suggestions ?? [];
        setSuggestions(next);
        setOpen(next.length > 0);
      } catch {
        // Aborted by a newer keystroke, or a network hiccup — either way, just leave whatever
        // suggestions (if any) are already showing rather than surfacing an error for this.
      }
    }, 300);
  };

  const pick = (s: string) => {
    onChange(s);
    setSuggestions([]);
    setOpen(false);
    sessionTokenRef.current = null;
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        // Delay long enough for a suggestion button's onMouseDown-preventDefault (below) to win
        // the race against this blur closing the dropdown before the click registers.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded shadow-xl max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
            >
              <MapPin className="w-3 h-3 shrink-0 text-neutral-500" />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
