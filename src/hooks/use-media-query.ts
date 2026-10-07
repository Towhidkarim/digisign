import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query. The first render already has the right answer in the browser,
 * so a screen that swaps layouts does not flash the wrong one. Before the browser exists it
 * returns `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? fallback : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
