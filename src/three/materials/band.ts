/**
 * One band of the hero core (docs/STORYBOARD.md acts 1–2; look: docs/concept/core-lab.png).
 *
 * The hero core is 11 band meshes (so the bands can separate in act 2) sharing this one shader
 * program; only uniforms differ per band. Per band:
 * - rock in the layer colour (tokens), with the seamless rock texture once it is loaded
 *   (src/three/world/rock.ts), muted toward earth tones: wavy bedding along the core, grit, faint
 *   drilling rings;
 * - polished cut faces at both ends, showing the bedding straight across;
 * - a cool key light and a cyan rim (one key light on a near-black stage, as in the references);
 * - `uLeak`: when the bands separate, light leaks from their cut faces (bloom picks it up);
 * - `uClipY`: while the core is pulled out of the borehole, nothing below the ground line is drawn;
 * - `uDim` / `uOpacity`: bands step back while one band is in front, and the core fades into the
 *   navigator at the end of the sequence.
 */
import { Color, ShaderMaterial, type Texture } from 'three';
import { signal } from '@/styles/tokens';

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
uniform vec3 uTint;
uniform vec3 uEvidence;
uniform float uIndex;
uniform float uHeight;   // band height (object units)
uniform float uRadius;
uniform float uLeak;     // 0..1 light leaking from the cut faces (act 2)
uniform float uDim;      // 0..1 overall level (1 = full)
uniform float uOpacity;
uniform float uRim;      // cyan rim strength
uniform float uClipY;    // drawing-buffer y below which nothing is drawn (< 0: off)
uniform float uTime;
uniform sampler2D uRock0;
uniform sampler2D uRock1;
uniform float uRockMix;
uniform float uGlow;     // 0..1 the band glows from inside in its colour (hovered in the index)
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
  if (uClipY >= 0.0 && gl_FragCoord.y < uClipY) discard;
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  bool cut = abs(vObjNormal.y) > 0.5;
  float around = atan(vObj.z, vObj.x);
  float along = vObj.y / uHeight + 0.5;                       // 0 at one cut face, 1 at the other

  // Colour: the layer tint, muted toward an earth tone (docs/concept/core-lab.png).
  float lum = dot(uTint, vec3(0.299, 0.587, 0.114));
  vec3 earth = vec3(0.4, 0.35, 0.3) * (0.85 + 0.3 * hash(vec2(uIndex, 2.0)));
  vec3 base = mix(earth, mix(vec3(lum), uTint, 0.8), 0.6);

  // Bedding: wavy layers running along the core (across local x), the same on the side and on the
  // cut faces — so a cut face shows the beds straight across.
  float bx = vObj.x / uRadius;
  float warp = (noise(vec2(vObj.y * 1.6 + uIndex * 5.0, bx * 1.8)) - 0.5) * 0.55 + (noise(vec2(vObj.y * 6.0, bx * 7.0 + uIndex)) - 0.5) * 0.12;
  float bedCoord = (bx + warp) * 3.6 + uIndex * 1.7;
  float bed = floor(bedCoord);
  float fb = fract(bedCoord);
  // Each bed its own tone and a slight shift of hue; soft boundaries, no drawn lines.
  float hb = hash(vec2(bed, uIndex + 3.0));
  float hb2 = hash(vec2(bed + 1.0, uIndex + 3.0));
  float blend = smoothstep(0.82, 1.0, fb);
  float tone = mix(0.66 + 0.5 * hb, 0.66 + 0.5 * hb2, blend);
  vec3 shift = mix(vec3(1.0), vec3(1.08, 0.97, 0.9), hash(vec2(bed, uIndex + 9.0)));
  tone *= 0.94 + 0.06 * sin(bedCoord * 17.0 + noise(vec2(vObj.y * 3.0, bx * 9.0)) * 4.0);   // laminae
  vec3 rock = base * tone * shift;

  vec3 col;
  if (cut) {
    // Polished cut face: smooth, a soft sheen, chipped at the rim.
    vec2 face = vObj.xz / uRadius;
    vec3 tex = uRockMix > 0.0 ? texture2D(uRock1, face * 0.35 + uIndex * 0.37).xyz : vec3(0.5);
    col = rock * (0.8 + 0.45 * mix(0.5, tex.z, uRockMix));
    float r = length(face);
    float edge = smoothstep(0.84, 1.0, r);
    col *= 1.0 - 0.35 * edge;
    col *= 1.0 - 0.5 * step(0.84, noise(vec2(around * 9.0, uIndex * 3.0))) * edge;   // chips at the rim
    float key = max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0);
    col *= 0.38 + 0.45 * key;
    col += vec3(0.9, 0.95, 1.0) * 0.06 * pow(max(dot(reflect(-v, n), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0);
    // Light leaking at the rim when the bands are apart (bloom picks it up).
    col += uEvidence * uLeak * (0.05 + 1.3 * edge * edge) * (0.85 + 0.15 * sin(uTime * 1.3 + uIndex));
  } else {
    // Side: rock texture follows the drill direction; faint, uneven drilling rings.
    vec2 tuv = vec2(around / 6.2832 * 1.5 + uIndex * 0.31, vObj.y / (uRadius * 6.2832) * 1.5);
    vec3 tex = uRockMix > 0.0 ? texture2D(uRock0, tuv).xyz : vec3(0.5);
    vec3 nn = normalize(n + (vec3(tex.x - 0.5, tex.y - 0.5, 0.0)) * 0.8 * uRockMix);
    rock *= mix(0.9 + 0.2 * noise(vec2(around * 30.0, vObj.y * 7.0)), 0.55 + 0.9 * tex.z, uRockMix);
    float rings = noise(vec2(vObj.y * 34.0, around * 0.7));
    rock *= 0.96 + 0.04 * sin(vObj.y * 70.0 + rings * 5.0) * smoothstep(0.3, 0.8, rings);
    rock *= mix(0.55, 1.0, smoothstep(0.0, 0.025, along) * smoothstep(1.0, 0.975, along));  // clear boundaries
    float key = max(dot(nn, normalize(vec3(-0.5, 0.55, 0.65))), 0.0);
    float fill = max(dot(nn, normalize(vec3(0.7, -0.2, 0.4))), 0.0);
    col = rock * (0.1 + 1.05 * key + 0.16 * fill);
    col += vec3(0.85, 0.9, 1.0) * 0.06 * pow(key, 16.0);                              // polish
  }
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uEvidence * uRim * fres * (cut ? 0.2 : 0.8);

  // Hovered in the index (STORYBOARD v2.1 §1): it glows from inside in its own colour.
  vec3 glowCol = mix(uTint * 1.9, uEvidence, 0.25);
  col += glowCol * uGlow * (cut ? 0.55 + 0.6 * smoothstep(1.0, 0.2, length(vObj.xz / uRadius)) : 0.18 + 0.9 * fres);

  col *= max(uDim, uGlow);
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type BandMaterial = ShaderMaterial & {
  uniforms: {
    uTint: { value: Color };
    uIndex: { value: number };
    uHeight: { value: number };
    uRadius: { value: number };
    uLeak: { value: number };
    uDim: { value: number };
    uOpacity: { value: number };
    uRim: { value: number };
    uClipY: { value: number };
    uTime: { value: number };
    uRock0: { value: Texture | null };
    uRock1: { value: Texture | null };
    uRockMix: { value: number };
    uGlow: { value: number };
  };
};

export function createBandMaterial(tint: string, index: number, height: number, radius: number): BandMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    uniforms: {
      uTint: { value: new Color(tint) },
      uEvidence: { value: new Color(signal.evidence) },
      uIndex: { value: index },
      uHeight: { value: height },
      uRadius: { value: radius },
      uLeak: { value: 0 },
      uDim: { value: 1 },
      uOpacity: { value: 1 },
      uRim: { value: 0.35 },
      uClipY: { value: -1 },
      uTime: { value: 0 },
      uRock0: { value: null },
      uRock1: { value: null },
      uRockMix: { value: 0 },
      uGlow: { value: 0 },
    },
  }) as unknown as BandMaterial;
}
