import { useEffect, useRef } from 'react';

export function useEscapeKey(onClose: () => void) {
  const ref = useRef(onClose);
  useEffect(() => { ref.current = onClose; });
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);
}
