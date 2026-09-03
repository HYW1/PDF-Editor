import { useEffect, useState } from 'react';

export function useIsDesktop(minWidth = 900): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth >= minWidth
  );

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [minWidth]);

  return desktop;
}
