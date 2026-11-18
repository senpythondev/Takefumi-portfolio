/**
 * The boring core (docs/concept/core-lab.png, PM_REVIEW_08 §1): one slender cylinder, one draw call.
 *
 * - 11 bands, one per layer, with clear colour boundaries (layer colour tokens);
 * - passed layers are solid rock; layers not reached yet are a dark ghost with thin guide lines;
 *   the last band ("next") is empty and glows faintly — the call to action;
 * - fine horizontal drilling striations, small chips at the rims, a polished flat cut face that
 *   shows the bedding (no concentric rings);
 * - the band just passed glows from inside and fades; the current band keeps a faint glow.
 * The low tier drops the noise-based detail (CORE_DETAIL 0).
 */
import { Color, ShaderMaterial } from 'three';
import { layer, signal } from '@/styles/tokens';

export const CORE_BANDS = 11;

const vertexShader = /* glsl */ `
varying vec3 vObj;
varying vec3 vObjNormal;
varying vec3 vNormal;
void main() {
  vObj = position;
  vObjNormal = normal;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uBand[${CORE_BANDS}];
uniform vec3 uEvidence;
uniform float uHeight;
uniform float uRadius;
uniform float uPassed;    // number of bands passed (animated, so a new band grows in)
uniform float uCurrent;   // index of the current band
uniform float uGlow;      // 0..1, glow of the band that was just passed
uniform float uGlowBand;
uniform float uTime;
varying vec3 vObj;
varying vec3 vObjNormal;
varying vec3 vNormal;

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

vec3 bandColor(float i) {
  vec3 c = uBand[0];
  for (int k = 1; k < ${CORE_BANDS}; k++) c = mix(c, uBand[k], step(float(k) - 0.5, i));
  return c;
}

void main() {
  vec3 n = normalize(vNormal);
  bool cut = abs(vObjNormal.y) > 0.5;
  float around = atan(vObj.z, vObj.x);
  // Position along the core: 0 at the top, ${CORE_BANDS}.0 at the bottom.
  float along = clamp((0.5 - vObj.y / uHeight) * ${CORE_BANDS}.0, 0.0, ${CORE_BANDS}.0 - 0.001);
#if CORE_DETAIL > 0
  along += (noise(vec2(around * 2.0, along * 3.0)) - 0.5) * 0.05;   // boundaries are never ruler-straight
#endif
  float i = floor(along);
  float f = fract(along);
  vec3 tint = bandColor(i);
  float passed = smoothstep(0.0, 0.25, uPassed - i - (1.0 - f) * 0.0);

  // Bedding inside the band, and the look of a drilled, polished cylinder.
  float beds = 1.0;
  float grain = 1.0;
  float stria = 1.0;
#if CORE_DETAIL > 0
  float w = noise(vec2(around * 1.4 + i * 7.0, along * 4.0)) * 0.9;
  float bed = along * 6.0 + w;
  beds = 0.78 + 0.34 * hash(vec2(floor(bed), i + 3.0));
  beds *= mix(0.82, 1.0, smoothstep(0.0, 0.12, fract(bed)));
  grain = 0.9 + 0.2 * noise(vec2(around * 60.0, vObj.y * 1.6));
  stria = 0.93 + 0.07 * sin(vObj.y * 3.1 + noise(vec2(around * 3.0, vObj.y * 0.2)) * 2.0);   // drill marks
#endif
  vec3 rock = tint * beds * grain * stria;
  rock *= mix(0.42, 1.0, smoothstep(0.0, 0.035, f) * smoothstep(1.0, 0.985, f));               // clear boundaries

  vec3 col;
  if (cut) {
    // Polished cut face: the bedding runs straight across it.
    float lines = 0.86 + 0.14 * sin(vObj.x * 0.55 + vObj.z * 0.2);
    col = tint * lines * 1.12;
    float edge = smoothstep(uRadius * 0.9, uRadius, length(vObj.xz));
    col *= 1.0 - 0.35 * edge;
#if CORE_DETAIL > 0
    col *= 1.0 - 0.6 * step(0.86, noise(vec2(around * 9.0, 3.0))) * edge;                       // chips at the rim
#endif
    col *= 0.85 + 0.25 * max(n.y, 0.0);
  } else {
    float diffuse = max(dot(n, normalize(vec3(-0.55, 0.35, 0.75))), 0.0);
    float rim = pow(1.0 - max(n.z, 0.0), 2.5);
    col = rock * (0.3 + 0.85 * diffuse) + rock * 0.25 * rim;
    col += vec3(0.9, 0.92, 1.0) * 0.07 * pow(diffuse, 14.0);                                    // polish
  }

  // Not reached yet: a dark ghost of the band with thin guide lines.
  float guide = smoothstep(0.04, 0.0, f) + smoothstep(0.96, 1.0, f);
  vec3 ghost = vec3(0.035, 0.034, 0.033) + vec3(0.11, 0.105, 0.1) * guide * 0.6 + tint * 0.035;
  // The last band is the next project: empty, faintly glowing.
  float isNext = step(${CORE_BANDS}.0 - 1.5, i);
  ghost += uEvidence * isNext * (0.09 + 0.05 * sin(uTime * 1.6)) * (0.5 + 0.5 * guide + 0.4 * pow(1.0 - max(n.z, 0.0), 2.0));
  col = mix(ghost, col, passed);

  // Glow: the band just passed, and (fainter) the current one.
  float glow = uGlow * (1.0 - step(0.5, abs(i - uGlowBand))) + 0.16 * (1.0 - step(0.5, abs(i - uCurrent)));
  col += tint * glow * (0.5 + 0.7 * pow(max(n.z, 0.0), 1.5)) * passed;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export type CoreMaterial = ShaderMaterial & {
  uniforms: {
    uHeight: { value: number };
    uRadius: { value: number };
    uPassed: { value: number };
    uCurrent: { value: number };
    uGlow: { value: number };
    uGlowBand: { value: number };
    uTime: { value: number };
  };
};

export function createCoreMaterial(ids: readonly string[], detail: boolean): CoreMaterial {
  const bands = Array.from({ length: CORE_BANDS }, (_, i) => new Color(layer[(ids[i] ?? 'next') as keyof typeof layer] ?? layer.next));
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: { CORE_DETAIL: detail ? 1 : 0 },
    uniforms: {
      uBand: { value: bands },
      uEvidence: { value: new Color(signal.evidence) },
      uHeight: { value: 1 },
      uRadius: { value: 1 },
      uPassed: { value: 1 },
      uCurrent: { value: 0 },
      uGlow: { value: 0 },
      uGlowBand: { value: -1 },
      uTime: { value: 0 },
    },
  }) as unknown as CoreMaterial;
}

export function sizeCore(material: CoreMaterial, height: number, radius: number): void {
  material.uniforms.uHeight.value = height;
  material.uniforms.uRadius.value = radius;
}
