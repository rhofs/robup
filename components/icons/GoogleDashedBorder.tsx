// A dashed border in Google's own 4-color "rainbow" (blue/red/yellow/green) — shown around an
// Event that was imported from Google Calendar (Event.importedFromGoogle), on top of the plain
// single-color dashed border every other Event gets. A real multi-color dashed CSS border isn't
// possible directly (border-color is one flat color, and border-image ignores both border-style
// and border-radius in every browser) — four separate absolutely-positioned strips, each a
// repeating-linear-gradient along its own edge, is the reliable way to get an actual dashed line
// in more than one color. rounded-[inherit] + overflow-hidden on the wrapper clips the strips to
// whatever border-radius the parent bar already has, so this doesn't need to know which corners
// are actually rounded.
const GOOGLE_BLUE = '#4285F4';
const GOOGLE_RED = '#EA4335';
const GOOGLE_YELLOW = '#FBBC05';
const GOOGLE_GREEN = '#34A853';

const dash = (color: string) => `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)`;
const dashVertical = (color: string) => `repeating-linear-gradient(to bottom, ${color} 0 4px, transparent 4px 7px)`;

export default function GoogleDashedBorder() {
  return (
    <div className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
      <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ backgroundImage: dash(GOOGLE_BLUE) }} />
      <div className="absolute top-0 bottom-0 right-0 w-[1.5px]" style={{ backgroundImage: dashVertical(GOOGLE_RED) }} />
      <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ backgroundImage: dash(GOOGLE_YELLOW) }} />
      <div className="absolute top-0 bottom-0 left-0 w-[1.5px]" style={{ backgroundImage: dashVertical(GOOGLE_GREEN) }} />
    </div>
  );
}
