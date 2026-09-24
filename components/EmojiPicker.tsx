'use client';

import { useEffect, useRef, useState } from 'react';

// An emoji picker for the desktop composer, and deliberately not one for mobile.
//
// A phone keyboard already has an emoji key, so on mobile this button would be a second, worse copy
// of a control the OS provides — which is why the report was specifically "emoji-knapp på desktop".
// On a physical keyboard there is no such key, and typing one means leaving the app.
//
// Still no emoji-picker library, matching the call already made for reactions: the schema stores raw
// unicode with no shortcodes, so a library would be bringing a search index and a sprite sheet to a
// problem that is a list of characters. What a curated list cannot do is search, and the answer to
// that is Recent — the emoji a given person actually uses is a short list, and putting it first
// removes most of the hunting that search would otherwise be for.

const RECENT_KEY = 'siqt.emoji.recent';
const RECENT_MAX = 24;

// Curated rather than exhaustive: every entry here is one someone might plausibly put in a work
// message. The full unicode set is ~3,800 characters, and the ones past this list are the reason
// pickers need search in the first place.
const CATEGORIES: { id: string; label: string; icon: string; emoji: string[] }[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emoji: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤐','🤨',
      '😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒',
      '🤕','🤢','🤮','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮',
      '😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓',
      '😩','😫','🥱','😤','😡','😠','🤬','😈','💀','💩','🤡','👻','👽','🤖','🎃',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: '👍',
    emoji: [
      '👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️',
      '✋','🤚','🖐️','🖖','👋','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','👃',
      '🧠','🫀','👀','👁️','👄','🫂','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵',
      '🙋','🙆','🙅','💁','🤷','🤦','🙇','🧑‍💻','👨‍💻','👩‍💻','🕺','💃','🧘',
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    icon: '🌿',
    emoji: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔',
      '🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞',
      '🐜','🕷️','🦂','🐢','🐍','🦎','🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🦈',
      '🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🍃','🍂','🍁','🌾','🌷','🌹',
      '🌺','🌻','🌼','🌸','💐','🍄','🌍','🌎','🌏','🌕','🌙','⭐','🌟','✨','⚡','☄️',
      '🔥','🌈','☀️','⛅','☁️','🌧️','⛈️','❄️','⛄','💧','🌊',
    ],
  },
  {
    id: 'food',
    label: 'Food',
    icon: '🍕',
    emoji: [
      '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
      '🥝','🍅','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞',
      '🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙',
      '🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍥','🥠','🍦','🍩','🍪','🎂',
      '🍰','🧁','🍫','🍬','🍭','🍯','☕','🍵','🧃','🥤','🍺','🍻','🥂','🍷','🥃','🍾',
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: '⚽',
    emoji: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍',
      '🏏','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿',
      '⛷️','🏂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧗','🚴','🚵','🏊','🏄','🚣',
      '🎯','🎮','🕹️','🎲','🧩','🎰','🎳','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷',
      '🎺','🎸','🪕','🎻','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎫','🎟️','🎪','🎉','🎊',
    ],
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: '✈️',
    emoji: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️',
      '🚲','🛴','🚨','🚔','🚍','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','✈️','🛫','🛬',
      '🛩️','🚁','🛸','🚀','⛵','🛥️','🚤','🛳️','⛴️','🚢','⚓','🗺️','🧭','🏔️','⛰️','🌋',
      '🏕️','🏖️','🏜️','🏝️','🏟️','🏛️','🏗️','🏠','🏡','🏢','🏣','🏥','🏦','🏨','🏩','🏪',
      '🏫','🏭','⛪','🕌','🛕','🕍','⛩️','🌁','🌃','🌆','🌇','🌉','🗼','🗽','🎡','🎢',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    icon: '💡',
    emoji: [
      '⌚','📱','💻','🖥️','🖨️','⌨️','🖱️','💽','💾','💿','📀','📷','📸','📹','🎥','📽️',
      '📞','☎️','📟','📠','📺','📻','🎙️','⏰','⏱️','⏲️','🕰️','⌛','⏳','🔋','🔌','💡',
      '🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','🧾','💎','⚖️','🪜',
      '🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🔪','🗡️','🛡️',
      '🚬','⚰️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','💊','💉','🩹','🩺','🌡️',
      '🧹','🧺','🧻','🚽','🚿','🛁','🧼','🪒','🧽','🔑','🗝️','🚪','🪑','🛏️','🛋️','🧸',
      '🖼️','🛍️','🎁','🎀','✉️','📩','📤','📥','📦','📪','📫','📬','📭','📮','📝','✏️',
      '🖊️','🖍️','📁','📂','🗂️','📅','📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍',
      '📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗑️','🔒','🔓','📖','📚','📓','📔','📒','📃',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '❤️',
    emoji: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💯','💢','💬','💭','🗯️','♻️','✅','☑️','✔️','❌','❎','➕','➖','➗',
      '✖️','🟰','❓','❔','❗','❕','‼️','⁉️','〽️','⚠️','🚸','🔱','⚜️','🔰','♾️','🔺',
      '🔻','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪',
      '⬛','⬜','🔶','🔷','🔸','🔹','🔘','🔳','🔲','▶️','⏸️','⏹️','⏺️','⏭️','⏮️','🔀',
      '🔁','🔂','🔼','🔽','⏫','⏬','⬆️','⬇️','⬅️','➡️','↗️','↘️','↙️','↖️','↕️','↔️',
      '🔄','🔃','🔝','🔜','🔚','🔙','🔛','🆕','🆗','🆙','🆒','🆓','🆖','🈶','🅰️','🅱️',
      '🔔','🔕','📢','📣','💤','🏁','🚩','🎌','🏳️','🏴','🏳️‍🌈',
    ],
  },
];

