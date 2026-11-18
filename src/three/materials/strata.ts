/**
 * Sedimentary-rock material for the boring core and the strata cross-sections (Phase 3-8).
 *
 * - medium / high: one GLSL program shared by every instance (three.js caches by source):
 *   warped horizontal beds with per-bed tone, darker seams, fine grain, cheap lambert light,
 *   and an inner glow (`uGlow`) used when a ring has just been passed.
 * - low: no per-pixel noise at all — beds are baked once into a tiny texture
 *   (MeshBasicMaterial + 4×64 DataTexture).
 *
 * Colours come from the layer colour tokens (src/lib/layer-colors.ts; tokens.ts from Phase 4).
 * Callers own the returned material and must dispose it (disposeStrata).
 */
import { Color, DataTexture, MeshBasicMaterial, RGBAFormat, RepeatWrapping, ShaderMaterial, type Material } from 'three';

export type StrataOptions = {
  color: string;
  /** Beds per object-space unit along Y. */
  bandScale: number;
  quality: 'high' | 'medium' | 'low';
  /** Stable per-object seed so neighbouring objects do not share the same beds. */
  seed?: number;
};

const vertexShader = /* glsl */ `
varying vec3 vObj;
varying vec3 vObjNormal;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vObj = position;
  vObjNormal = normal;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uBandScale;
uniform float uSeed;
uniform float uGlow;    // 0..1 inner glow (just passed / current)
uniform float uPassed;  // 0 = not reached yet (dim, translucent), 1 = passed
varying vec3 vObj;
varying vec3 vObjNormal;
varying vec3 vNormal;
varying vec3 vView;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec3 n = normalize(vNormal);
  // Wrap coordinate: angle around Y for cylinders, falls back to X for flat sections.
  float around = atan(vObj.z, vObj.x) * 1.6 + vObj.x * uBandScale * 0.15;
  float y = vObj.y * uBandScale + uSeed;
  // Faces cut across the beds (top/bottom caps): show them as concentric rings instead.
  if (abs(vObjNormal.y) > 0.5) {
    y = length(vObj.xz) * uBandScale * 0.9 + uSeed;
    around = (vObj.x + vObj.z) * uBandScale * 0.6;
  }

  // Beds: gently warped so the seams are never perfectly straight.
  float warp = noise(vec2(around * 1.3, y * 0.35)) * 0.55;
#ifdef STRATA_HIGH
  warp += noise(vec2(around * 4.0, y * 0.9)) * 0.18;
#endif
  float bedY = y + warp;
  float bed = floor(bedY);
  float inBed = fract(bedY);
  float tone = hash(vec2(bed, uSeed + 7.0));
  float seam = smoothstep(0.0, 0.07, inBed) * smoothstep(1.0, 0.9, inBed);

  vec3 base = uColor * (0.62 + 0.5 * tone);
  base *= mix(0.74, 1.0, seam);
#ifdef STRATA_HIGH
  base *= 0.9 + 0.2 * noise(vec2(around * 38.0, bedY * 26.0)); // grain
#endif

  float diffuse = max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
  vec3 col = base * (0.36 + 0.74 * diffuse);

  // Inner glow: brightest where the surface faces the viewer, leaking through the seams.
  float facing = max(dot(n, normalize(vView)), 0.0);
  col += uColor * 1.5 * uGlow * (0.3 + 0.7 * pow(facing, 1.5)) * (0.75 + 0.25 * (1.0 - seam));

  float grey = dot(col, vec3(0.333));
  col = mix(vec3(grey) * 0.4, col, uPassed);
  gl_FragColor = vec4(col, mix(0.5, 1.0, uPassed));
  #include <colorspace_fragment>
}
`;

/** Beds baked on the CPU for the low tier: 4×64 texels, repeats around the object. */
function bakeBeds(color: string, seed: number): DataTexture {
  const w = 4;
  const h = 64;
  const c = new Color(color);
  const data = new Uint8Array(w * h * 4);
  let s = Math.floor(seed * 1000) + 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  let tone = 1;
  for (let y = 0; y < h; y += 1) {
    const seam = y % 8 === 0;
    if (seam) tone = 0.62 + 0.5 * rand();
    const k = tone * (seam ? 0.74 : 1);
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      data[o] = Math.min(255, c.r * 255 * k);
      data[o + 1] = Math.min(255, c.g * 255 * k);
      data[o + 2] = Math.min(255, c.b * 255 * k);
      data[o + 3] = 255;
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export type StrataMaterial = Material & { userData: { strata: { setGlow: (v: number) => void; setPassed: (v: boolean) => void } } };

export function createStrataMaterial({ color, bandScale, quality, seed = 0 }: StrataOptions): StrataMaterial {
  if (quality === 'low') {
    const map = bakeBeds(color, seed);
    const m = new MeshBasicMaterial({ map });
    const base = new Color('#ffffff');
    m.userData.strata = {
      // No shader work on low: glow is a plain brightness lift, "not passed" a dim translucent grey.
      setGlow: (v: number) => m.color.copy(base).multiplyScalar(1 + 0.6 * v),
      setPassed: (p: boolean) => {
        m.transparent = !p;
        m.opacity = p ? 1 : 0.35;
        m.needsUpdate = true;
      },
    };
    m.addEventListener('dispose', () => map.dispose());
    return m as unknown as StrataMaterial;
  }
  const m = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: quality === 'high' ? { STRATA_HIGH: '' } : {},
    uniforms: {
      uColor: { value: new Color(color) },
      uBandScale: { value: bandScale },
      uSeed: { value: seed },
      uGlow: { value: 0 },
      uPassed: { value: 1 },
    },
  });
  m.userData.strata = {
    setGlow: (v: number) => {
      (m.uniforms.uGlow as { value: number }).value = v;
    },
    setPassed: (p: boolean) => {
      (m.uniforms.uPassed as { value: number }).value = p ? 1 : 0;
      if (m.transparent === p) {
        m.transparent = !p;
        m.needsUpdate = true;
      }
    },
  };
  return m as unknown as StrataMaterial;
}
