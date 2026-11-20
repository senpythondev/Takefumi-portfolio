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

  // §10-G: the sky of the visitor's own hour. The clock is read here, on the device, and used for
  // nothing else — it is never sent anywhere.
  const SKY: [hour: number, low: [number, number, number], high: [number, number, number], stars: number][] = [
    [0, [0.02, 0.03, 0.052], [0.006, 0.009, 0.018], 1],
    [4, [0.03, 0.04, 0.07], [0.008, 0.012, 0.024], 1],
    [5.5, [0.2, 0.19, 0.22], [0.02, 0.03, 0.06], 0.45], // dawn: the horizon pales
    [7.5, [0.2, 0.28, 0.36], [0.06, 0.11, 0.18], 0],
    [15.5, [0.2, 0.28, 0.36], [0.06, 0.11, 0.18], 0], // day: a pale blue
    [17.5, [0.4, 0.17, 0.11], [0.06, 0.05, 0.1], 0.2], // dusk: madder red
    [19.5, [0.05, 0.04, 0.07], [0.008, 0.01, 0.022], 0.85],
    [24, [0.02, 0.03, 0.052], [0.006, 0.009, 0.018], 1],
  ];
  let skyMinute = -1;
  const setSky = () => {
    const now = new Date();
    if (now.getMinutes() === skyMinute) return;
    skyMinute = now.getMinutes();
    const h = now.getHours() + now.getMinutes() / 60;
    let i = 0;
    while (i < SKY.length - 2 && h >= (SKY[i + 1] as (typeof SKY)[number])[0]) i += 1;
    const a = SKY[i] as (typeof SKY)[number];
    const b = SKY[i + 1] as (typeof SKY)[number];
    const t = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
    const k = t * t * (3 - 2 * t);
    u.uSkyLow.value.set(a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k);
    u.uSkyHigh.value.set(a[2][0] + (b[2][0] - a[2][0]) * k, a[2][1] + (b[2][1] - a[2][1]) * k, a[2][2] + (b[2][2] - a[2][2]) * k);
    u.uStars.value = a[3] + (b[3] - a[3]) * k;
  };

  const beam = { x: 0.62, y: 0.45, strength: 0 };
  let announced = false;

  return {
    frame(elapsed, delta, width, height, lantern) {
      u.uTime.value = elapsed;
      setSky();
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
