/**
 * Act 7 — the finale (次, STORYBOARD v2.1 §4; look: docs/concept/core-lab.png).
 *
 * The director brings the bands back together and lays the core on a dark archive table; this
 * world adds the table, the ruler along its edge and a soft light from above, and — kintsugi, the
 * second of its two places (§8.4) — the seams between the bands glowing as thin gold lines: the
 * core was taken apart and put back together, and the mending is shown, not hidden. The holograms
 * above the bands and the empty band that opens like a drawer are the director's (run.ts).
 */
import { Color, Group, Quaternion, Vector3, type Matrix4 } from 'three';
import { kintsugi } from '@/styles/tokens';

// The core's proportions (src/three/director/shots.ts), repeated here so this chunk stays apart.
const BANDS = 11;
const CORE_RADIUS = BANDS / 12;
import { disposeGroup, geometry, glowLines, glowMesh, mix, motes, seg, setPose, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

export default function createFinale(ctx: WorldContext): World {
  const group = new Group();

  // ── The gold seams, in the core's own frame (they follow it exactly) ──
  const seams = new Group();
  seams.matrixAutoUpdate = false;
  const seg2: number[] = [];
  const along: number[] = [];
  for (let j = 0; j < BANDS - 1; j += 1) {
    const y = (BANDS - 1) / 2 - j - 0.5;
    for (let k = 0; k < 64; k += 1) {
      const a0 = (k / 64) * Math.PI * 2;
      const a1 = ((k + 1) / 64) * Math.PI * 2;
      // A mended seam is never a perfect circle: it wanders a little.
      const w = (a: number) => 0.035 * Math.sin(a * 3 + j * 1.7) + 0.02 * Math.sin(a * 7 + j);
      const rr = CORE_RADIUS * 1.004;
      seg2.push(Math.cos(a0) * rr, y + w(a0), Math.sin(a0) * rr, Math.cos(a1) * rr, y + w(a1), Math.sin(a1) * rr);
      along.push(k / 64, (k + 1) / 64);
    }
  }
  const gold = glowLines(geometry({ position: { array: new Float32Array(seg2), size: 3 }, aAlong: { array: new Float32Array(along), size: 1 } }), new Color(kintsugi), {
    uniforms: { uDraw: { value: 0 } },
    vertex: /* glsl */ `
      attribute float aAlong;
      uniform float uDraw;
      varying float vA;
      void main() {
        vA = smoothstep(uDraw, uDraw - 0.05, aAlong);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vA;
      void main() { gl_FragColor = vec4(uColor * 1.7 * vA * uFade, 1.0); }`,
  });
  seams.add(gold.lines);
  group.add(seams);

  // ── The archive table: a dark surface, the ruler along its edge, light from above ──
  const table = new Group();
  const ruler: number[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const x = -6 + i * 0.1;
    const h = i % 10 === 0 ? 0.16 : i % 5 === 0 ? 0.1 : 0.05;
    ruler.push(x, 0.002, 1.6, x, 0.002, 1.6 - h);
  }
  ruler.push(-6, 0.002, 1.6, 6, 0.002, 1.6);
  const rulerLines = glowLines(geometry({ position: { array: new Float32Array(ruler), size: 3 } }), new Color('#a89a86'));
  table.add(rulerLines.lines);
  const top = glowMesh(
    (() => {
      const g = geometry({ position: { array: new Float32Array([-9, 0, 2.2, 9, 0, 2.2, 9, 0, -4, -9, 0, -4]), size: 3 }, aUv: { array: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), size: 2 } });
      g.setIndex([0, 1, 2, 0, 2, 3]);
      return g;
    })(),
    {
      color: new Color('#3a332c'),
      vertex: /* glsl */ `
        attribute vec2 aUv;
        varying vec2 vUv;
        void main() { vUv = aUv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragment: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          // A pool of light from above on the dark table (core-lab.png).
          float pool = exp(-pow((vUv.x - 0.5) * 3.2, 2.0) - pow((vUv.y - 0.42) * 2.6, 2.0));
          float edge = smoothstep(0.0, 0.03, vUv.y);
          gl_FragColor = vec4(uColor * (0.15 + 0.6 * pool) * edge * uFade, 1.0);
        }`,
    },
  );
  table.add(top.mesh);
  group.add(table);

  const air = motes(ctx.count(400), [12, 5, 6], [0, 1.5, 0], new Color('#e8dcc8'), 1.0, 43);
  group.add(air.points);

  const pos = new Vector3();
  const scale = new Vector3();
  const rot = new Quaternion();

  const pose = (p: number, wide: boolean, out: Pose) => {
    const t = seg(p, 0.12, 0.5);
    // A low three-quarter view along the table (core-lab.png).
    setPose(out, [mix(0, -2.6, t), mix(0, 2.0, t), mix(10, wide ? 8.6 : 15, t)], [0, mix(0, -0.35, t), 0], mix(30, wide ? 32 : 44, t));
  };

  return {
    group,
    shape: (n) => new Float32Array(n * 3),
    pose,
    update(input: WorldInput & { core?: Matrix4; drawer?: number }) {
      if (input.core) {
        seams.matrix.copy(input.core);
        seams.matrixWorldNeedsUpdate = true;
        // The table sits just under the core, wherever the core is framed.
        input.core.decompose(pos, rot, scale);
        table.position.set(pos.x, pos.y - CORE_RADIUS * scale.y * 1.08, pos.z);
      }
      const t = seg(input.p, 0.35, 0.65, (x) => x);
      gold.material.uniforms.uDraw!.value = t * 1.08;
      gold.material.uniforms.uFade!.value = input.fade;
      for (const m of [rulerLines.material, top.material, air.material]) {
        m.uniforms.uTime!.value = input.time;
        m.uniforms.uFade!.value = input.fade * seg(input.p, 0.15, 0.45);
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
    },
    dispose() {
      disposeGroup(group);
    },
  };
}
