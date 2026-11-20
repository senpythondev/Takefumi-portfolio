/**
 * Act 5 — catch-up speed (速, STORYBOARD v2.1 §4): a high-speed descent.
 *
 * The camera rides down the borehole with the drill. The rock around it changes kind and colour
 * (one industry after another) and streaks of light rush backward. At each change the drill fires a
 * ring of light and one number appears — how long it took to deliver there (the act's four metrics,
 * one at a time: `data-step` on the section). Finally the years the AI tools came into use stream
 * past as ruler ticks (plain dates in the HTML; no new figure is made up here).
 */
import { Color, Group } from 'three';
import { layer as layerColor } from '@/styles/tokens';
import { COLORS, FLUCT_GLSL, clamp01, disposeGroup, geometry, glowLines, glowPoints, mix, rng, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const LEN = 92;
const RADIUS = 2.2;
// Where the rock changes (world z), one per metric.
const CHANGES = [-14, -32, -50, -68];
const TICKS = [-76, -80, -84, -88];

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const camZ = (q: number) => 5 - ease(clamp01(q)) * (LEN - 2);

export default function createCatchup(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(808);
  const rocks = [layerColor.surface, layerColor.genten, layerColor['php-audit'], layerColor.auction, layerColor.patent].map((c) => new Color(c));

  // ── The borehole's wall: points on a cylinder, each in the colour of its rock ──
  const n = ctx.count(16000);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const z = 4 - r() * (LEN + 6);
    const a = r() * Math.PI * 2;
    const rr = RADIUS * (0.96 + r() * 0.1);
    pos.set([Math.cos(a) * rr, Math.sin(a) * rr, z], i * 3);
    const k = CHANGES.filter((c) => z < c).length;
    const c = (rocks[k] as Color).clone().multiplyScalar(0.55 + 0.6 * r() * (0.6 + 0.4 * Math.sin(z * 3.1 + a * 2)));
    col.set([c.r, c.g, c.b], i * 3);
    seed[i] = r();
  }
  const wall = glowPoints(geometry({ position: { array: pos, size: 3 }, aCol: { array: col, size: 3 }, seed: { array: seed, size: 1 } }), {
    size: 1.6,
    uniforms: { uCamZ: { value: 0 } },
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      attribute vec3 aCol;
      attribute float seed;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      uniform float uCamZ;
      varying vec3 vCol;
      varying float vA;
      void main() {
        vCol = aCol;
        float ahead = uCamZ - position.z;
        vA = smoothstep(-1.0, 2.0, ahead) * smoothstep(40.0, 10.0, ahead) * (0.7 + 0.3 * fluct(uTime, seed));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (0.6 + seed) * uPx * (10.0 / max(0.4, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform float uFade;
      varying vec3 vCol;
      varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vCol * a * vA * uFade, 1.0);
      }`,
  });
  group.add(wall.points);

  // ── Streaks rushing backward (always around the camera) ──
  const S = ctx.count(420);
  const sPos = new Float32Array(S * 2 * 3);
  const sSeed = new Float32Array(S * 2);
  const sEnd = new Float32Array(S * 2);
  for (let i = 0; i < S; i += 1) {
    const a = r() * Math.PI * 2;
    const rr = RADIUS * (0.75 + r() * 0.2);
    const s0 = r();
    for (let e = 0; e < 2; e += 1) {
      sPos.set([Math.cos(a) * rr, Math.sin(a) * rr, 0], (i * 2 + e) * 3);
      sSeed[i * 2 + e] = s0;
      sEnd[i * 2 + e] = e;
    }
  }
  const streaks = glowLines(geometry({ position: { array: sPos, size: 3 }, aSeed: { array: sSeed, size: 1 }, aEnd: { array: sEnd, size: 1 } }), new Color('#cfeff2'), {
    uniforms: { uCamZ: { value: 0 }, uSpeed: { value: 0 } },
    vertex: /* glsl */ `
      attribute float aSeed;
      attribute float aEnd;
      uniform float uCamZ;
      uniform float uSpeed;
      varying float vA;
      void main() {
        float z = uCamZ - 1.0 - fract(aSeed - uCamZ * 0.025) * 40.0;
        z += aEnd * (0.2 + uSpeed * 3.5);
        vA = uSpeed * aEnd * smoothstep(40.0, 5.0, uCamZ - z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, z, 1.0);
      }`,
  });
  group.add(streaks.lines);

  // ── The drill: three fluted helices spinning ahead of the camera ──
  const drill: number[] = [];
  for (let h = 0; h < 3; h += 1)
    for (let k = 0; k < 40; k += 1) {
      const t0 = k / 40;
      const t1 = (k + 1) / 40;
      const at = (t: number) => {
        const a = h * ((Math.PI * 2) / 3) + t * Math.PI * 4;
        const rr = 0.55 * (1 - t);
        return [Math.cos(a) * rr, Math.sin(a) * rr, -t * 1.6] as const;
      };
      drill.push(...at(t0), ...at(t1));
    }
  const bit = glowLines(geometry({ position: { array: new Float32Array(drill), size: 3 } }), new Color('#bfe3e6'));
  group.add(bit.lines);

  // ── Rings of light at each change of rock, and the ticks of the AI-tool years ──
  const ringSeg: number[] = [];
  const ringId: number[] = [];
  [...CHANGES, ...TICKS].forEach((z, id) => {
    for (let k = 0; k < 64; k += 1) {
      const a0 = (k / 64) * Math.PI * 2;
      const a1 = ((k + 1) / 64) * Math.PI * 2;
      ringSeg.push(Math.cos(a0), Math.sin(a0), z, Math.cos(a1), Math.sin(a1), z);
      ringId.push(id, id);
    }
    if (id >= CHANGES.length) {
      for (let t = 0; t < 12; t += 1) {
        ringSeg.push(Math.cos(t * 0.52) * 0.85, Math.sin(t * 0.52) * 0.85, z, Math.cos(t * 0.52), Math.sin(t * 0.52), z);
        ringId.push(id, id);
      }
    }
  });
  const ringAmt = new Float32Array(CHANGES.length + TICKS.length);
  const rings = glowLines(geometry({ position: { array: new Float32Array(ringSeg), size: 3 }, aRing: { array: new Float32Array(ringId), size: 1 } }), COLORS.evidence.clone(), {
    uniforms: { uAmt: { value: ringAmt } },
    vertex: /* glsl */ `
      attribute float aRing;
      uniform float uAmt[${CHANGES.length + TICKS.length}];
      varying float vA;
      void main() {
        int i = int(aRing + 0.5);
        float a = 0.0;
        for (int k = 0; k < ${CHANGES.length + TICKS.length}; k++) if (k == i) a = uAmt[k];
        float grow = aRing < ${CHANGES.length}.0 ? mix(0.3, ${RADIUS.toFixed(1)}, a) : ${(RADIUS * 0.93).toFixed(2)};
        vA = aRing < ${CHANGES.length}.0 ? (1.0 - a) * step(0.001, a) * 1.6 : a;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * grow, position.z, 1.0);
      }`,
  });
  group.add(rings.lines);

  const pose = (p: number, wide: boolean, out: Pose) => {
    const q = storyOf(p, ctx.result);
    const z = camZ(q);
    const speed = Math.sin(Math.PI * clamp01(q));
    setPose(out, [Math.sin(q * 9) * 0.15, Math.cos(q * 7) * 0.12, z], [0, 0, z - 10], mix(wide ? 50 : 62, wide ? 68 : 78, speed));
  };

  return {
    group,
    shape: (count) => {
      const out = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const a = r() * Math.PI * 2;
        out.set([Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 2 - r() * 10], i * 3);
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const z = camZ(q);
      const speed = Math.sin(Math.PI * clamp01(q));
      wall.material.uniforms.uCamZ!.value = z;
      streaks.material.uniforms.uCamZ!.value = z;
      streaks.material.uniforms.uSpeed!.value = speed;
      bit.lines.position.set(0, 0, z - 3.4);
      bit.lines.rotation.z = -input.time * (2 + 10 * speed);
      // A ring fires as each change of rock is passed; then the four ticks of the AI-tool years.
      let step = -1;
      CHANGES.forEach((cz, k) => {
        const passed = z - 3.4 < cz;
        if (passed) step = k;
        ringAmt[k] = passed ? clamp01((cz - (z - 3.4)) / 6) : 0;
      });
      TICKS.forEach((tz, k) => {
        ringAmt[CHANGES.length + k] = clamp01(1 - Math.abs(tz - (z - 4)) / 5) * 0.9;
      });
      input.attr('data-step', step >= 0 ? String(Math.min(3, step)) : null);
      input.flag('data-seq', step >= 0 && input.p < 0.9);
      for (const m of [wall.material, streaks.material, bit.material, rings.material]) {
        m.uniforms.uTime!.value = input.time;
        m.uniforms.uFade!.value = input.fade;
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
    },
    dispose() {
      disposeGroup(group);
    },
  };
}
