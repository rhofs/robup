// No caret-coordinate library is installed in this app, and this is the one place that needs it
// (the @-mention dropdown, anchored to the caret inside a plain <textarea>). Hand-rolled mirror-div
// technique: clone the textarea's text-layout-relevant computed styles onto a hidden absolutely-
// positioned div, mirror the text up to the caret, measure a marker span's offset (which is relative
// to the div once the div itself is `position: absolute`, since it becomes the span's offsetParent),
// then combine with the textarea's own bounding rect + scroll offset. Client-only — only ever called
// from a keystroke handler on an already-mounted textarea, never at module scope or during SSR.

const PROPERTIES_TO_COPY: (keyof CSSStyleDeclaration)[] = [
  'boxSizing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'lineHeight',
  'tabSize',
];

export type CaretCoordinates = { top: number; left: number; height: number };

export function getCaretCoordinates(textarea: HTMLTextAreaElement, caretIndex: number): CaretCoordinates {
  const div = document.createElement('div');
  document.body.appendChild(div);

  const computed = window.getComputedStyle(textarea);
  const style = div.style;
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0px';
  style.left = '-9999px';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.width = computed.width;

  for (const prop of PROPERTIES_TO_COPY) {
    (style as unknown as Record<string, string>)[prop as string] = computed[prop] as string;
  }

  div.textContent = textarea.value.substring(0, caretIndex);
  // A caret right after a trailing newline needs a phantom character to actually wrap onto the
  // next line during measurement — otherwise the marker span stays glued to the line above.
  if (textarea.value[caretIndex - 1] === '\n') div.textContent += ' ';

  const span = document.createElement('span');
  span.textContent = textarea.value.substring(caretIndex) || '.';
  div.appendChild(span);

  const rect = textarea.getBoundingClientRect();
  const top = rect.top - textarea.scrollTop + span.offsetTop;
  const left = rect.left - textarea.scrollLeft + span.offsetLeft;
  const height = parseInt(computed.lineHeight, 10) || span.offsetHeight || 16;

  document.body.removeChild(div);
  return { top, left, height };
}
