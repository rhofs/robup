// Plain Google Maps search URL — no API key/Places integration needed, works for any free-text
// address or place name a user types. Shared by QuickCreatePopover.tsx (new Event) and
// EventDetailModal.tsx (existing Event) so both "open in Maps" links build the URL identically.
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
