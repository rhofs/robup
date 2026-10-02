import { useId } from 'react';
import { siqtMarkSvg, type SiqtMarkOptions } from '../lib/siqtMark';

// The Siqt logo, drawn from the one shared definition (lib/siqtMark.ts). Size it with the className or
// style; it fills its box. Each instance gets its own gradient ids, so several can share a page.
export default function SiqtMark({
  className,
  style,
  ...opts
}: { className?: string; style?: React.CSSProperties } & Omit<SiqtMarkOptions, 'id'>) {
  const id = `siqt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <span
      aria-hidden
      className={`block shrink-0 ${className ?? ''}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: siqtMarkSvg({ ...opts, id }) }}
    />
  );
}
