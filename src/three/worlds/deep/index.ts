/**
 * Act 4 — the deep layer (積, STORYBOARD v2.1 §4): thin-section cards in a spiral.
 *
 * Eight projects, each a thin section cut from its stratum: a thick, rounded glass plate whose edge
 * breaks the light into colours, with the section glowing in the project's colour at its centre and
 * the industry, period and main technology engraved on it (read from the act's HTML cards). The
 * cards circle an upright core in a spiral (Active Theory); the one that comes to the front turns
 * to face the camera and its engraving decodes. The pointer tilts the cards; the front card's link
 * and figure are the HTML (`data-front`).
 */
import { CanvasTexture, Color, Group, Mesh, ShaderMaterial } from 'three';
import { layer as layerColor } from '@/styles/tokens';
import { FLUCT_GLSL, disposeGroup, geometry, glowLines, mix, motes, rng, seg, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const CARDS = 8;
const R = 2.35;
const W = 1.5;
const H = 0.95;
const D = 0.07;

/** A rounded glass slab, built by hand (front, back, sides) with a face id per vertex. */
function slab() {
  const outline: [number, number][] = [];
  const rad = 0.12;
  const corners: [number, number, number][] = [
    [W / 2 - rad, H / 2 - rad, 0],
    [-W / 2 + rad, H / 2 - rad, Math.PI / 2],
    [-W / 2 + rad, -H / 2 + rad, Math.PI],
    [W / 2 - rad, -H / 2 + rad, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= 6; k += 1) outline.push([cx + Math.cos(a0 + (k / 6) * (Math.PI / 2)) * rad, cy + Math.sin(a0 + (k / 6) * (Math.PI / 2)) * rad]);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const face: number[] = [];
  const idx: number[] = [];
  const n = outline.length;
  for (const [side, z] of [
    [1, D / 2],
    [2, -D / 2],
  ] as const) {
    const base = pos.length / 3;
    pos.push(0, 0, z);
    nor.push(0, 0, side === 1 ? 1 : -1);
    uv.push(0.5, 0.5);
    face.push(side);
    for (const [x, y] of outline) {
      pos.push(x, y, z);
      nor.push(0, 0, side === 1 ? 1 : -1);
      uv.push(x / W + 0.5, y / H + 0.5);
      face.push(side);
    }
    for (let i = 0; i < n; i += 1) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      if (side === 1) idx.push(base, a, b);
      else idx.push(base, b, a);
    }
  }
  const sideBase = pos.length / 3;
  for (let i = 0; i < n; i += 1) {
    const [x, y] = outline[i] as [number, number];
    const len = Math.hypot(x, y) || 1;
    for (const z of [D / 2, -D / 2]) {
      pos.push(x, y, z);
      nor.push(x / len, y / len, 0);
      uv.push(i / n, z > 0 ? 1 : 0);
      face.push(0);
    }
  }
  for (let i = 0; i < n; i += 1) {
    const a = sideBase + i * 2;
    const b = sideBase + ((i + 1) % n) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = geometry({ position: { array: new Float32Array(pos), size: 3 }, normal: { array: new Float32Array(nor), size: 3 }, uv: { array: new Float32Array(uv), size: 2 }, aFace: { array: new Float32Array(face), size: 1 } });
  g.setIndex(idx);
  return g;
}

const cardVertex = /* glsl */ `
attribute float aFace;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vFace;
void main() {
  vUv = uv;
  vFace = aFace;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal + vec3(0.0, 1e-5, 0.0));
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const cardFragment = /* glsl */ `
${FLUCT_GLSL}
uniform vec3 uTint;
uniform sampler2D uText;
uniform float uFade;
uniform float uFront;
uniform float uReveal;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vFace;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
  // Thin-film colours at the edge of the glass.
  vec3 irid = 0.5 + 0.5 * cos(6.2832 * (fres * 1.3 + vec3(0.0, 0.33, 0.67) + uSeed));
  vec3 col = vec3(0.03, 0.035, 0.04) + irid * fres * (vFace < 0.5 ? 1.1 : 0.55);
  float alpha = 0.35 + 0.5 * fres;
  if (vFace > 0.5) {
    // The thin section: an oval of the stratum, glowing in the project's colour.
    vec2 c = (vUv - vec2(0.5, 0.56)) / vec2(0.32, 0.3);
    float sec = smoothstep(1.0, 0.92, length(c));
    float beds = 0.55 + 0.45 * sin(c.y * 9.0 + sin(c.x * 4.0 + uSeed * 9.0) * 1.4 + hash(floor(c * 14.0)) * 0.6);
    col += uTint * sec * beds * (0.55 + 0.6 * uFront) * (0.85 + 0.15 * fluct(uTime, uSeed));
    alpha = max(alpha, sec * 0.92);
    // The engraving, decoding from left to right as the card comes to the front.
    float t = texture2D(uText, vUv).a;
    float reveal = smoothstep(uReveal, uReveal - 0.06, vUv.x + 0.05 * hash(floor(vUv * vec2(40.0, 12.0))));
    col += vec3(0.92, 0.95, 0.96) * t * mix(0.25, 1.0, reveal) * (vFace < 1.5 ? 1.0 : 0.0);
    alpha = max(alpha, t * 0.9);
  }
  gl_FragColor = vec4(col * uFade, alpha * uFade);
}`;

export default function createDeep(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(707);
  const items = [...ctx.section.querySelectorAll<HTMLElement>('.deep-cards li[data-card]')];
  const geo = slab();
  const tints = [layerColor.deep, layerColor.current, layerColor.genten, layerColor.pegasus, layerColor['php-audit'], layerColor.auction, layerColor.patent, layerColor.catchup];

  const cards = items.slice(0, CARDS).map((li, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 324;
    const c = canvas.getContext('2d');
    const text = (sel: string) => li.querySelector(sel)?.textContent?.trim() ?? '';
    if (c) {
      c.clearRect(0, 0, 512, 324);
      c.fillStyle = '#fff';
      c.font = '500 20px ui-monospace, monospace';
      c.fillText(text('.deep-card-industry'), 28, 40);
      c.fillText(text('.deep-card-period'), 28, 300);
      c.font = '600 26px system-ui, sans-serif';
      c.fillText(text('.deep-card-title').slice(0, 22), 28, 78);
      c.font = '500 18px ui-monospace, monospace';
      c.fillText(text('.deep-card-tech').slice(0, 40), 220, 300);
    }
    const texture = new CanvasTexture(canvas);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTint: { value: new Color(tints[i % tints.length] as string).multiplyScalar(1.6) },
        uText: { value: texture },
        uFade: { value: 0 },
        uFront: { value: 0 },
        uReveal: { value: 0 },
        uTime: { value: 0 },
        uSeed: { value: r() },
      },
      vertexShader: cardVertex,
      fragmentShader: cardFragment,
    });
    const mesh = new Mesh(geo, material);
    mesh.renderOrder = 2;
    group.add(mesh);
    return { li, mesh, material, texture, reveal: 0 };
  });

  // The upright core at the centre (the director's band shader).
  const core = ctx.coreModel(8);
  core.scale.setScalar(0.4);
  group.add(core);

  // Streaks of light and a cloud of motes between the cards.
  const streak: number[] = [];
  for (let s = 0; s < 6; s += 1) {
    const r0 = 3.0 + s * 0.25;
    const ph = r() * Math.PI * 2;
    for (let k = 0; k < 60; k += 1) {
      const a0 = ph + (k / 60) * Math.PI * 1.2;
      const a1 = ph + ((k + 1) / 60) * Math.PI * 1.2;
      streak.push(Math.cos(a0) * r0, -1.6 + k * 0.05 + s * 0.2, Math.sin(a0) * r0, Math.cos(a1) * r0, -1.6 + (k + 1) * 0.05 + s * 0.2, Math.sin(a1) * r0);
    }
  }
  const alpha = new Float32Array(streak.length / 3).map((_, i) => ((i % 120) / 120) ** 2);
  const streaks = glowLines(geometry({ position: { array: new Float32Array(streak), size: 3 }, alpha: { array: alpha, size: 1 } }), new Color('#c7b8e8'));
  group.add(streaks.lines);
  const cloud = motes(ctx.count(1400), [8, 5, 8], [0, 0, 0], new Color('#d6a8d8'), 1.5, 37);
  group.add(cloud.points);

  const spin = (q: number) => -q * Math.PI * 2 * ((CARDS - 1) / CARDS);
  const pose = (p: number, wide: boolean, out: Pose) => {
    const t = seg(p, 0.15, 0.85);
    setPose(out, [0, mix(0.9, -0.5, t), wide ? 7.6 : 11.5], [0, mix(0.6, -0.5, t), 0], wide ? 38 : 50);
  };
  let front = -1;

  return {
    group,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        const k = i % CARDS;
        const th = Math.PI / 2 + (k / CARDS) * Math.PI * 2;
        out.set([Math.cos(th) * R + (r() - 0.5) * W, 1.5 - k * 0.42 + (r() - 0.5) * H, Math.sin(th) * R], i * 3);
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const s = spin(q);
      let best = -1;
      let bestF = 0;
      cards.forEach((c, i) => {
        const th = Math.PI / 2 + (i / CARDS) * Math.PI * 2 + s;
        const f = Math.pow(Math.max(0, Math.cos(th - Math.PI / 2)), 10);
        if (f > bestF) {
          bestF = f;
          best = i;
        }
        c.mesh.position.set(Math.cos(th) * R * mix(1, 0.75, f), 1.5 - i * 0.42, Math.sin(th) * R * mix(1, 1.15, f));
        c.mesh.rotation.set(input.pointerOn ? input.pointer.y * -0.18 * f : 0, Math.PI / 2 - th + (1 - f) * 0.9 + (input.pointerOn ? input.pointer.x * 0.25 * f : 0), 0);
        c.mesh.scale.setScalar(mix(0.85, 1.12, f));
        c.reveal = mix(c.reveal, f > 0.6 ? 1.1 : 0, 1 - Math.exp(-input.dt * 2.2));
        const u = c.material.uniforms;
        u.uFade!.value = input.fade;
        u.uFront!.value = f;
        u.uReveal!.value = c.reveal;
        u.uTime!.value = input.time;
      });
      if (best !== front) {
        cards[front]?.li.removeAttribute('data-front');
        if (best >= 0) cards[best]?.li.setAttribute('data-front', '');
        front = best;
      }
      core.rotation.y = input.time * 0.08 + s * 0.3;
      core.traverse((o) => {
        const m = (o as Mesh).material as ShaderMaterial | undefined;
        if (m?.uniforms?.uOpacity) {
          m.uniforms.uOpacity.value = input.fade;
          m.uniforms.uTime!.value = input.time;
        }
      });
      streaks.lines.rotation.y = input.time * 0.05;
      for (const m of [streaks.material, cloud.material]) {
        m.uniforms.uTime!.value = input.time;
        m.uniforms.uFade!.value = input.fade * (m === streaks.material ? 0.7 : 1);
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
    },
    dispose() {
      for (const it of items) it.removeAttribute('data-front');
      for (const c of cards) c.texture.dispose();
      core.traverse((o) => ((o as Mesh).material as ShaderMaterial | undefined)?.dispose?.());
      group.remove(core);
      disposeGroup(group);
    },
  };
}
