/**
 * Act 3-5 — the live auction (冷, STORYBOARD v2.1 §4; machine room after the owner's Active Theory
 * captures): eight pillars of light, one per CPU core, in a dark room with hanging cables, fog and a
 * reflective floor.
 *
 * - Problem: bids flood in as streaks with trails; the pillars heat from cool cyan to red-orange;
 *   error shards fly from the hottest.
 * - The visitor's 「同時入札者数」 slider changes the heat; 「サーバーを闇雲に増やす」 cannot be pressed and
 *   falls away (HTML).
 * - Investigation: a monitoring line sweeps across the screen; the cause (a momentary CPU
 *   saturation) converges to one point.
 * - Result: the pillars cool. The numbers are the act's metrics (HTML).
 */
import { Color, Group, Vector3 } from 'three';
import { COLORS, FLUCT_GLSL, clamp01, disposeGroup, geometry, glowLines, glowMesh, glowPoints, mix, motes, rng, seg, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const N = 8;
const XS = Array.from({ length: N }, (_, i) => -3.5 + i);
const TOP = 3.6;

export default function createAuction(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(505);
  const heat = new Float32Array(N);
  const bias = Array.from({ length: N }, () => 0.75 + r() * 0.5);

  // ── The pillars: soft vertical beams (camera-facing strips), and their reflection in the floor ──
  const quad = (pos: number[], idx: number[], uv: number[], pid: number[], x: number, i: number, mirror: boolean) => {
    const base = pos.length / 3;
    const w = 0.42;
    const y0 = 0;
    const y1 = mirror ? -TOP * 0.6 : TOP;
    pos.push(x - w, y0, 0, x + w, y0, 0, x + w, y1, 0, x - w, y1, 0);
    uv.push(-1, 0, 1, 0, 1, 1, -1, 1);
    pid.push(i, i, i, i);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const beams = (mirror: boolean) => {
    const pos: number[] = [];
    const idx: number[] = [];
    const uv: number[] = [];
    const pid: number[] = [];
    XS.forEach((x, i) => quad(pos, idx, uv, pid, x, i, mirror));
    const g = geometry({ position: { array: new Float32Array(pos), size: 3 }, aUv: { array: new Float32Array(uv), size: 2 }, aPillar: { array: new Float32Array(pid), size: 1 } });
    g.setIndex(idx);
    return g;
  };
  const beamMaterialOpts = (mirror: boolean) => ({
    uniforms: { uHeat: { value: heat }, uHot: { value: COLORS.crisis.clone() }, uMirror: { value: mirror ? 0.28 : 1 } },
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      attribute vec2 aUv;
      attribute float aPillar;
      uniform float uHeat[${N}];
      uniform float uTime;
      varying vec2 vUv;
      varying float vHeat;
      varying float vFlick;
      void main() {
        vUv = aUv;
        int i = int(aPillar + 0.5);
        float h = 0.0;
        for (int k = 0; k < ${N}; k++) if (k == i) h = uHeat[k];
        vHeat = h;
        vFlick = 0.8 + 0.2 * fluct(uTime * (1.0 + 3.0 * h), aPillar * 0.13);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uHot;
      uniform float uFade;
      uniform float uMirror;
      varying vec2 vUv;
      varying float vHeat;
      varying float vFlick;
      void main() {
        float core = exp(-pow(vUv.x * 5.0, 2.0));
        float halo = exp(-pow(vUv.x * 1.8, 2.0)) * 0.35;
        float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y) * (1.0 - uMirror));
        if (uMirror < 0.5) along = (1.0 - vUv.y) * (1.0 - vUv.y);
        vec3 col = mix(uColor, uHot * 1.4, vHeat) * (core * (1.0 + vHeat) + halo) + vec3(1.0, 0.9, 0.8) * core * vHeat * 0.6;
        gl_FragColor = vec4(col * along * vFlick * uFade * uMirror, 1.0);
      }`,
  });
  const pillars = glowMesh(beams(false), beamMaterialOpts(false));
  const reflection = glowMesh(beams(true), beamMaterialOpts(true));
  group.add(pillars.mesh, reflection.mesh);

  // ── The room: hanging cables, a floor grid ──
  const room: number[] = [];
  for (let c = 0; c < 18; c += 1) {
    const x0 = -6 + r() * 12;
    const x1 = x0 + (r() - 0.5) * 3;
    const z = -1.5 - r() * 3;
    const sag = 0.6 + r() * 1.6;
    for (let k = 0; k < 16; k += 1) {
      const t0 = k / 16;
      const t1 = (k + 1) / 16;
      const y = (t: number) => 5 - sag * 4 * t * (1 - t);
      room.push(mix(x0, x1, t0), y(t0), z, mix(x0, x1, t1), y(t1), z);
    }
  }
  for (let k = -8; k <= 8; k += 1) room.push(k * 0.8, -0.001, 2.5, k * 0.8, -0.001, -5, -6.5, -0.001, k * 0.45 - 1.2, 6.5, -0.001, k * 0.45 - 1.2);
  const roomLines = glowLines(geometry({ position: { array: new Float32Array(room), size: 3 } }), new Color(0.16, 0.19, 0.21));
  group.add(roomLines.lines);

  // ── Bids: streaks with trails flying at the pillars ──
  const B = ctx.count(900);
  const bStart = new Float32Array(B * 2 * 3);
  const bTarget = new Float32Array(B * 2 * 3);
  const bSeed = new Float32Array(B * 2);
  const bEnd = new Float32Array(B * 2);
  for (let i = 0; i < B; i += 1) {
    const sx = (r() - 0.5) * 18;
    const sy = 0.5 + r() * 5;
    const sz = -14 - r() * 8;
    const p = Math.floor(r() * N);
    for (let e = 0; e < 2; e += 1) {
      bStart.set([sx, sy, sz], (i * 2 + e) * 3);
      bTarget.set([XS[p] as number, 0.3 + r() * (TOP - 0.6), 0], (i * 2 + e) * 3);
      bSeed[i * 2 + e] = i / B;
      bEnd[i * 2 + e] = e;
    }
  }
  const bids = glowLines(
    geometry({ position: { array: bStart, size: 3 }, aTarget: { array: bTarget, size: 3 }, aSeed: { array: bSeed, size: 1 }, aEnd: { array: bEnd, size: 1 } }),
    new Color('#fff1dd'),
    {
      uniforms: { uFlood: { value: 0 } },
      vertex: /* glsl */ `
        attribute vec3 aTarget;
        attribute float aSeed;
        attribute float aEnd;
        uniform float uTime;
        uniform float uFlood;
        varying float vA;
        void main() {
          float speed = 0.35 + fract(aSeed * 13.7) * 0.5;
          float t = fract(uTime * speed + aSeed * 7.13);
          float tail = t - 0.07 * (1.0 - aEnd);
          vec3 p = mix(position, aTarget, clamp(tail, 0.0, 1.0));
          vA = step(aSeed, uFlood) * aEnd * smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.85, 1.0, t)) + (1.0 - aEnd) * 0.0;
          vA += step(aSeed, uFlood) * (1.0 - aEnd) * 0.15 * smoothstep(0.0, 0.1, t);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
    },
  );
  group.add(bids.lines);

  // ── Error shards from the hottest pillars ──
  const E = ctx.count(500);
  const ePos = new Float32Array(E * 3);
  const eSeed = new Float32Array(E);
  const eDir = new Float32Array(E * 3);
  for (let i = 0; i < E; i += 1) {
    const p = i % N;
    ePos.set([XS[p] as number, TOP * (0.4 + r() * 0.6), 0], i * 3);
    eDir.set([(r() - 0.5) * 2.4, 0.6 + r() * 1.4, (r() - 0.2) * 1.8], i * 3);
    eSeed[i] = r();
  }
  const shards = glowPoints(geometry({ position: { array: ePos, size: 3 }, seed: { array: eSeed, size: 1 }, aDir: { array: eDir, size: 3 } }), {
    size: 2.2,
    color: COLORS.crisis.clone(),
    uniforms: { uErr: { value: 0 } },
    vertex: /* glsl */ `
      attribute float seed;
      attribute vec3 aDir;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      uniform float uErr;
      varying float vA;
      void main() {
        float t = fract(uTime * (0.5 + seed * 0.5) + seed);
        vec3 p = position + aDir * t * 1.6 + vec3(0.0, -2.5 * t * t, 0.0);
        vA = step(seed, uErr) * (1.0 - t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.6 + seed) * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
  });
  group.add(shards.points);

  // ── The monitoring line (one sample every 2 s, compressed) and the cause it finds ──
  const G = 160;
  const graph: number[] = [];
  const gx = (i: number) => -4.6 + (i / G) * 9.2;
  const gy = (i: number) => {
    const t = i / G;
    return 4.15 + 0.12 * Math.sin(t * 31) + 0.06 * Math.sin(t * 97) + 0.55 * Math.exp(-Math.pow((t - 0.63) * 70, 2));
  };
  const gAlong: number[] = [];
  for (let i = 0; i < G; i += 1) {
    graph.push(gx(i), gy(i), 0.6, gx(i + 1), gy(i + 1), 0.6);
    gAlong.push(i / G, (i + 1) / G);
  }
  const monitor = glowLines(geometry({ position: { array: new Float32Array(graph), size: 3 }, aAlong: { array: new Float32Array(gAlong), size: 1 } }), COLORS.evidence.clone(), {
    uniforms: { uSweep: { value: 0 } },
    vertex: /* glsl */ `
      attribute float aAlong;
      uniform float uSweep;
      varying float vA;
      void main() {
        vA = step(aAlong, uSweep) * (0.4 + 0.6 * smoothstep(uSweep - 0.08, uSweep, aAlong));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
  });
  group.add(monitor.lines);
  const C = ctx.count(260);
  const cFrom = new Float32Array(C * 3);
  for (let i = 0; i < C; i += 1) cFrom.set([(r() - 0.5) * 9, 0.5 + r() * 4, (r() - 0.5) * 3], i * 3);
  const cPos = new Float32Array(cFrom);
  const cause = glowPoints(geometry({ position: { array: cPos, size: 3 }, seed: { array: new Float32Array(C).map(() => r()), size: 1 } }), { size: 2.6, color: new Color('#fff6e8') });
  group.add(cause.points);
  const causeAt = new Vector3(gx(Math.round(0.63 * G)), gy(Math.round(0.63 * G)), 0.6);

  const air = motes(ctx.count(700), [16, 6, 10], [0, 2.4, -2], new Color('#9cc4c9'), 1.2, 29);
  group.add(air.points);

  const pose = (p: number, wide: boolean, out: Pose) => {
    const t = seg(p, 0.15, 0.85);
    const back = wide ? 0 : 6.5;
    setPose(out, [mix(-0.4, 0.4, t), mix(2.1, 1.9, t), mix(9.2, 7.6, t) + back], [0, mix(1.9, 2.2, t), 0], wide ? 40 : 54);
  };

  return {
    group,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        const p = i % N;
        out[i * 3] = (XS[p] as number) + (r() - 0.5) * 0.25;
        out[i * 3 + 1] = r() * TOP;
        out[i * 3 + 2] = (r() - 0.5) * 0.25;
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const slider = input.control('bidders');
      const bidders = typeof slider === 'number' ? slider : 0.35;
      const flood = seg(q, 0.04, 0.32) * (1 - seg(q, 0.62, 0.8));
      const cool = seg(q, 0.7, 0.92);
      for (let i = 0; i < N; i += 1) {
        const target = clamp01((flood * 0.9 * (bias[i] as number) + bidders * 0.45 * flood + bidders * 0.12) * (1 - cool));
        heat[i] = mix(heat[i] as number, target, 1 - Math.exp(-input.dt * 3));
      }
      const maxHeat = Math.max(...heat);
      bids.material.uniforms.uFlood!.value = clamp01(flood * (0.55 + 0.6 * bidders));
      shards.material.uniforms.uErr!.value = clamp01((maxHeat - 0.62) * 2.5);
      monitor.material.uniforms.uSweep!.value = seg(q, 0.42, 0.66, (x) => x);
      const conv = seg(q, 0.6, 0.72);
      for (let i = 0; i < C; i += 1) {
        cPos[i * 3] = mix(cFrom[i * 3] as number, causeAt.x, conv);
        cPos[i * 3 + 1] = mix(cFrom[i * 3 + 1] as number, causeAt.y, conv);
        cPos[i * 3 + 2] = mix(cFrom[i * 3 + 2] as number, causeAt.z, conv);
      }
      cause.points.geometry.getAttribute('position').needsUpdate = true;
      input.flag('data-fall', q > 0.5);

      for (const m of [pillars.material, reflection.material, roomLines.material, bids.material, shards.material, monitor.material, cause.material, air.material]) {
        m.uniforms.uTime!.value = input.time;
        m.uniforms.uFade!.value = input.fade;
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
      cause.material.uniforms.uFade!.value = input.fade * seg(q, 0.56, 0.62) * (1 - seg(q, 0.8, 0.9));
      monitor.material.uniforms.uFade!.value = input.fade * (1 - seg(q, 0.85, 0.95));
    },
    labels(input, put) {
      const q = storyOf(input.p, ctx.result);
      const on = (from: number, to: number) => (q >= from && q <= to ? 1 : 0);
      put('cpu', XS[4] as number, TOP * 0.93, 0, on(0, 0.99));
      put('bids', -2.5, 1.3, 0.2, on(0.08, 0.36));
      put('errors', XS[5] as number, 2.5, 0, on(0.2, 0.36) * (Math.max(...heat) > 0.5 ? 1 : 0));
      put('monitor', gx(34), gy(34), 0.6, on(0.44, 0.7));
      put('cause', causeAt.x, causeAt.y, causeAt.z, on(0.62, 0.86));
    },
    dispose() {
      disposeGroup(group);
    },
  };
}