function readRecent(): string[] {
  // Every storage access is wrapped: a private window or a browser set to block site data throws on
  // the accessor itself rather than returning null, and an emoji button is not worth a blank panel.
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export default function EmojiPicker({
  onPick,
  onClose,
  // The button that opened this. Clicks on it are ignored here so that it can toggle: without this,
  // the outside-click handler closes on the way down and the button's own click reopens on the way
  // up, and the panel never shuts.
  triggerRef,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const rootRef = useRef<HTMLDivElement>(null);

  // Read on mount rather than in the initial state: this renders on the server too, where there is
  // no localStorage, and a value that differs between server and client is a hydration mismatch.
  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Capture, so a click that lands on a button elsewhere closes this before that button's own
    // handler runs — otherwise picking something behind the panel does two things at once.
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, triggerRef]);

  const pick = (emoji: string) => {
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Recents are a convenience; losing them is not a reason to fail the insert below.
    }
    onPick(emoji);
    // Stays open: picking two in a row is common enough that closing on the first is the annoying
    // half of every picker that does it. Escape, a click outside, or the button itself closes it.
  };

  const active = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  return (
    <div
      ref={rootRef}
      className="absolute bottom-full left-0 mb-2 z-50 w-[19rem] rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden"
      // The composer forwards Enter to send. Keystrokes that reach this panel are its own business.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 border-b border-neutral-800 px-1.5 py-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            title={c.label}
            className={`flex-1 rounded-lg py-1 text-base leading-none transition cursor-pointer ${
              c.id === category ? 'bg-neutral-800' : 'opacity-50 hover:opacity-100'
            }`}
          >
            {c.icon}
          </button>
        ))}
      </div>

      <div className="max-h-56 overflow-y-auto px-1.5 py-1.5">
        {recent.length > 0 && (
          <>
            <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Recent</p>
            <div className="grid grid-cols-8 gap-0.5 pb-2">
              {recent.map((e) => (
                <EmojiButton key={`recent-${e}`} emoji={e} onPick={pick} />
              ))}
            </div>
          </>
        )}
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">{active.label}</p>
        <div className="grid grid-cols-8 gap-0.5">
          {active.emoji.map((e) => (
            <EmojiButton key={`${active.id}-${e}`} emoji={e} onPick={pick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmojiButton({ emoji, onPick }: { emoji: string; onPick: (emoji: string) => void }) {
  return (
    <button
      // The composer keeps focus, so the caret stays where the emoji is about to land.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(emoji)}
      className="aspect-square rounded-lg text-lg leading-none flex items-center justify-center hover:bg-neutral-800 cursor-pointer transition"
    >
      {emoji}
    </button>
  );
}
