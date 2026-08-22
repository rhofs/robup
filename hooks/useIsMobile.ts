import { useEffect, useState } from 'react';

// Matches on viewport width OR pointer precision so a touch-primary device with a wide
// viewport (large tablet in portrait, foldable) still gets the touch interaction model,
// not just phones.
const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false); // SSR-safe default = desktop path

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}
