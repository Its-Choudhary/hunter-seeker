import { useEffect, useState } from 'react';

/** Current time, refreshed every `everyMs` — for clocks and "2m ago" labels. */
export function useNow(everyMs = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs, active]);
  return now;
}
