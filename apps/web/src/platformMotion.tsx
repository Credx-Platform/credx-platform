import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Fade the existing view, never remount forms or reset their state. */
export function usePageFade(view: unknown, selector = 'main') {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = document.querySelector(selector) || document.querySelector('#root > div');
    if (!target || !target.animate) return;
    const transition = target.animate([{ opacity: 0.65 }, { opacity: 1 }], {
      duration: 260, easing: 'ease-out'
    });
    return () => transition.cancel();
  }, [view, selector]);
}

export function PlatformPageFade() {
  const { pathname } = useLocation();
  usePageFade(pathname);
  return null;
}
