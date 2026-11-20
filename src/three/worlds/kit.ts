/**
 * What every section world shares (STORYBOARD v2.1 §3–§4, §8.5). Plain three.js, no React, and
 * only three.js classes the 3D base chunk already contains (BufferGeometry, ShaderMaterial, Points,
 * LineSegments, InstancedMesh, CanvasTexture…): a world that used another class would grow the base
 * for everyone. Geometry is built here by hand instead of with three's geometry helpers.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LineSegments, Mesh, Points, ShaderMaterial, Vector2, Vector4, type PerspectiveCamera, type WebGLRenderer } from 'three';

export type Tier = 'high' | 'medium' | 'low';

/** A camera pose: position, look-at target, vertical field of view. */
export type Pose = { pos: [number, number, number]; look: [number, number, number]; fov: number };

export type WorldInput = {
  /** Seconds since the stage started, and since the last frame. */
  time: number;
  dt: number;
  /** The act's progress 0–1 (smoothed): entry 0–0.15, story 0.15–result, pause, return 0.85–1. */
  p: number;
  /** The story's own progress 0–1 over [0.15, result]. */
  q: number;
  /** 0–1: how visible the world is (it fades in at the end of the entry, out at the start of the return). */
  fade: number;
  /** Pointer in normalised device coordinates (−1…1, y up); `pointerOn` once a mouse moved or a finger drags. */
  pointer: { x: number; y: number };
  pointerOn: boolean;
  wide: boolean;
  aspect: number;
  /** The canvas's pixel ratio (point sizes). */
  px: number;
  camera: PerspectiveCamera;
  /** Value of a control in the act's HTML (`[data-control=name]`): a range 0–1, or the text of an input. */
  control: (name: string) => number | string | null;
  /** Attributes and variables on the act's section (cached: only changes reach the DOM). */
  flag: (name: string, on: boolean) => void;
  attr: (name: string, value: string | null) => void;
  cssVar: (name: string, value: string) => void;
};

export interface World {
  group: Group;
  /** `n` points (x, y, z) of the world's silhouette, in world space: what the cut face's particles become. */
  shape(n: number): Float32Array;
  /** The camera for act progress `p` (called for the whole act; the entry and return use p = 0.15 / 0.85). */
  pose(p: number, wide: boolean, out: Pose): void;
  update(input: WorldInput): void;
  /** Heavy set-up (idle slices) resolves here; the world is shown only after it. */
  ready?: Promise<void>;
  dispose(): void;
}

export type WorldContext = {
  tier: Tier;
  gl: WebGLRenderer;
  /** The act's section: worlds read their facts and controls from its HTML. */
  section: HTMLElement;
  /** The layer's colour (tokens). */
  tint: string;
  /** Scale a high-tier count to the current tier (high 1, medium ½, low ¼). */
  count: (high: number) => number;
  /** A small copy of the core (the director's band material), for worlds that show it. */
  coreModel: (bands: number) => Group;
  /** Where the act's result lands (fraction of the act; the pause after it holds the result). */
  result: number;
};

/** The story's own progress 0–1 for act progress `p` (same as WorldInput.q). */
export function storyOf(p: number, result: number): number {
  return Math.min(1, Math.max(0, (p - 0.15) / Math.max(0.05, result - 0.15)));
}

export type WorldFactory = (ctx: WorldContext) => World;

export const COLORS = {
  evidence: new Color('#8fcbd0'),
  crisis: new Color('#e26943'),
  ok: new Color('#9cc9a0'),
  warm: new Color('#ffd8a8'),
  ink: new Color('#ece6dd'),
  ground: new Color('#13110f'),
};

/**
 * Natural flicker (§8.5): a sum of five sines at irrational ratios, amplitudes falling as f^-½
 * — irregular and smooth, like a firefly, never a fixed blink. Returns roughly 0–1.
 */
export const FLUCT_GLSL = /* glsl */ `
float fluct(float t, float s) {
  float v = 0.0;
  v += 1.000 * sin(t * 0.31 + s * 6.283);
  v += 0.707 * sin(t * 0.83 + s * 12.71 + 1.3);
  v += 0.577 * sin(t * 1.97 + s * 3.17 + 2.1);
  v += 0.500 * sin(t * 4.13 + s * 9.43 + 0.7);
  v += 0.447 * sin(t * 8.71 + s * 5.91 + 4.2);
  return 0.5 + v / 6.462;
}
`;

/** The same flicker for JS-driven values. */
export function fluct(t: number, s: number): number {
  const v =
    Math.sin(t * 0.31 + s * 6.283) +
    0.707 * Math.sin(t * 0.83 + s * 12.71 + 1.3) +
    0.577 * Math.sin(t * 1.97 + s * 3.17 + 2.1) +
    0.5 * Math.sin(t * 4.13 + s * 9.43 + 0.7) +
    0.447 * Math.sin(t * 8.71 + s * 5.91 + 4.2);
  return 0.5 + v / 6.462;
}

