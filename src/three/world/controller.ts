/**
 * Imperative side of the wall (acts 0–1): the lantern that follows the pointer (lantern.png) and the
 * clock. Everything else about the wall — framing, light level — is the director's (shots.ts).
 */
import type { WallMaterial } from '../materials/wall';

export type WallController = { frame: (elapsed: number, delta: number, width: number, height: number, lantern: number) => void; dispose: () => void };

export function createWallController(material: WallMaterial): WallController {
  const u = material.uniforms;
  u.uDepth.value = 0;

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
    frame(elapsed, delta, width, height, lantern) {
      u.uTime.value = elapsed;
      const narrow = width / height <= 1.15;
      const drifting = pointer.touch && performance.now() - pointer.lastTouch > 2500;
      const tx = drifting ? 0.5 + 0.3 * Math.sin(elapsed * 0.23) : pointer.x;
      const ty = drifting ? 0.5 + 0.22 * Math.sin(elapsed * 0.31 + 1.3) : pointer.y;
      const follow = 1 - Math.exp(-delta * (drifting ? 1.5 : 9));
      beam.x += (tx - beam.x) * follow;
      beam.y += (ty - beam.y) * follow;
      const want = (pointer.active || pointer.touch ? 1 : 0) * (narrow ? 0.32 : 1) * lantern;
      beam.strength += (want - beam.strength) * (1 - Math.exp(-delta * 4));
      u.uPointer.value.set(beam.x, beam.y);
      u.uBeam.value = beam.strength;

      // Rock textures fade in once they are loaded.
      if (u.uRock0.value && u.uRockMix.value < 1) u.uRockMix.value = Math.min(1, u.uRockMix.value + delta / 0.8);

      if (!announced) {
        announced = true;
        document.documentElement.dataset.world = 'live'; // the poster can fade out now
      }
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    },
  };
}
