// A soft, filled, rounded caret that turns to point down when open — the app's expand arrow (task
// subtasks, status groups). Replaced the thin line chevron, which read as dated ("en annen type pil …
// mer moderne"). Takes the text colour.
export default function Caret({ open, className = 'w-2.5 h-2.5' }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={`${className} transition-transform duration-200 ease-out ${open ? 'rotate-90' : ''}`} aria-hidden>
      <path d="M3.2 1.6 C2.6 1.2 2 1.5 2 2.2 V7.8 C2 8.5 2.6 8.8 3.2 8.4 L7.6 5.6 C8.1 5.3 8.1 4.7 7.6 4.4 Z" fill="currentColor" />
    </svg>
  );
}
