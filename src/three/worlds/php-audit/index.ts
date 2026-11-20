/**
 * Act 3-4 — the legacy PHP security audit (繕, STORYBOARD v2.1 §4; look: docs/concept/city.png).
 * Everything in this section is a reconstruction (the 再現 badge stays on screen); no real code,
 * log, payload or host appears anywhere.
 *
 * - A night city of ~45,000 buildings (one per file; fewer on smaller tiers), cold blue-grey, faint
 *   warm windows, fog.
 * - Investigation: a waveform of response sizes runs along the horizon; the threshold slider (or the
 *   scroll alone) makes one small deviation light up, and the camera dives toward it.
 * - The attack path: the planted files glow like embers, and red cracks run along the streets —
 *   the only warm colour in the city.
 * - Kintsugi (§8.4, the first of its two places): a dome of light covers the infected buildings
 *   (neutralised, existing files untouched); the cracks turn gold from their ends inward and seal;
 *   a mock SHA-256 string crystallises above them (evidence preserved).
 */
import { Color, Group, Vector3 } from 'three';
import { kintsugi } from '@/styles/tokens';
import { CityField } from '../../city/CityField';
import { COLORS, clamp01, disposeGroup, geometry, glowLines, glowPoints, mix, motes, rng, seg, setPose, storyOf, textPoints, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const INFECTED = 99; // a district a little off the centre of the 15 × 15 grid

/** Wait for an idle moment (the city's matrices are written in one go there, not during a frame). */
const idle = () =>
  new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 50);
  });

