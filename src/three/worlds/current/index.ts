/**
 * Act 3-1 — current work (照, STORYBOARD v2.1 §4): unknown terrain lit by a scanning light.
 *
 * A dark, rolling terrain of points (a codebase seen for the first time). The visitor's pointer is
 * the scanning light (touch: it drifts and follows a drag); where it shines, a cyan network of
 * file-structure veins appears, and with the scroll the network spreads over the whole terrain.
 * Result: one mote (a change) passes a cyan scanning ring (AI review), then a warm ring (human
 * review), and the terrain lights green once. No numbers: the fact sheet has none for this work.
 */
import { Group, Vector3 } from 'three';
import { COLORS, FLUCT_GLSL, clamp01, disposeGroup, geometry, glowLines, glowPoints, mix, motes, pickPoints, rng, seg, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const SIZE_X = 18;
const SIZE_Z = 16;
const Z0 = -11;

function height(x: number, z: number): number {
  return (
    0.9 * Math.sin(x * 0.35 + 1.2) * Math.cos(z * 0.3) +
    0.45 * Math.sin(x * 0.8 + z * 0.55) +
    0.22 * Math.sin(x * 1.9 - z * 1.3 + 0.7) +
    0.1 * Math.sin(x * 4.1 + z * 3.3)
  );
}

export default function createCurrent(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(101);

  // ── Terrain of points ──
  const total = ctx.count(16000);
  const nx = Math.round(Math.sqrt(total * (SIZE_X / SIZE_Z)));
  const nz = Math.round(total / nx);
  const pos = new Float32Array(nx * nz * 3);
  const seed = new Float32Array(nx * nz);
  for (let i = 0; i < nx; i += 1)
    for (let j = 0; j < nz; j += 1) {
      const k = i * nz + j;
      const x = -SIZE_X / 2 + (i + r() * 0.6) * (SIZE_X / nx);
      const z = Z0 + (j + r() * 0.6) * (SIZE_Z / nz);
      pos[k * 3] = x;
      pos[k * 3 + 1] = height(x, z);
      pos[k * 3 + 2] = z;
      seed[k] = r();
    }
  const terrain = glowPoints(geometry({ position: { array: pos, size: 3 }, seed: { array: seed, size: 1 } }), {
    size: 1.8,
    uniforms: { uLight: { value: new Vector3(0, 0, -3) }, uRadius: { value: 3.2 }, uFlash: { value: 0 }, uOk: { value: COLORS.ok.clone() }, uWarm: { value: COLORS.warm.clone() } },
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      attribute float seed;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      uniform vec3 uLight;
      uniform float uRadius;
      varying float vLit;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = distance(position.xz, uLight.xz);
        vLit = smoothstep(uRadius, 0.0, d);
        vA = 0.5 + 0.5 * fluct(uTime * 0.9, seed);
        gl_PointSize = uSize * (0.7 + 0.6 * seed + 1.2 * vLit) * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uOk;
      uniform vec3 uWarm;
      uniform float uFade;
      uniform float uFlash;
      varying float vLit;
      varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        vec3 col = vec3(0.17, 0.19, 0.21) + mix(uWarm * 0.6, uColor, 0.35) * vLit * 1.6;
        col = mix(col, uOk * 0.9, uFlash);
        gl_FragColor = vec4(col * a * vA * uFade, 1.0);
      }`,
  });
  group.add(terrain.points);

  // ── The file-structure veins: branching paths over the terrain, revealed by light and scroll ──
  const segs: number[] = [];
  const reveal: number[] = [];
  const roots = [
    [-6, -8],
    [-2, -3],
    [3, -6],
    [6, -1],
    [0, 1.5],
  ] as const;
  type Tip = { x: number; z: number; dir: number; depth: number };
  let order = 0;
  for (const [rx, rz] of roots) {
    let tips: Tip[] = [{ x: rx, z: rz, dir: r() * Math.PI * 2, depth: 0 }];
    for (let gen = 0; gen < 26 && tips.length; gen += 1) {
      const next: Tip[] = [];
      for (const t of tips) {
        const dir = t.dir + (r() - 0.5) * 0.9;
        const len = 0.45 + r() * 0.35;
        const x2 = t.x + Math.cos(dir) * len;
        const z2 = t.z + Math.sin(dir) * len;
        if (Math.abs(x2) > SIZE_X / 2 - 0.5 || z2 < Z0 + 0.5 || z2 > Z0 + SIZE_Z - 0.5) continue;
        segs.push(t.x, height(t.x, t.z) + 0.04, t.z, x2, height(x2, z2) + 0.04, z2);
        const o = order / 2600;
        reveal.push(o, o);
        order += 1;
        next.push({ x: x2, z: z2, dir, depth: t.depth + 1 });
        if (r() < 0.22 && next.length < 40) next.push({ x: x2, z: z2, dir: dir + (r() < 0.5 ? 1 : -1) * (0.7 + r() * 0.5), depth: t.depth + 1 });
      }
      tips = next;
    }
  }
  const veinPos = new Float32Array(segs);
  const veinReveal = new Float32Array(reveal).map((v) => v * (2600 / Math.max(1, order)));
  const veins = glowLines(geometry({ position: { array: veinPos, size: 3 }, aReveal: { array: veinReveal, size: 1 } }), COLORS.evidence.clone(), {
    uniforms: { uLight: { value: new Vector3() }, uRadius: { value: 3.2 }, uSpread: { value: 0 }, uFlash: { value: 0 }, uOk: { value: COLORS.ok.clone() } },
    vertex: /* glsl */ `
      attribute float aReveal;
      uniform vec3 uLight;
      uniform float uRadius;
      uniform float uSpread;
      varying float vA;
      void main() {
        float lit = smoothstep(uRadius * 1.15, uRadius * 0.2, distance(position.xz, uLight.xz));
        float spread = smoothstep(uSpread, uSpread - 0.08, aReveal);
        vA = max(lit, spread * 0.75);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uOk;
      uniform float uFade;
      uniform float uFlash;
      varying float vA;
      void main() { gl_FragColor = vec4(mix(uColor, uOk, uFlash) * vA * uFade * 1.3, 1.0); }`,
  });
  group.add(veins.lines);

  // ── The two gates of the result, and the mote that passes them ──
  const ringSeg: number[] = [];
  const ringIdx: number[] = [];
  for (let g = 0; g < 2; g += 1) {
    const cx = g === 0 ? -2.4 : 2.4;
    for (let i = 0; i < 48; i += 1) {
      const a0 = (i / 48) * Math.PI * 2;
      const a1 = ((i + 1) / 48) * Math.PI * 2;
      ringSeg.push(cx, 1.6 + Math.sin(a0) * 0.9, -1 + Math.cos(a0) * 0.25, cx, 1.6 + Math.sin(a1) * 0.9, -1 + Math.cos(a1) * 0.25);
      ringIdx.push(g, g);
    }
  }
  const rings = glowLines(geometry({ position: { array: new Float32Array(ringSeg), size: 3 }, aGate: { array: new Float32Array(ringIdx), size: 1 } }), COLORS.evidence.clone(), {
    uniforms: { uPass: { value: new Vector3() }, uShow: { value: 0 }, uWarm: { value: COLORS.warm.clone() } },
    vertex: /* glsl */ `
      attribute float aGate;
      uniform vec3 uPass;
      uniform float uShow;
      varying float vA;
      varying float vG;
      void main() {
        vG = aGate;
        float pass = aGate < 0.5 ? uPass.x : uPass.y;
        vA = uShow * (0.35 + 1.4 * pass);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWarm;
      uniform float uFade;
      varying float vA;
      varying float vG;
      void main() { gl_FragColor = vec4(mix(uColor, uWarm, step(0.5, vG)) * vA * uFade, 1.0); }`,
  });
  group.add(rings.lines);
  const mote = glowPoints(geometry({ position: { array: new Float32Array(3), size: 3 }, seed: { array: new Float32Array([0.9]), size: 1 } }), { size: 9, color: COLORS.ink.clone() });
  group.add(mote.points);

  const air = motes(ctx.count(500), [20, 6, 16], [0, 2, -3], COLORS.evidence.clone(), 1.2, 7);
  group.add(air.points);

  // The light: follows the pointer over the terrain, or drifts by itself (touch, keyboard).
  const light = new Vector3(0, 0, -3);
  const target = new Vector3();
  const ray = new Vector3();

  const pose = (p: number, wide: boolean, out: Pose) => {
    const t = seg(p, 0.15, 0.85);
    const back = wide ? 0 : 6;
    setPose(out, [mix(-0.6, 0.6, t), mix(5.2, 3.8, t) + back * 0.4, mix(9, 6.5, t) + back], [0, mix(0, 0.5, t), mix(-3, -2, t)], wide ? 40 : 50);
  };

  return {
    group,
    shape: (n) => pickPoints(pos, n, 0.05, 3),
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const { camera, time, dt } = input;
      if (input.pointerOn) {
        ray.set(input.pointer.x, input.pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
        const t = ray.y < -0.02 ? (0.2 - camera.position.y) / ray.y : 40;
        target.copy(camera.position).addScaledVector(ray, Math.min(40, Math.max(0, t)));
      } else target.set(Math.sin(time * 0.23) * 5.5, 0, -4 + Math.sin(time * 0.31 + 1.3) * 4.5);
      light.lerp(target, 1 - Math.exp(-dt * (input.pointerOn ? 8 : 1.4)));

      const spread = seg(q, 0.05, 0.7, (x) => x) * 1.05;
      const through = seg(q, 0.62, 0.95, (x) => x);
      const flash = Math.sin(Math.PI * seg(q, 0.9, 1.0, (x) => x)) * 0.85;
      for (const m of [terrain.material, veins.material, rings.material, mote.material, air.material]) {
        m.uniforms.uFade!.value = input.fade;
        m.uniforms.uTime!.value = time;
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
      terrain.material.uniforms.uLight!.value = light;
      terrain.material.uniforms.uFlash!.value = flash;
      veins.material.uniforms.uLight!.value = light;
      veins.material.uniforms.uSpread!.value = spread;
      veins.material.uniforms.uFlash!.value = flash;
      rings.material.uniforms.uShow!.value = seg(q, 0.55, 0.65);
      const pass = rings.material.uniforms.uPass!.value as Vector3;
      pass.set(clamp01(1 - Math.abs(through - 0.3) * 8), clamp01(1 - Math.abs(through - 0.7) * 8), 0);
      const mp = mote.points.geometry.getAttribute('position');
      mp.setXYZ(0, mix(-6, 6, through), 1.6 + Math.sin(through * 9) * 0.08, -1);
      mp.needsUpdate = true;
      mote.material.uniforms.uFade!.value = input.fade * (through > 0.001 && through < 0.999 ? 1 : 0);
      input.attr('data-step', through > 0.7 ? '2' : through > 0.3 ? '1' : '0');
    },
    dispose() {
      disposeGroup(group);
    },
  };
}
