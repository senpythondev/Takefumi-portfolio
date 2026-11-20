/**
 * The stardust over the whole viewport (docs/STORYBOARD.md v2.4 §11.1): soft glowing grains in front
 * of the rock and the worlds, in every act and over the hero's sky. Around the pointer (a quarter of
 * the viewport's width) the grains are drawn toward it, up to about 5 % of the width, brighten, and
 * wind slowly around it like fireflies gathering; a moving pointer stirs the grains in its wake, and
 * springs bring every grain home. A dragging finger does the same.
 *
 * The grains live in screen space (units of the viewport's width), so the layer always covers the
 * screen whatever the camera does. A few hundred grains, simulated on the CPU (two springs' worth of
 * arithmetic each), drawn as one additive Points call.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
import { FLUCT_GLSL } from '../worlds/kit';

/** Reach of the pointer and the furthest a grain is drawn, as fractions of the viewport's width. */
const REACH = 0.25;
/** (v2.5: the furthest a grain is drawn comes from the tuning — 2–3 % of the width by default.) */
const SWIRL_RATIO = 0.36;
const STIR_REACH = 0.14;
/** The spring that carries a grain (ω in 1/s, damping ratio): soft, a little alive, never jumpy. */
const OMEGA = 5.2;
const ZETA = 0.62;

