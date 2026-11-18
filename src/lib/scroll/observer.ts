/**
 * Current-layer tracking with IntersectionObserver — part of the initial bundle (no GSAP needed).
 * A layer becomes current when it crosses a line at 40% of the viewport height.
 */
import { scrollStore } from './store';

export function startLayerObserver(): () => void {
  const sections = [...document.querySelectorAll<HTMLElement>('section.layer[data-layer]')];
  const order = sections.map((s) => s.dataset.layer as string);
  if (sections.length === 0) return () => {};

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.layer as string;
        const index = order.indexOf(id);
        const passed = order.slice(0, Math.max(index, scrollStore.get().passed.length - 1) + 1);
        scrollStore.set({ index, layerId: id, passed });
      }
    },
    { rootMargin: '-40% 0px -60% 0px', threshold: 0 },
  );
  for (const s of sections) io.observe(s);
  return () => io.disconnect();
}