/** Deterministic random numbers (the same world every visit). */
export function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
/** Eased 0→1 progress of `t` through [a, b]. */
export function seg(t: number, a: number, b: number, ease: (x: number) => number = easeInOutCubic): number {
  return ease(clamp01((t - a) / (b - a)));
}

export function setPose(out: Pose, pos: [number, number, number], look: [number, number, number], fov = 35) {
  out.pos[0] = pos[0];
  out.pos[1] = pos[1];
  out.pos[2] = pos[2];
  out.look[0] = look[0];
  out.look[1] = look[1];
  out.look[2] = look[2];
  out.fov = fov;
}

/** Linear blend of two poses (the callers pass eased weights). */
export function blendPose(out: Pose, a: Pose, b: Pose, t: number) {
  for (let i = 0; i < 3; i += 1) {
    out.pos[i] = mix(a.pos[i] as number, b.pos[i] as number, t);
    out.look[i] = mix(a.look[i] as number, b.look[i] as number, t);
  }
  out.fov = mix(a.fov, b.fov, t);
}

export function geometry(attributes: Record<string, { array: Float32Array; size: number }>): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, { array, size }] of Object.entries(attributes)) g.setAttribute(name, new BufferAttribute(array, size));
  return g;
}

/**
 * Glowing points with natural flicker. Attributes: position, `seed` (0–1); optional `color`.
 * Uniforms every world drives: uTime, uFade, uPx (pixel ratio), uSize.
 */
export function glowPoints(g: BufferGeometry, opts: { color?: Color; size?: number; vertex?: string; fragment?: string; uniforms?: Record<string, { value: unknown }> } = {}) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: false,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },
      uPx: { value: 1 },
      uSize: { value: opts.size ?? 2 },
      uColor: { value: opts.color ?? COLORS.evidence.clone() },
      ...(opts.uniforms ?? {}),
    },
    vertexShader:
      opts.vertex ??
      /* glsl */ `
      ${FLUCT_GLSL}
      attribute float seed;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA = 0.35 + 0.65 * fluct(uTime * 1.3, seed);
        gl_PointSize = uSize * (0.6 + seed) * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader:
      opts.fragment ??
      /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * a * vA * uFade, 1.0);
      }`,
  });
  const points = new Points(g, material);
  points.frustumCulled = false;
  return { points, material };
}

/** Additive glowing surfaces (beams, glass edges): the same uniforms as glowPoints, drawn as triangles. */
export function glowMesh(g: BufferGeometry, opts: { color?: Color; vertex: string; fragment: string; uniforms?: Record<string, { value: unknown }> }) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uColor: { value: opts.color ?? COLORS.evidence.clone() }, ...(opts.uniforms ?? {}) },
    vertexShader: opts.vertex,
    fragmentShader: opts.fragment,
  });
  const mesh = new Mesh(g, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

/** Thin additive lines; per-vertex `alpha` (optional) multiplies the colour. */
export function glowLines(g: BufferGeometry, color: Color, opts: { fragment?: string; vertex?: string; uniforms?: Record<string, { value: unknown }> } = {}) {
  if (!g.getAttribute('alpha')) g.setAttribute('alpha', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(1), 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: color }, uFade: { value: 0 }, uTime: { value: 0 }, ...(opts.uniforms ?? {}) },
    vertexShader:
      opts.vertex ??
      /* glsl */ `
      attribute float alpha;
      varying float vA;
      void main() {
        vA = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:
      opts.fragment ??
      /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vA;
      void main() { gl_FragColor = vec4(uColor * vA * uFade, 1.0); }`,
  });
  const lines = new LineSegments(g, material);
  lines.frustumCulled = false;
  return { lines, material };
}

/** Sample `n` points from the drawn pixels of a text (canvas), centred, `height` world units tall. */
export function textPoints(text: string, n: number, height: number, font = '600 120px serif', seed = 3): Float32Array {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const out = new Float32Array(n * 3);
  if (!ctx) return out;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  canvas.width = w;
  canvas.height = 160;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, 80);
  const data = ctx.getImageData(0, 0, w, 160).data;
  const filled: number[] = [];
  for (let y = 0; y < 160; y += 2) for (let x = 0; x < w; x += 2) if ((data[(y * w + x) * 4 + 3] ?? 0) > 128) filled.push(x, y);
  const r = rng(seed);
  const scale = height / 120;
  for (let i = 0; i < n; i += 1) {
    const k = Math.floor(r() * (filled.length / 2)) * 2;
    out[i * 3] = ((filled[k] ?? 0) - w / 2) * scale;
    out[i * 3 + 1] = (80 - (filled[k + 1] ?? 80)) * scale;
    out[i * 3 + 2] = (r() - 0.5) * 0.05;
  }
  return out;
}

