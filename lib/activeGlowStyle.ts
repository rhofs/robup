import type { CSSProperties } from 'react';

// How an active row in a tree is distinguished: weight only, never colour.
//
// This used to blend the item's own colour 65% toward white — "lit up" — and that worked because it
// was designed while the app was dark-only. On a light background the same blend makes the label
// PALER, so the active row became the hardest one to read. It is the same theme-blindness that ran
// through every user-chosen text colour here, and it is why those were dropped: a colour chosen once
// cannot sit on two opposite backgrounds.
//
// The colour is not lost — it lives on each row's icon, where the surface behind it is fixed and
// contrast can be relied on. The label's job is to be read.
export function activeGlowStyle(_color?: string | null): CSSProperties {
  return { fontWeight: 600 };
}
