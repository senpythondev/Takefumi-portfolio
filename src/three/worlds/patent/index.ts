/**
 * Act 3-6 — the patent disclosure system (透, STORYBOARD v2.1 §4): a glass pipeline.
 *
 * One document flows through a glass pipe and lights four stations as it passes them (NDA
 * e-signature → SMS check → corporate-number check → watermarked PDF; the step names are the act's
 * HTML). At the last station the visitor may type a name: the 3D document shows that name and the
 * current time as its watermark at once. The name never leaves this page — it is drawn on a
 * canvas here and nothing is sent or stored.
 * Result: a grid of points of light fills up (the registration limit, read from the act's metric),
 * then the duration numbers (HTML).
 */
import { CanvasTexture, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { createInkLine, drawWatermark, stampOf } from '@/lib/watermark/ink';
import { COLORS, FLUCT_GLSL, disposeGroup, geometry, glowLines, glowMesh, glowPoints, mix, motes, rng, seg, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const SEGS = 140;
const RADIAL = 18;
const RADIUS = 0.62;
const STATIONS = [0.2, 0.4, 0.6, 0.8];

function curve(t: number, out: Vector3) {
  return out.set(mix(-7.5, 7.5, t), 0.55 * Math.sin(t * Math.PI * 2.2) + 0.2, 0.5 * Math.cos(t * Math.PI * 1.6) - 0.3);
}

function figure(section: HTMLElement, id: string, fallback: number): number {
  const n = (section.querySelector(`[data-count="${id}"] .metric-value`)?.textContent ?? '').match(/\d[\d,]*/)?.[0];
  return n ? Number(n.replace(/,/g, '')) : fallback;
}

export default function createPatent(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(606);
  const a = new Vector3();
  const b = new Vector3();
  const tan = new Vector3();
  const n1 = new Vector3();
  const n2 = new Vector3();
  const up = new Vector3(0, 1, 0);

  // ── The glass pipe (built by hand: a ring of vertices around the curve) ──
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const c0 = new Vector3();
  for (let i = 0; i <= SEGS; i += 1) {
    const t = i / SEGS;
    curve(t, a);
    // Central difference, clamped at the ends: the tangent never collapses to zero (a zero normal
    // made the shader's normalize() return NaN, which bloom spread over the whole frame).
    curve(Math.max(0, t - 0.001), c0);
    curve(Math.min(1, t + 0.001), b);
    tan.copy(b).sub(c0).normalize();
    n1.crossVectors(tan, up).normalize();
    n2.crossVectors(n1, tan).normalize();
    for (let j = 0; j < RADIAL; j += 1) {
      const ang = (j / RADIAL) * Math.PI * 2;
      const nx = n1.x * Math.cos(ang) + n2.x * Math.sin(ang);
      const ny = n1.y * Math.cos(ang) + n2.y * Math.sin(ang);
      const nz = n1.z * Math.cos(ang) + n2.z * Math.sin(ang);
      pos.push(a.x + nx * RADIUS, a.y + ny * RADIUS, a.z + nz * RADIUS);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < SEGS; i += 1)
    for (let j = 0; j < RADIAL; j += 1) {
      const p0 = i * RADIAL + j;
      const p1 = i * RADIAL + ((j + 1) % RADIAL);
      idx.push(p0, p0 + RADIAL, p1, p1, p0 + RADIAL, p1 + RADIAL);
    }
  const pipeGeo = geometry({ position: { array: new Float32Array(pos), size: 3 }, normal: { array: new Float32Array(nor), size: 3 } });
  pipeGeo.setIndex(idx);
  const pipe = glowMesh(pipeGeo, {
    color: new Color('#cfe9ec'),
    vertex: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal + vec3(0.0, 1e-5, 0.0));
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float caustic = 0.06 * smoothstep(0.92, 1.0, sin(vP.x * 6.0 - uTime * 0.8 + vP.y * 4.0));
        gl_FragColor = vec4(uColor * (fres * 0.55 + caustic) * uFade, 1.0);
      }`,
  });
  group.add(pipe.mesh);

  // ── The four stations: rings of light around the pipe ──
  const rings: number[] = [];
  const ringIdx: number[] = [];
  STATIONS.forEach((t, s) => {
    curve(t, a);
    curve(t + 0.001, b);
    tan.copy(b).sub(a).normalize();
    n1.crossVectors(tan, up).normalize();
    n2.crossVectors(n1, tan).normalize();
    for (let j = 0; j < 40; j += 1) {
      for (const k of [j, j + 1]) {
        const ang = (k / 40) * Math.PI * 2;
        const rr = RADIUS * 1.35;
        rings.push(a.x + (n1.x * Math.cos(ang) + n2.x * Math.sin(ang)) * rr, a.y + (n1.y * Math.cos(ang) + n2.y * Math.sin(ang)) * rr, a.z + (n1.z * Math.cos(ang) + n2.z * Math.sin(ang)) * rr);
        ringIdx.push(s);
      }
    }
  });
  const stations = glowLines(geometry({ position: { array: new Float32Array(rings), size: 3 }, aStation: { array: new Float32Array(ringIdx), size: 1 } }), COLORS.evidence.clone(), {
    uniforms: { uPassed: { value: 0 } },
    vertex: /* glsl */ `
      attribute float aStation;
      uniform float uPassed;
      varying float vA;
      void main() {
        vA = 0.25 + 1.5 * step(aStation + 0.5, uPassed);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
  });
  group.add(stations.lines);

  // ── The document: a page drawn on a canvas; the watermark is drawn on it, here, in the browser ──
  // The page is the fictional sample's first page (an image made from the PDF at build time); the
  // name forms on it a moment after each keystroke, from motes that settle like ink (§11.3).
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 724;
  const c2d = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  const pageImage = new Image();
  let pageReady = false;
  let disposed = false;
  pageImage.onload = () => {
    pageReady = true;
    dirty = true;
  };
  pageImage.src = '/media/patent/sample-page-1.webp';
  const ink = createInkLine();
  let dirty = true;
  let shownName = '';
  let shownStamp = '';
  const draw = (stamp: string) => {
    if (!c2d || disposed) return;
    const now = performance.now();
    c2d.fillStyle = '#f4f1ea';
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    if (pageReady) c2d.drawImage(pageImage, 0, 0, canvas.width, canvas.height);
    if (ink.length || !ink.settled(now)) drawWatermark(c2d, ink, now, canvas.width, canvas.height, stamp, 'rgba(20, 96, 110, 0.62)', 0.075);
    texture.needsUpdate = true;
    dirty = !ink.settled(now);
  };
  const docMaterial = new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    uniforms: { uMap: { value: texture }, uFade: { value: 0 }, uGlow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uFade;
      uniform float uGlow;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(uMap, vUv).rgb;
        float edge = smoothstep(0.0, 0.03, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        gl_FragColor = vec4(c * (0.4 + 0.22 * uGlow), uFade * edge);   // paper, not a lamp: the print must survive the bloom
      }`,
  });
  const doc = new Mesh(new PlaneGeometry(0.58, 0.82), docMaterial);
  group.add(doc);

  // ── The registration limit: a grid of points that fills up ──
  const CAP = figure(ctx.section, 'patent-capacity', 1000);
  const cols = 40;
  const gPos = new Float32Array(CAP * 3);
  const gIdx = new Float32Array(CAP);
  for (let i = 0; i < CAP; i += 1) {
    gPos.set([-5.85 + (i % cols) * 0.3, 2.6 - Math.floor(i / cols) * 0.21, -3.2], i * 3);
    gIdx[i] = i;
  }
  const grid = glowPoints(geometry({ position: { array: gPos, size: 3 }, seed: { array: gIdx.map((v) => (v * 0.618) % 1), size: 1 }, aIdx: { array: gIdx, size: 1 } }), {
    size: 1.5,
    uniforms: { uCount: { value: 0 } },
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      attribute float seed;
      attribute float aIdx;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      uniform float uCount;
      varying float vA;
      void main() {
        vA = 0.06 + 0.94 * step(aIdx, uCount) * (0.75 + 0.25 * fluct(uTime, seed));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
  });
  group.add(grid.points);

  const air = motes(ctx.count(500), [18, 7, 8], [0, 1, -1], new Color('#cfe9ec'), 1.1, 31);
  group.add(air.points);

  const docAt = (q: number) => seg(q, 0.02, 0.78, (x) => x);
  const pose = (p: number, wide: boolean, out: Pose) => {
    const q = storyOf(p, ctx.result);
    curve(docAt(q), a);
    const end = seg(q, 0.8, 1.0);
    const back = wide ? 0 : 5;
    // Portrait: the camera looks lower, so the pipe sits in the upper half and the stations and the
    // name field below it no longer cover it (final round, 2026-11-20).
    const lower = wide ? 0 : mix(2.6, 1.2, end);
    setPose(out, [mix(a.x * 0.55, 0, end), mix(0.9, 1.4, end), mix(7.4, 10.5, end) + back], [mix(a.x * 0.65, 0, end), mix(0.25, 0.6, end) - lower, mix(0, -1.2, end)], wide ? 40 : 52);
  };

  let forward = 0;
  return {
    group,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        curve(r(), a);
        const ang = r() * Math.PI * 2;
        out.set([a.x, a.y + Math.sin(ang) * RADIUS, a.z + Math.cos(ang) * RADIUS], i * 3);
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const t = docAt(q);
      curve(t, a);
      doc.position.copy(a);
      doc.lookAt(input.camera.position);
      doc.rotateZ(Math.sin(input.time * 0.6) * 0.05);
      const passed = STATIONS.filter((s) => t >= s - 0.005).length;
      stations.material.uniforms.uPassed!.value = passed;
      input.attr('data-step', String(passed));
      // The watermark: the visitor's name and the current time, drawn here only.
      const name = passed >= STATIONS.length ? String(input.control('watermark') ?? '').trim().slice(0, 40) : '';
      const stamp = stampOf(new Date());
      if (name !== shownName) {
        shownName = name;
        ink.set(name, performance.now());
        dirty = true;
      }
      if (stamp !== shownStamp) {
        shownStamp = stamp;
        dirty = true;
      }
      if (dirty) draw(stamp);
      // While a name is on it, the page is held up to the camera so the characters can be seen
      // forming; after 確認 it comes all the way forward to meet the full-page viewer.
      const viewing = ctx.section.hasAttribute('data-viewing');
      forward += ((viewing ? 1 : name ? 0.78 : 0) - forward) * (1 - Math.exp(-input.dt * 3.5));
      if (forward > 0.001) {
        doc.position.lerp(input.camera.position, 0.68 * forward);
        doc.rotation.z *= 1 - Math.min(1, forward * 2);
      }
      docMaterial.uniforms.uFade!.value = input.fade;
      docMaterial.uniforms.uGlow!.value = passed >= STATIONS.length ? 1 : 0;
      grid.material.uniforms.uCount!.value = seg(q, 0.8, 0.98, (x) => x) * CAP - 0.5;
      for (const m of [pipe.material, stations.material, grid.material, air.material]) {
        m.uniforms.uTime!.value = input.time;
        m.uniforms.uFade!.value = input.fade;
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
      grid.material.uniforms.uFade!.value = input.fade * seg(q, 0.76, 0.82);
    },
    labels(input, put) {
      const q = storyOf(input.p, ctx.result);
      const t = docAt(q);
      const keys = ['sign', 'sms', 'corp', 'pdf'];
      put('doc', doc.position.x, doc.position.y + 0.55, doc.position.z, q < 0.78 && forward < 0.2 ? 1 : 0);
      STATIONS.forEach((s, i) => {
        curve(s, b);
        // A station is named as the document reaches it, and until the next one is.
        put(keys[i] as string, b.x, b.y - RADIUS, b.z, q < 0.8 && t >= s - 0.09 && t < s + 0.2 && forward < 0.2 ? 1 : 0);
      });
      put('users', 4.6, 2.7, -3.2, q > 0.84 ? 1 : 0);
    },
    dispose() {
      disposed = true;
      pageImage.onload = null;
      texture.dispose();
      disposeGroup(group);
    },
  };
}
