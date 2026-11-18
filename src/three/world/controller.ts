/**
 * Imperative side of the wall: everything that changes per frame or per event, kept out of React
 * (uniform writes are plain mutations of a three.js object).
 */
import { WALL_LAYER_COUNT, type WallMaterial } from '../materials/wall';

export type WallController = { frame: (elapsed: number, delta: number, width: number, height: number) => void; dispose: () => void };

export function createWallController(material: WallMaterial, ids: readonly string[]): WallController {
  const u = material.uniforms;

  // Layer tops in viewport heights, re-measured when the page's height changes.
  const sections = ids.map((id) => document.querySelector<HTMLElement>(`section.layer[data-layer="${id}"]`));
  const measure = () => {
    const tops = u.uLayerTop.value;
    for (let i = 0; i < WALL_LAYER_COUNT; i += 1) {
      const el = sections[i];
      tops[i] = el ? (el.getBoundingClientRect().top + window.scrollY) / window.innerHeight : 1e6;
    }
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(document.body);

  // Lantern input. Mouse: the beam is the cursor. Touch: it drifts, and follows a drag.
  const pointer = { x: 0.62, y: 0.45, active: false, touch: window.matchMedia('(pointer: coarse)').matches, lastTouch: -1e9 };
  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = 1 - e.clientY / window.innerHeight;
    pointer.active = true;
    if (e.pointerType !== 'mouse') pointer.lastTouch = performance.now();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });

  const beam = { x: 0.62, y: 0.45, strength: 0 };
  let announced = false;

  return {
    frame(elapsed, delta, width, height) {
      const depth = window.scrollY / window.innerHeight;
      u.uDepth.value = depth;
      u.uTime.value = elapsed;

      const narrow = width / height <= 1.15;
      const drifting = pointer.touch && performance.now() - pointer.lastTouch > 2500;
      const tx = drifting ? 0.5 + 0.3 * Math.sin(elapsed * 0.23) : pointer.x;
      const ty = drifting ? 0.5 + 0.22 * Math.sin(elapsed * 0.31 + 1.3) : pointer.y;
      const follow = 1 - Math.exp(-delta * (drifting ? 1.5 : 9));
      beam.x += (tx - beam.x) * follow;
      beam.y += (ty - beam.y) * follow;
      // On the hero only: full strength in the first viewport, gone one viewport further down.
      const want = (pointer.active || pointer.touch ? 1 : 0) * (narrow ? 0.55 : 1) * Math.max(0, 1 - Math.max(0, depth - 0.35) / 0.9);
      beam.strength += (want - beam.strength) * (1 - Math.exp(-delta * 4));
      u.uPointer.value.set(beam.x, beam.y);
      u.uBeam.value = beam.strength;

      // The hero shows the wall at full light; further down it sits back under the text.
      const heroEnd = (u.uLayerTop.value[1] ?? 2) - 0.6;
      const heroLevel = narrow ? 0.34 : 1;
      const deepLevel = narrow ? 0.26 : 0.55;
      const k = Math.min(1, Math.max(0, (depth - heroEnd + 0.5) / 0.8));
      u.uDim.value = heroLevel + (deepLevel - heroLevel) * k;

      if (!announced) {
        announced = true;
        document.documentElement.dataset.world = 'live'; // the poster can fade out now
      }
      const debug = (window as unknown as { __world?: { depth: number; beam: number } }).__world;
      if (debug) {
        debug.depth = depth;
        debug.beam = beam.strength;
      }
    },
    dispose() {
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    },
  };
}