export function createStardust(count: number) {
  const home = new Float32Array(count * 2);
  const depth = new Float32Array(count);
  const off = new Float32Array(count * 2);
  const vel = new Float32Array(count * 2);
  const position = new Float32Array(count * 3);
  const glow = new Float32Array(count);
  const seed = new Float32Array(count);
  // A fixed sequence (no Math.random): the same sky on every visit and in every screenshot.
  let s = 20261120;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    home[i * 2] = rnd();
    home[i * 2 + 1] = rnd();
    depth[i] = 0.25 + 0.75 * rnd() * rnd();
    seed[i] = rnd();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aGlow', new BufferAttribute(glow, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geometry.setAttribute('aDepth', new BufferAttribute(depth, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAmount: { value: 1 }, uHeight: { value: 800 } },
    vertexShader: /* glsl */ `
      attribute float aGlow;
      attribute float aSeed;
      attribute float aDepth;
      uniform float uTime;
      uniform float uPx;
      uniform float uHeight;
      varying float vAlpha;
      varying float vGlow;
      ${FLUCT_GLSL}
      void main() {
        // position.xy is already in clip space (the simulation works on the screen).
        gl_Position = vec4(position.xy, 0.0, 1.0);
        float flick = 0.62 + 0.38 * fluct(uTime * (0.5 + aSeed), aSeed * 31.0);
        vGlow = aGlow;
        // v2.5 §11.1: a supporting part — half the size and light of v2.4, far grains dimmer than near
        // ones, and a grain by the pointer only a little brighter.
        vAlpha = (0.1 + 0.34 * aDepth * aDepth) * flick + 0.3 * aGlow;
        float size = (1.8 + 3.7 * aDepth) * (1.0 + 0.5 * aGlow);
        gl_PointSize = max(1.5, size * uPx * clamp(uHeight / 900.0, 0.8, 1.4));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      varying float vAlpha;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float soft = smoothstep(1.0, 0.0, d);
        // A bright heart with a soft halo: a grain reads as a small light, not as a pixel.
        // Kept at or below 1: brighter values came out of the post-processing with a dark heart.
        // Never a strong light in front of the picture: capped well below the worlds' own lights.
        float a = min(0.6, (soft * soft * soft + 0.4 * soft) * vAlpha * uAmount);
        // Pale warm white; a grain near the pointer leans to the evidence cyan.
        vec3 c = mix(vec3(0.96, 0.91, 0.8), vec3(0.6, 0.95, 1.0), vGlow * 0.7);
        gl_FragColor = vec4(c * a, a);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 50;
  points.name = 'stardust';

  let moving = false;
  let pulled = 0;
  let maxOff = 0;

  return {
    points,
    material,
    count,
    /** The grains are still away from home (the low tier keeps drawing while they are). */
    moving: () => moving,
    /** For the tests and the debug HUD: grains drawn toward the pointer, and the furthest one (fraction of the width). */
    stats: () => ({ count: geometry.drawRange.count === Infinity ? count : geometry.drawRange.count, pulled, maxOff }),
    /**
     * `px`, `py`: the pointer in viewport fractions (0–1, y down); `on`: 0–1, how present it is;
     * `vx`, `vy`: its speed (viewport widths per second); `drift`: how far the story has travelled
     * (the grains slide past by depth, as if the camera sank through them).
     */
    frame(time: number, dt: number, aspect: number, px: number, py: number, on: number, vx: number, vy: number, drift: number, amount: number, dpr: number, height: number, pull: number, share: number) {
      // The tuning's amount: only the first grains are drawn (the rest stay at home, unseen).
      geometry.setDrawRange(0, Math.max(0, Math.min(count, Math.round(count * share))));
      const PULL = pull;
      const SWIRL = pull * SWIRL_RATIO;
      const u = material.uniforms;
      u.uTime!.value = time;
      u.uPx!.value = dpr;
      u.uAmount!.value = amount;
      u.uHeight!.value = height;
      const h = 1 / aspect; // the viewport's height in widths
      const cx = px;
      const cy = py * h;
      // On a slow frame the springs take several steps, so the grains keep their pace in wall-clock time.
      const total = Math.min(dt, 0.25);
      const steps = Math.max(1, Math.ceil(total / (1 / 30)));
      const step = total / steps;
      const k = OMEGA * OMEGA;
      const c = 2 * ZETA * OMEGA;
      const speed = Math.min(1.6, Math.hypot(vx, vy));
      let still = true;
      pulled = 0;
      maxOff = 0;
      for (let i = 0; i < count; i += 1) {
        const d = depth[i] as number;
        // Home: a slow drift of its own, and the slide of the story (wrapped with a margin, so no grain pops).
        const hx = (((home[i * 2] as number) + 0.012 * Math.sin(time * 0.11 + i) * d) * 1.1 - 0.05);
        const wrapped = ((((home[i * 2 + 1] as number) - drift * 0.22 * d + time * 0.004 * d) % 1) + 1) % 1;
        const hy = (wrapped * 1.1 - 0.05) * h;
        let ox = off[i * 2] as number;
        let oy = off[i * 2 + 1] as number;
        let wx = vel[i * 2] as number;
        let wy = vel[i * 2 + 1] as number;
        // Where the pointer wants this grain: toward it, and a little around it.
        let rx = 0;
        let ry = 0;
        let g = 0;
        if (on > 0.001) {
          const dx = cx - hx;
          const dy = cy - hy;
          const dist = Math.hypot(dx, dy);
          if (dist < REACH) {
            const f = 1 - dist / REACH;
            // Eased out: grains half-way across the reach still come a good part of the way.
            const fall = f * (2 - f) * on;
            const reach = Math.min(dist * 0.8, PULL * fall * (0.7 + 0.3 * d));
            const inv = 1 / Math.max(dist, 1e-4);
            const swirl = SWIRL * fall * Math.min(1, dist / 0.04);
            rx = dx * inv * reach - dy * inv * swirl;
            ry = dy * inv * reach + dx * inv * swirl;
            g = fall;
            if (fall > 0.15) pulled += 1;
            // The wake: a grain close to a moving pointer is carried along, then swings back.
            const near = Math.hypot(cx - (hx + ox), cy - (hy + oy));
            if (near < STIR_REACH && speed > 0.02) {
              const stir = (1 - near / STIR_REACH) * 2.6 * total * on;
              wx += vx * stir;
              wy += vy * stir;
            }
          }
        }
        for (let n = 0; n < steps; n += 1) {
          wx += (k * (rx - ox) - c * wx) * step;
          wy += (k * (ry - oy) - c * wy) * step;
          ox += wx * step;
          oy += wy * step;
        }
        off[i * 2] = ox;
        off[i * 2 + 1] = oy;
        vel[i * 2] = wx;
        vel[i * 2 + 1] = wy;
        const len = Math.hypot(ox, oy);
        if (len > maxOff) maxOff = len;
        if (len > 2e-4 || Math.abs(wx) + Math.abs(wy) > 2e-4) still = false;
        glow[i] = (glow[i] as number) + (g - (glow[i] as number)) * Math.min(1, total * 5);
        position[i * 3] = (hx + ox) * 2 - 1;
        position[i * 3 + 1] = 1 - ((hy + oy) / h) * 2;
      }
      moving = !still;
      (geometry.attributes.position as BufferAttribute).needsUpdate = true;
      (geometry.attributes.aGlow as BufferAttribute).needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
