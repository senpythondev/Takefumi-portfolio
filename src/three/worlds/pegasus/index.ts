/**
 * Act 3-3 — the site migration (流, STORYBOARD v2.1 §4): a river of 214 motes.
 *
 * An old, low town on the left and a new town on the right, both drawn as lit windows. 214 motes
 * (the posts whose URLs were kept and redirected) leave the old windows on four tangled orbits (the
 * four irregular URL patterns), untangle into one river (the 301 redirects) and settle, one by one,
 * into 214 windows of the new town — every one of them lit by the end. Above: 24 small squares of
 * light (plugins) merge into 18; six thin lines (ad conversions) stay unbroken throughout.
 * The pointer bends the river a little; every mote still arrives.
 * The figures are read from the act's metrics, never typed here.
 */
import { Color, Group, Vector3 } from 'three';
import { COLORS, FLUCT_GLSL, clamp01, disposeGroup, geometry, glowLines, glowPoints, mix, motes, rng, seg, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

type Building = { x: number; z: number; w: number; h: number };

function windowsOf(b: Building, step: number): number[] {
  const out: number[] = [];
  for (let y = 0.2; y < b.h - 0.1; y += step) for (let x = -b.w / 2 + 0.12; x < b.w / 2 - 0.05; x += step) out.push(b.x + x, y, b.z + 0.01);
  return out;
}

function outline(b: Building, s: number[]) {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  s.push(x0, 0, b.z, x0, b.h, b.z, x0, b.h, b.z, x1, b.h, b.z, x1, b.h, b.z, x1, 0, b.z);
}

/** The first number in a metric's text ("214件" → 214), or a fallback. */
function figure(section: HTMLElement, id: string, fallback: number, nth = 0): number {
  const text = section.querySelector(`[data-count="${id}"] .metric-value`)?.textContent ?? '';
  const n = (text.match(/\d[\d,]*/g) ?? [])[nth];
  return n ? Number(n.replace(/,/g, '')) : fallback;
}

export default function createPegasus(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(303);
  const POSTS = figure(ctx.section, 'pegasus-posts', 214);
  const PLUGINS_FROM = figure(ctx.section, 'pegasus-plugins', 24, 0);
  const PLUGINS_TO = figure(ctx.section, 'pegasus-plugins', 18, 1);

  // ── Two towns of windows ──
  const oldTown: Building[] = [];
  for (let i = 0; i < 9; i += 1) oldTown.push({ x: -7.4 + i * 0.62 + r() * 0.1, z: -0.6 + (i % 3) * 0.45, w: 0.5 + r() * 0.25, h: 0.6 + r() * 0.9 });
  const newTown: Building[] = [];
  for (let i = 0; i < 6; i += 1) newTown.push({ x: 2.6 + i * 0.85, z: -0.4 + (i % 2) * 0.5, w: 0.7, h: 2.2 + r() * 1.6 });
  const oldWin = oldTown.flatMap((b) => windowsOf(b, 0.16));
  let newWin = newTown.flatMap((b) => windowsOf(b, 0.17));
  // Exactly POSTS target windows in the new town (every one will be lit).
  while (newWin.length / 3 < POSTS) newWin = newWin.concat(newWin.map((v, i) => (i % 3 === 2 ? v - 0.3 : v)));
  const targets = new Float32Array(POSTS * 3);
  const order = Array.from({ length: newWin.length / 3 }, (_, i) => i).sort(() => r() - 0.5).slice(0, POSTS);
  order.forEach((w, i) => targets.set([newWin[w * 3] as number, newWin[w * 3 + 1] as number, newWin[w * 3 + 2] as number], i * 3));

  const winPos = new Float32Array([...oldWin, ...Array.from(targets)]);
  const winSeed = new Float32Array(winPos.length / 3).map(() => r());
  const winKind = new Float32Array(winPos.length / 3).map((_, i) => (i < oldWin.length / 3 ? 0 : 1 + (i - oldWin.length / 3)));
  const windows = glowPoints(geometry({ position: { array: winPos, size: 3 }, seed: { array: winSeed, size: 1 }, aKind: { array: winKind, size: 1 } }), {
    size: 2.6,
    uniforms: { uLit: { value: 0 }, uOld: { value: 1 }, uWarm: { value: COLORS.warm.clone() } },
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      attribute float seed;
      attribute float aKind;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      uniform float uLit;
      uniform float uOld;
      varying float vA;
      varying float vNew;
      void main() {
        vNew = step(0.5, aKind);
        float lit = aKind < 0.5 ? uOld * 0.8 : 0.08 + 0.92 * step(aKind - 1.0, uLit - 1.0);
        vA = lit * (0.6 + 0.4 * fluct(uTime * 0.6, seed));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWarm;
      uniform float uFade;
      varying float vA;
      varying float vNew;
      void main() {
        vec2 c = abs(gl_PointCoord - 0.5);
        float a = step(max(c.x, c.y), 0.32);
        gl_FragColor = vec4(mix(uWarm * 1.2, uColor * 1.3, vNew) * a * vA * uFade, 1.0);
      }`,
  });
  group.add(windows.points);

  const outlines: number[] = [];
  for (const b of [...oldTown, ...newTown]) outline(b, outlines);
  // The ground line.
  outlines.push(-9, 0, 0.3, 9, 0, 0.3);
  const town = glowLines(geometry({ position: { array: new Float32Array(outlines), size: 3 } }), new Color(0.12, 0.13, 0.15));
  group.add(town.lines);

  // ── The 214 motes ──
  const start = new Float32Array(POSTS * 3);
  for (let i = 0; i < POSTS; i += 1) {
    const k = Math.floor(r() * (oldWin.length / 3)) * 3;
    start.set([oldWin[k] as number, oldWin[k + 1] as number, oldWin[k + 2] as number], i * 3);
  }
  const phase = new Float32Array(POSTS).map(() => r() * Math.PI * 2);
  const lane = new Float32Array(POSTS).map(() => r() - 0.5);
  const flowPos = new Float32Array(POSTS * 3);
  const flowSeed = new Float32Array(POSTS).map(() => r());
  const flow = glowPoints(geometry({ position: { array: flowPos, size: 3 }, seed: { array: flowSeed, size: 1 } }), { size: 6, color: new Color('#bfeef2') });
  group.add(flow.points);

  // ── Plugins (24 → 18 squares) and the six conversion lines ──
  const squares = new Float32Array(PLUGINS_FROM * 8 * 3);
  const squareAlpha = new Float32Array(PLUGINS_FROM * 8);
  const plugins = glowLines(geometry({ position: { array: squares, size: 3 }, alpha: { array: squareAlpha, size: 1 } }), COLORS.evidence.clone());
  group.add(plugins.lines);
  const arcs: number[] = [];
  for (let l = 0; l < 6; l += 1) {
    const h = 3.6 + l * 0.22;
    for (let k = 0; k < 40; k += 1) {
      const t0 = k / 40;
      const t1 = (k + 1) / 40;
      const at = (t: number) => [mix(-5.5, 4.6, t), mix(1.0, 2.6, t) + Math.sin(Math.PI * t) * (h - 1.5), -1.2 - l * 0.08] as const;
      arcs.push(...at(t0), ...at(t1));
    }
  }
  const conversions = glowLines(geometry({ position: { array: new Float32Array(arcs), size: 3 } }), COLORS.ok.clone(), {
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      uniform float uTime;
      varying float vA;
      void main() {
        vA = 0.25 + 0.2 * fluct(uTime * 1.5, position.z * 3.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
  });
  group.add(conversions.lines);

  const air = motes(ctx.count(500), [22, 8, 10], [0, 2, -2], COLORS.evidence.clone(), 1.1, 17);
  group.add(air.points);

  // The river: old town → new town, its middle bent a little by the pointer.
  const bend = new Vector3();
  const riverAt = (s: number, off: number, out: number[], k: number) => {
    const ax = -3.6;
    const ay = 1.1;
    const bx = 2.4;
    const by = 1.2;
    const mx = -0.6 + bend.x;
    const my = 1.9 + bend.y;
    const u = 1 - s;
    out[k] = u * u * ax + 2 * u * s * mx + s * s * bx;
    out[k + 1] = u * u * ay + 2 * u * s * my + s * s * by + off * 0.35;
    out[k + 2] = off * 0.6 + 0.4 * Math.sin(Math.PI * s);
  };
  const tmp: number[] = [0, 0, 0];

  const pose = (p: number, wide: boolean, out: Pose) => {
    const t = seg(p, 0.15, 0.85);
    setPose(out, [mix(-0.6, 0.6, t), wide ? 2.2 : 2.6, (wide ? 12.5 : 19) - t * 1.2], [0, 1.4, 0], wide ? 38 : 48);
  };

  return {
    group,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        riverAt(i / n, (r() - 0.5) * 0.8, tmp, 0);
        out.set(tmp, i * 3);
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const { time, dt } = input;
      const tx = input.pointerOn ? input.pointer.x * 0.8 : 0;
      const ty = input.pointerOn ? input.pointer.y * 0.9 : Math.sin(time * 0.4) * 0.15;
      bend.x += (tx - bend.x) * (1 - Math.exp(-dt * 3));
      bend.y += (ty - bend.y) * (1 - Math.exp(-dt * 3));

      const untangle = seg(q, 0.25, 0.55);
      let arrived = 0;
      for (let i = 0; i < POSTS; i += 1) {
        const f = i % 4; // the four URL patterns
        const ph = phase[i] as number;
        const t = time * (0.35 + f * 0.07) + ph;
        // Tangled: four orbit families around the old town.
        const ox = -5.2 + Math.sin(t * (1 + f * 0.3)) * (1.2 + f * 0.25);
        const oy = 1.5 + Math.sin(t * (1.7 - f * 0.2) + f) * (0.6 + f * 0.15);
        const oz = Math.cos(t * (1.3 + f * 0.2)) * (0.8 + f * 0.2);
        const leave = seg(q, 0.0 + (i / POSTS) * 0.08, 0.12 + (i / POSTS) * 0.08);
        const sx = mix(start[i * 3] as number, ox, leave);
        const sy = mix(start[i * 3 + 1] as number, oy, leave);
        const sz = mix(start[i * 3 + 2] as number, oz, leave);
        // One river: each mote flows along it.
        const s = (i / POSTS + time * 0.05) % 1;
        riverAt(s, (lane[i] as number) * (1 - untangle * 0.7), tmp, 0);
        const rx = mix(sx, tmp[0] as number, untangle);
        const ry = mix(sy, tmp[1] as number, untangle);
        const rz = mix(sz, tmp[2] as number, untangle);
        // One by one into the new town's windows.
        const land = seg(q, 0.55 + (i / POSTS) * 0.3, 0.6 + (i / POSTS) * 0.3);
        if (land >= 1) arrived += 1;
        flowPos[i * 3] = mix(rx, targets[i * 3] as number, land);
        flowPos[i * 3 + 1] = mix(ry, targets[i * 3 + 1] as number, land);
        flowPos[i * 3 + 2] = mix(rz, (targets[i * 3 + 2] as number) + 0.02, land);
      }
      flow.points.geometry.getAttribute('position').needsUpdate = true;
      windows.material.uniforms.uLit!.value = arrived + 0.5;
      windows.material.uniforms.uOld!.value = 1 - seg(q, 0.05, 0.5) * 0.85;

      // Plugins: 24 squares over the old town travel to the new town; six of them merge away.
      const merge = seg(q, 0.15, 0.6);
      for (let i = 0; i < PLUGINS_FROM; i += 1) {
        const merged = i >= PLUGINS_TO;
        const keep = merged ? i % PLUGINS_TO : i;
        const fromX = -7.8 + (i % 12) * 0.42;
        const fromY = 3.0 + Math.floor(i / 12) * 0.42;
        const toX = 2.4 + (keep % 9) * 0.5;
        const toY = 4.0 + Math.floor(keep / 9) * 0.5;
        const x = mix(fromX, toX, merge);
        const y = mix(fromY, toY, merge);
        const h = 0.13;
        const a = merged ? 1 - seg(merge, 0.7, 1.0) : 1;
        const c = [x - h, y - h, x + h, y - h, x + h, y - h, x + h, y + h, x + h, y + h, x - h, y + h, x - h, y + h, x - h, y - h];
        for (let v = 0; v < 8; v += 1) {
          squares[(i * 8 + v) * 3] = c[v * 2] as number;
          squares[(i * 8 + v) * 3 + 1] = c[v * 2 + 1] as number;
          squares[(i * 8 + v) * 3 + 2] = -0.8;
          squareAlpha[i * 8 + v] = a * 0.8;
        }
      }
      plugins.lines.geometry.getAttribute('position').needsUpdate = true;
      plugins.lines.geometry.getAttribute('alpha').needsUpdate = true;

      for (const m of [windows.material, flow.material, plugins.material, town.material, conversions.material, air.material]) {
        m.uniforms.uTime!.value = time;
        m.uniforms.uFade!.value = input.fade;
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
      plugins.material.uniforms.uFade!.value = input.fade * seg(q, 0.05, 0.15) * (1 - 0.3 * clamp01(q - 0.9));
    },
    dispose() {
      disposeGroup(group);
    },
  };
}