export default function createPhpAudit(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(404);
  const count = ctx.tier === 'high' ? 45000 : ctx.tier === 'medium' ? 24000 : 12000;
  let city: CityField | null = null;
  let S = 258;
  const centre = new Vector3(20, 0, -10);

  // Everything else is built once the city exists (its size sets the scale of the scene).
  const parts: { update: (q: number, input: WorldInput) => void }[] = [];
  let disposed = false;
  const ready = idle().then(() => {
    if (disposed) return;
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const u = r();
      // Mostly low old buildings, a few towers (an organic, grown city).
      heights[i] = u < 0.92 ? 0.35 + r() * 1.1 : 1.8 + r() * r() * 7;
    }
    city = new CityField({ heights, districtsPerSide: 15, lodDistance: 70, seed: 45000 });
    group.add(city.group);
    S = city.size;
    const c = city.districts[Math.min(INFECTED, city.districts.length - 1)]?.center;
    if (c) centre.copy(c);
    city.setPulse(Math.min(INFECTED, city.districts.length - 1), 7);
    build();
  });

  function build() {
    const pitch = S / 15;
    // ── The waveform of response sizes on the horizon, with its one small deviation ──
    const N = 220;
    const wave: number[] = [];
    const level = (i: number) => {
      const x = i / N;
      const base = 0.25 + 0.08 * Math.sin(x * 37) + 0.06 * Math.sin(x * 91 + 1) + 0.04 * Math.sin(x * 211);
      return base + 0.32 * Math.exp(-Math.pow((x - 0.68) * 90, 2));
    };
    const W = S * 1.3;
    const Z = -S * 0.62;
    const Y = S * 0.05;
    const H = S * 0.06;
    for (let i = 0; i < N; i += 1) wave.push(-W / 2 + (i / N) * W, Y + level(i) * H, Z, -W / 2 + ((i + 1) / N) * W, Y + level(i + 1) * H, Z);
    const waveLines = glowLines(geometry({ position: { array: new Float32Array(wave), size: 3 } }), COLORS.evidence.clone());
    group.add(waveLines.lines);
    const thrPos = new Float32Array([-W / 2, Y, Z, W / 2, Y, Z]);
    const threshold = glowLines(geometry({ position: { array: thrPos, size: 3 } }), COLORS.ink.clone());
    group.add(threshold.lines);
    const spikeX = -W / 2 + 0.68 * W;
    const spike = glowPoints(geometry({ position: { array: new Float32Array([spikeX, Y + level(0.68 * N) * H, Z]), size: 3 }, seed: { array: new Float32Array([0.5]), size: 1 } }), {
      size: S * 0.12,
      color: COLORS.ink.clone(),
    });
    group.add(spike.points);

    // ── Red cracks along the streets, from the infected district outward ──
    const segs: number[] = [];
    const along: number[] = [];
    const STEPS = 11;
    for (let k = 0; k < 7; k += 1) {
      let x = centre.x + (r() - 0.5) * pitch * 0.4;
      let z = centre.z + (r() - 0.5) * pitch * 0.4;
      let dir = Math.floor(r() * 4);
      for (let s = 0; s < STEPS; s += 1) {
        if (r() < 0.35) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
        const len = pitch * (0.25 + r() * 0.3);
        const nx = x + [len, 0, -len, 0][dir]! + (r() - 0.5) * pitch * 0.06;
        const nz = z + [0, len, 0, -len][dir]! + (r() - 0.5) * pitch * 0.06;
        segs.push(x, 0.06, z, nx, 0.06, nz);
        along.push(s / STEPS, (s + 1) / STEPS);
        x = nx;
        z = nz;
      }
    }
    const cracks = glowLines(geometry({ position: { array: new Float32Array(segs), size: 3 }, aAlong: { array: new Float32Array(along), size: 1 } }), COLORS.crisis.clone(), {
      uniforms: { uReveal: { value: 0 }, uSeal: { value: 0 }, uGold: { value: new Color(kintsugi) } },
      vertex: /* glsl */ `
        attribute float aAlong;
        uniform float uReveal;
        varying float vAlong;
        varying float vShow;
        void main() {
          vAlong = aAlong;
          vShow = smoothstep(uReveal * 1.05, uReveal * 1.05 - 0.04, aAlong);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragment: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uGold;
        uniform float uSeal;
        uniform float uFade;
        uniform float uTime;
        varying float vAlong;
        varying float vShow;
        void main() {
          // The gold runs from the tips inward (kintsugi): sealed where vAlong > 1 - uSeal.
          float gold = smoothstep(1.0 - uSeal + 0.03, 1.0 - uSeal - 0.03, 1.0 - vAlong);
          float ember = 0.75 + 0.25 * sin(uTime * 3.0 + vAlong * 20.0);
          vec3 col = mix(uColor * 1.8 * ember, uGold * 1.6, gold);
          gl_FragColor = vec4(col * vShow * uFade, 1.0);
        }`,
    });
    group.add(cracks.lines);
    // The same cracks as glowing points, so they read at a distance (lines are one pixel wide).
    const crackPoints = glowPoints(geometry({ position: { array: new Float32Array(segs), size: 3 }, seed: { array: new Float32Array(segs.length / 3).map(() => r()), size: 1 }, aAlong: { array: new Float32Array(along), size: 1 } }), {
      size: pitch * 0.05,
      uniforms: { uReveal: { value: 0 }, uSeal: { value: 0 }, uGold: { value: new Color(kintsugi) }, uCrisis: { value: COLORS.crisis.clone() } },
      vertex: /* glsl */ `
        attribute float seed;
        attribute float aAlong;
        uniform float uPx;
        uniform float uSize;
        uniform float uReveal;
        varying float vAlong;
        varying float vShow;
        void main() {
          vAlong = aAlong;
          vShow = smoothstep(uReveal * 1.05, uReveal * 1.05 - 0.04, aAlong);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (0.7 + 0.6 * seed) * uPx * (10.0 / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uCrisis;
        uniform vec3 uGold;
        uniform float uSeal;
        uniform float uFade;
        varying float vAlong;
        varying float vShow;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          float gold = smoothstep(1.0 - uSeal + 0.03, 1.0 - uSeal - 0.03, 1.0 - vAlong);
          gl_FragColor = vec4(mix(uCrisis * 1.4, uGold * 1.5, gold) * a * vShow * uFade, 1.0);
        }`,
    });
    group.add(crackPoints.points);

    // ── The dome of light over the infected buildings ──
    const dome: number[] = [];
    const R = pitch * 0.75;
    for (let lat = 1; lat <= 5; lat += 1) {
      const y = (lat / 6) * R;
      const rr = Math.sqrt(R * R - y * y);
      for (let i = 0; i < 48; i += 1) {
        const a0 = (i / 48) * Math.PI * 2;
        const a1 = ((i + 1) / 48) * Math.PI * 2;
        dome.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
      }
    }
    for (let m = 0; m < 16; m += 1) {
      const a = (m / 16) * Math.PI * 2;
      for (let i = 0; i < 12; i += 1) {
        const b0 = (i / 12) * (Math.PI / 2);
        const b1 = ((i + 1) / 12) * (Math.PI / 2);
        dome.push(Math.cos(a) * Math.cos(b0) * R, Math.sin(b0) * R, Math.sin(a) * Math.cos(b0) * R, Math.cos(a) * Math.cos(b1) * R, Math.sin(b1) * R, Math.sin(a) * Math.cos(b1) * R);
      }
    }
    const domeLines = glowLines(geometry({ position: { array: new Float32Array(dome), size: 3 } }), new Color('#dfeff0'));
    domeLines.lines.position.copy(centre);
    group.add(domeLines.lines);

    // ── The evidence: a mock SHA-256 string crystallises (reconstruction, not a real hash) ──
    const hex = '0123456789abcdef';
    let mock = 'sha256 ';
    for (let i = 0; i < 16; i += 1) mock += hex[Math.floor(r() * 16)];
    mock += '…';
    const hn = ctx.count(2400);
    const hashTo = textPoints(mock, hn, pitch * 0.09, '500 120px ui-monospace, monospace', 21);
    const hashFrom = new Float32Array(hn * 3).map((v, i) => (hashTo[i] as number) + (r() - 0.5) * pitch * (i % 3 === 1 ? 0.5 : 1.2));
    const hashPos = new Float32Array(hashFrom);
    const hash = glowPoints(geometry({ position: { array: hashPos, size: 3 }, seed: { array: new Float32Array(hn).map(() => r()), size: 1 } }), { size: 1.4, color: new Color('#eaf6f6') });
    hash.points.position.set(centre.x, R * 1.25, centre.z);
    group.add(hash.points);

    const air = motes(ctx.count(700), [S, S * 0.15, S], [0, S * 0.05, 0], new Color('#9fb0c0'), S * 0.02, 23);
    group.add(air.points);

    parts.push({
      update(q, input) {
        const fade = input.fade;
        if (city) {
          (city.material.uniforms.uFade as { value: number }).value = fade;
          city.update(input.camera, input.time);
        }
        const thr = input.control('threshold');
        const t = typeof thr === 'number' ? thr : 0.18;
        const thrY = Y + mix(0.2, 0.7, t) * H;
        thrPos[1] = thrY;
        thrPos[4] = thrY;
        threshold.lines.geometry.getAttribute('position').needsUpdate = true;
        // The deviation lights when the threshold meets it, or as the story moves on.
        const spikeY = Y + 0.57 * H;
        const found = Math.max(clamp01(1 - Math.abs(thrY - spikeY) / (0.06 * H)), seg(q, 0.22, 0.3));
        input.flag('data-found', found > 0.6);
        for (const m of [waveLines.material, threshold.material]) m.uniforms.uFade!.value = fade * (1 - seg(q, 0.42, 0.55)) * (m === threshold.material ? 0.4 : 0.8);
        spike.material.uniforms.uFade!.value = fade * found * (1 - seg(q, 0.45, 0.55));
        cracks.material.uniforms.uReveal!.value = seg(q, 0.42, 0.6, (x) => x);
        cracks.material.uniforms.uSeal!.value = seg(q, 0.7, 0.92, (x) => x);
        cracks.material.uniforms.uFade!.value = fade;
        crackPoints.material.uniforms.uReveal!.value = cracks.material.uniforms.uReveal!.value;
        crackPoints.material.uniforms.uSeal!.value = cracks.material.uniforms.uSeal!.value;
        crackPoints.material.uniforms.uFade!.value = fade;
        crackPoints.material.uniforms.uPx!.value = input.px;
        const d = seg(q, 0.62, 0.72);
        domeLines.lines.scale.setScalar(0.001 + d);
        domeLines.material.uniforms.uFade!.value = fade * d * (0.35 + 0.15 * Math.sin(input.time * 1.3));
        const crys = seg(q, 0.8, 0.98);
        for (let i = 0; i < hashPos.length; i += 1) hashPos[i] = mix(hashFrom[i] as number, hashTo[i] as number, crys);
        hash.points.geometry.getAttribute('position').needsUpdate = true;
        hash.material.uniforms.uFade!.value = fade * seg(q, 0.78, 0.86);
        for (const m of [waveLines.material, spike.material, hash.material, air.material, cracks.material]) {
          m.uniforms.uTime!.value = input.time;
          if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
        }
        air.material.uniforms.uFade!.value = fade * 0.6;
      },
    });
  }

  const pose = (p: number, wide: boolean, out: Pose) => {
    const q = storyOf(p, ctx.result);
    const back = wide ? 1 : 1.45;
    const over: [number, number, number] = [-S * 0.05, S * 0.36 * back, S * 0.56 * back];
    const overLook: [number, number, number] = [0, 0, -S * 0.12];
    const dive: [number, number, number] = [centre.x + S * 0.08, S * 0.09 * back, centre.z + S * 0.15 * back];
    const mend: [number, number, number] = [centre.x + S * 0.11, S * 0.13 * back, centre.z + S * 0.2 * back];
    const k1 = seg(q, 0.3, 0.5);
    const k2 = seg(q, 0.6, 0.9);
    const pos: [number, number, number] = [0, 0, 0];
    const look: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i += 1) {
      pos[i] = mix(mix(over[i] as number, dive[i] as number, k1), mend[i] as number, k2);
      look[i] = mix(overLook[i] as number, i === 1 ? S * 0.01 : (centre.getComponent(i) as number), k1);
    }
    setPose(out, pos, look, wide ? 42 : 55);
  };

  return {
    group,
    ready,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        out[i * 3] = (r() - 0.5) * S * 0.8;
        out[i * 3 + 1] = r() * r() * 3;
        out[i * 3 + 2] = (r() - 0.5) * S * 0.8;
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      for (const part of parts) part.update(q, input);
    },
    labels(input, put) {
      const q = storyOf(input.p, ctx.result);
      const on = (from: number, to: number) => (q >= from && q <= to ? 1 : 0);
      const pitch = S / 15;
      const R = pitch * 0.75;
      // The same places as in build(): the waveform on the horizon, its deviation, the infected district.
      const W = S * 1.3;
      const Z = -S * 0.62;
      const Y = S * 0.05;
      const H = S * 0.06;
      put('files', -S * 0.16, S * 0.012, S * 0.12, on(0, 0.2));
      put('wave', -W * 0.16, Y + 0.3 * H, Z, on(0.06, 0.4));
      put('spike', -W / 2 + 0.68 * W, Y + 0.57 * H, Z, on(0.22, 0.42));
      put('tainted', centre.x, R * 0.25, centre.z, on(0.36, 0.6));
      put('path', centre.x + pitch * 0.55, 0.1, centre.z + pitch * 0.35, on(0.48, 0.68));
      put('dome', centre.x - R * 0.7, R * 0.72, centre.z, on(0.66, 0.84));
      put('hash', centre.x + pitch * 0.5, R * 1.25, centre.z, on(0.88, 1));
    },
    dispose() {
      disposed = true;
      if (city) {
        group.remove(city.group);
        city.dispose();
      }
      disposeGroup(group);
    },
  };
}