/** Fill `n` points from a list of candidate positions (repeating, with jitter), for `shape()`. */
export function pickPoints(source: Float32Array, n: number, jitter = 0.02, seed = 11): Float32Array {
  const out = new Float32Array(n * 3);
  const count = source.length / 3;
  if (count === 0) return out;
  const r = rng(seed);
  for (let i = 0; i < n; i += 1) {
    const k = Math.floor(r() * count) * 3;
    out[i * 3] = (source[k] ?? 0) + (r() - 0.5) * jitter;
    out[i * 3 + 1] = (source[k + 1] ?? 0) + (r() - 0.5) * jitter;
    out[i * 3 + 2] = (source[k + 2] ?? 0) + (r() - 0.5) * jitter;
  }
  return out;
}

/** Dispose every geometry and material under a group. */
export function disposeGroup(group: Group) {
  group.traverse((o) => {
    const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
    m.geometry?.dispose();
    if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
    else m.material?.dispose();
  });
}

/** A drifting cloud of motes around a world (every world has its own air). */
/**
 * Motes and stars drift toward the pointer (STORYBOARD v2.3 §11.1): slowly, as if through water,
 * nearer ones more than far ones, and back when it leaves; those close to it glimmer. One set of
 * uniforms shared by every material that includes `ATTRACT_GLSL` (the director drives them through
 * slow springs): `uAttract` = the pointer in NDC, twice (xy: a quicker follower, zw: a slower one —
 * each mote follows a mix of the two by its seed, so they never move as one sheet), `uAttractK` =
 * how much the pointer is there (0 once it has left), `uDrag` = the flow of a finger's drag.
 * `uSpeed` (§10-F) = how fast the story is moving, 0–1: motes stretch into short streaks of light
 * while it moves fast and are quiet points again when it slows (kept small on purpose).
 */
export const ATTRACT = { uAttract: { value: new Vector4() }, uAttractK: { value: 0 }, uDrag: { value: new Vector2() }, uSpeed: { value: 0 } };
export const ATTRACT_GLSL = /* glsl */ `
uniform vec4 uAttract;
uniform float uAttractK;
uniform vec2 uDrag;
uniform float uSpeed;
// Moves the clip-space position toward the pointer; returns 0–1, how close to it the mote is.
float attract(inout vec4 clip, float seed) {
  vec2 ndc = clip.xy / max(clip.w, 1e-3);
  vec2 to = mix(uAttract.xy, uAttract.zw, seed) - ndc;
  float d = length(to);
  float depth = clamp(7.0 / max(clip.w, 0.5), 0.12, 1.0);
  ndc += to * (uAttractK * depth * 0.3 * smoothstep(1.5, 0.0, d)) + uDrag * depth;
  clip.xy = ndc * clip.w;
  return uAttractK * smoothstep(0.45, 0.0, d);
}
`;

export function motes(count: number, box: [number, number, number], center: [number, number, number], color: Color, size = 1.6, seed = 5) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = center[0] + (r() - 0.5) * box[0];
    pos[i * 3 + 1] = center[1] + (r() - 0.5) * box[1];
    pos[i * 3 + 2] = center[2] + (r() - 0.5) * box[2];
    seeds[i] = r();
  }
  const g = geometry({ position: { array: pos, size: 3 }, seed: { array: seeds, size: 1 } });
  return glowPoints(g, {
    color,
    size,
    uniforms: ATTRACT,
    fragment: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      uniform float uSpeed;
      varying float vA;
      void main() {
        // Moving fast, a mote is a short upright streak; slow, a round point.
        vec2 c = (gl_PointCoord - 0.5) * vec2(1.0 + 5.0 * uSpeed, 1.0);
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(uColor * a * vA * uFade, 1.0);
      }`,
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      ${ATTRACT_GLSL}
      attribute float seed;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * (0.05 + seed * 0.07) + seed * 31.0) * 0.5;
        p.y += sin(uTime * (0.04 + seed * 0.05) + seed * 17.0) * 0.4;
        p.z += cos(uTime * (0.06 + seed * 0.04) + seed * 11.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.5 + seed) * uPx * (10.0 / max(0.5, -mv.z)) * (1.0 + 2.2 * uSpeed);
        gl_Position = projectionMatrix * mv;
        float near = attract(gl_Position, seed);
        vA = (0.15 + 0.85 * pow(fluct(uTime, seed), 2.0)) * (1.0 + 1.4 * near * fluct(uTime * 2.3, seed + 0.37));
      }`,
  });
}
