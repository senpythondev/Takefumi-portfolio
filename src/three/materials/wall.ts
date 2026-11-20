/**
 * The wall: the cross-section of ground the whole site descends through
 * (docs/concept/ART_DIRECTION.md §1–2, references hero-descent.png and lantern.png).
 *
 * One fragment shader on one clip-space quad (1 draw call, no textures):
 * - world space is depth: x = viewport heights right of the borehole, y = viewport heights below the
 *   top of the page (`uDepth` = scroll position), so the rock is locked to the page as it scrolls;
 * - thick wavy sedimentary beds as a height field, with parallax occlusion mapping and
 *   self-shadowing so beds overlap, overhang and shift against each other (WALL_STEPS per tier);
 * - bed colour from the layer colour tokens at that depth;
 * - the cyan borehole, the surface (horizon, night sky, drill rig with one warm light);
 * - three geodes: windows onto miniature scenes (server racks, city, river of light);
 * - the lantern: a warm beam at the pointer; only inside it the rock turns translucent and shows
 *   the circuit veins, wireframes and points of light embedded in the strata.
 *
 * Procedural placeholders stand in for the rock textures the PM will issue (MEDIA_PROMPTS.md).
 */
import { Color, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import { base, city, layer, signal } from '@/styles/tokens';

export type WallQuality = 'high' | 'medium' | 'low';

const STEPS: Record<WallQuality, { march: number; shadow: number }> = {
  high: { march: 24, shadow: 8 },
  medium: { march: 12, shadow: 4 },
  low: { march: 0, shadow: 0 },
};

export const WALL_LAYER_COUNT = 11;
/** The surface line, in viewport heights below the top of the page (the drill rig stands on it). */
export const WALL_HORIZON = 0.118;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uDepth;      // viewport heights scrolled
uniform float uTime;
uniform vec2 uPointer;     // beam centre, uv
uniform vec3 uStar;        // the pointer the stars drift toward (uv, slow) and how much it is there
uniform vec2 uStarDrag;    // the flow of a finger's drag
uniform float uBeam;       // 0..1 beam strength
uniform float uShaftX;     // borehole x, uv
uniform float uCalm;       // 1: the left side falls to calm dark rock (desktop); 0: none (mobile)
uniform float uDim;        // overall light level of the rock (text sits on top)
uniform float uGeoScale;   // geode size (smaller on narrow screens)
uniform float uGeoShift;   // geode x offset from the borehole, in units of its own width
uniform float uZoom;       // camera: magnification of the wall (1 = page scale)
uniform vec2 uPan;         // camera: world-uv offset (with uZoom: which part of the wall is on screen)
uniform float uShaftLen;  // how far the borehole has been drilled below the surface (world units)
uniform float uGeoPulse;  // geodes brighten and pulse (act 1)
uniform float uRig;       // the drill rig at work (act 1)
uniform vec3 uLayerColor[${WALL_LAYER_COUNT}];
uniform float uLayerTop[${WALL_LAYER_COUNT}];
uniform vec3 uEvidence;
uniform vec3 uCrisis;
uniform vec3 uGround;
uniform vec3 uCity;
uniform vec3 uCityLit;
uniform sampler2D uRock0;
uniform sampler2D uRock1;
uniform sampler2D uRock2;
uniform float uRockMix;   // 0 until the rock textures are loaded, then fades to 1

const float HORIZON = ${WALL_HORIZON.toFixed(3)};
const float BEDS = 10.5;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return noise(p) * 0.55 + noise(p * 2.13 + 7.1) * 0.3 + noise(p * 4.7 + 3.3) * 0.15;
}

// Warped bed coordinate: integer part = bed index, fraction = position inside the bed (0 = its top).
float ridged(vec2 p) {
  float a = 1.0 - abs(noise(p) * 2.0 - 1.0);
  float b = 1.0 - abs(noise(p * 2.3 + 5.2) * 2.0 - 1.0);
  float c = 1.0 - abs(noise(p * 5.1 + 1.7) * 2.0 - 1.0);
  return a * a * 0.55 + b * b * 0.3 + c * c * 0.15;
}

float bedCoord(vec2 p) {
  float w = noise(p * vec2(0.7, 1.1) + 3.1) * 3.4 + noise(p * vec2(2.2, 2.9) + 11.0) * 1.0 + noise(p * vec2(7.0, 9.0)) * 0.18;
  float v = p.y * BEDS + w + p.x * 0.5;
  return v + 0.62 * sin(v * 0.71 + 1.0) + 0.22 * sin(v * 1.9);   // thick beds next to bundles of thin ones
}

// Height of the rock face (0 = recessed, 1 = proud). Each bed is a ledge: proud at its top edge,
// falling back toward its bottom, so the bed below sits in its shadow.
float heightAt(vec2 p) {
  float v = bedCoord(p);
  float b = floor(v);
  float f = fract(v);
  float proud = 0.25 + 0.75 * hash1(b * 1.37);
  float ledge = smoothstep(0.0, 0.05, f) * (1.0 - 0.8 * smoothstep(0.25, 1.0, f));
  float bumps = noise(p * vec2(7.0, 19.0)) * 0.2;
  return clamp(proud * ledge + bumps, 0.0, 1.0);
}

// Fine relief for shading only (too costly inside the march): fractured, craggy rock.
float detailAt(vec2 p) {
  return heightAt(p) + ridged(p * vec2(26.0, 44.0)) * 0.13 + ridged(p * vec2(90.0, 130.0) + 3.0) * 0.05;
}

vec3 layerColor(float y) {
  vec3 c = uLayerColor[0];
  for (int i = 1; i < ${WALL_LAYER_COUNT}; i++) {
    c = mix(c, uLayerColor[i], smoothstep(-0.06, 0.06, y - uLayerTop[i]));
  }
  return c;
}

vec3 earth(float k) {
  // ochre, rust, umber, slate-teal, sand: the tones of hero-descent.png
  vec3 a = vec3(0.62, 0.43, 0.20);
  vec3 b = vec3(0.50, 0.22, 0.13);
  vec3 c = vec3(0.27, 0.20, 0.15);
  vec3 d = vec3(0.17, 0.30, 0.29);
  vec3 e = vec3(0.66, 0.55, 0.36);
  float t = k * 5.0;
  vec3 col = mix(a, b, smoothstep(0.0, 1.0, t));
  col = mix(col, c, smoothstep(1.0, 2.0, t));
  col = mix(col, d, smoothstep(2.0, 3.0, t));
  col = mix(col, e, smoothstep(3.0, 4.0, t));
  return mix(col, a, smoothstep(4.0, 5.0, t));
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// ── Geode interiors (u: -1..1 across the cavity) ─────────────────────────────
vec3 racks(vec2 u) {
  vec3 col = vec3(0.012, 0.02, 0.028) + vec3(0.02, 0.05, 0.06) * smoothstep(0.9, -0.2, u.y);
  float floorY = 0.58;
  float x = (u.x + 0.86) / 1.72 * 7.0;
  float cell = floor(x);
  float fx = fract(x);
  if (cell >= 0.0 && cell < 7.0) {
    float top = -0.7 + 0.16 * hash1(cell + 3.0) + 0.25 * abs(u.x);
    float inX = step(0.1, fx) * step(fx, 0.9);
    if (inX > 0.5 && u.y > top && u.y < floorY) {
      col = vec3(0.09, 0.12, 0.16) * (0.55 + 0.7 * fx) + vec3(0.1, 0.16, 0.2) * smoothstep(0.04, 0.0, u.y - top);
      vec2 g = vec2((fx - 0.1) / 0.8 * 3.0, (u.y - top) / (floorY - top) * 11.0);
      vec2 gi = floor(g);
      vec2 gf = fract(g) - 0.5;
      float on = step(0.42, hash(gi + cell * 7.0 + floor(uTime * 0.6 + hash(gi) * 4.0) * 0.01));
      float dot_ = smoothstep(0.36, 0.14, length(gf * vec2(1.0, 1.5)));
      col += mix(vec3(0.5, 0.9, 1.0), vec3(1.0, 0.9, 0.65), hash(gi + 1.3)) * dot_ * on * 1.5;
    }
  }
  col += vec3(0.4, 0.7, 0.8) * 0.22 * smoothstep(0.3, 0.0, abs(u.y - floorY - 0.05));
  return col;
}

vec3 cityMini(vec2 u) {
  vec3 col = vec3(0.012, 0.016, 0.024) + uCityLit * 0.10 * smoothstep(0.7, -0.4, u.y);
  float floorY = 0.56;
  for (int row = 0; row < 2; row++) {
    float fr = float(row);
    float x = (u.x + 1.0) * (7.0 + fr * 4.0) + fr * 0.37;
    float cell = floor(x);
    float fx = fract(x);
    float centre = 1.0 - abs(u.x) * 0.75;
    float h = (0.3 + 0.85 * hash1(cell + fr * 31.0)) * centre * (1.05 - 0.3 * fr);
    float top = floorY - h;
    if (fx > 0.08 && fx < 0.92 && u.y > top && u.y < floorY) {
      float ember = step(0.86, hash1(cell * 3.7 + fr * 5.0)) * step(0.5, fr) * step(abs(u.x), 0.45);
      vec3 body = mix(uCity * 0.55, uCityLit * 0.7, fr) * (0.6 + 0.5 * fx);
      vec2 g = vec2(fx * 4.0, (u.y - top) * 16.0);
      vec2 gf = fract(g) - 0.5;
      float win = step(0.55, hash(floor(g) + cell)) * smoothstep(0.32, 0.12, max(abs(gf.x), abs(gf.y)));
      body += vec3(1.0, 0.78, 0.48) * win * 0.85 * (1.0 - ember);
      body = mix(body, uCrisis * (0.75 + 0.5 * win + 0.25 * sin(uTime * 1.7 + cell)), ember);
      col = body;
    }
  }
  col = mix(col, uCityLit * 0.22, smoothstep(0.2, 0.55, u.y) * 0.6); // fog in the valley
  return col;
}

vec3 river(vec2 u) {
  vec3 col = vec3(0.01, 0.022, 0.024) + vec3(0.01, 0.05, 0.05) * smoothstep(0.9, -0.3, u.y);
  float y0 = 0.28 * sin(u.x * 3.6 + 0.8) + 0.12 * sin(u.x * 8.0 + 2.0);
  float d = u.y - y0;
  float band = exp(-d * d * 5.0);
  vec2 g = vec2(u.x * 40.0 - uTime * 1.4, d * 9.0);
  vec2 gi = floor(g);
  vec2 gf = fract(g) - 0.5;
  float p = step(0.6, hash(gi)) * smoothstep(0.42, 0.08, length(gf));
  float d2 = d - 0.1 * sin(u.x * 11.0);
  col += uEvidence * (0.3 * band + 1.6 * p * band + 0.5 * exp(-d2 * d2 * 90.0));
  return col;
}

// ── What the lantern reveals inside the rock ─────────────────────────────
float circuits(vec2 q, float v) {
  float b = floor(v);
  float f = fract(v);
  if (hash1(b * 3.1 + 5.0) < 0.14) return 0.0;
  float x = q.x * 11.0 + hash1(b) * 9.0;
  float cx = floor(x);
  float fx = fract(x);
  float o1 = 0.25 + 0.5 * hash(vec2(cx, b));
  float o2 = 0.25 + 0.5 * hash(vec2(cx + 1.0, b));
  float lane = mix(o1, o2, smoothstep(0.78, 0.92, fx));
  float line = smoothstep(0.035, 0.01, abs(f - lane));
  float node = step(0.4, hash(vec2(cx, b + 9.0))) * smoothstep(0.11, 0.05, length(vec2((fx - 0.78) * 0.9, f - o1)));
  return line * 0.75 + node;
}

float wireCube(vec2 q) {
  vec2 g = q * 2.6 + 4.3;
  vec2 gi = floor(g);
  if (hash(gi + 21.0) < 0.45) return 0.0;
  vec2 l = (fract(g) - 0.5) * 3.2 + (vec2(hash(gi), hash(gi + 5.0)) - 0.5) * 1.2;
  vec2 o = vec2(0.22, -0.16);
  float d = 10.0;
  vec2 a = vec2(-0.3, -0.3);
  vec2 s = vec2(0.6, 0.6);
  for (int k = 0; k < 2; k++) {
    vec2 c = a + o * float(k);
    d = min(d, segment(l, c, c + vec2(s.x, 0.0)));
    d = min(d, segment(l, c + vec2(s.x, 0.0), c + s));
    d = min(d, segment(l, c + s, c + vec2(0.0, s.y)));
    d = min(d, segment(l, c + vec2(0.0, s.y), c));
  }
  d = min(d, segment(l, a, a + o));
  d = min(d, segment(l, a + vec2(s.x, 0.0), a + vec2(s.x, 0.0) + o));
  d = min(d, segment(l, a + s, a + s + o));
  d = min(d, segment(l, a + vec2(0.0, s.y), a + vec2(0.0, s.y) + o));
  return smoothstep(0.035, 0.008, d);
}

void main() {
  float aspect = uRes.x / uRes.y;
  // Camera: screen uv → wall uv. Screen-space effects (calm side, lantern) keep using vUv.
  vec2 wuv = (vUv - 0.5) / uZoom + 0.5 + uPan;
  vec2 p = vec2((wuv.x - uShaftX) * aspect, uDepth + (1.0 - wuv.y));
  // The wall is seen from the middle of the screen: points off-centre are seen at an angle.
  vec2 lean = (vUv - 0.5) * vec2(aspect, -1.0) * 0.075;

  vec3 col;
  float horizon = HORIZON + (noise(vec2(p.x * 2.0, 0.0)) - 0.5) * 0.012;

  if (p.y < horizon) {
    // ── Sky: only at the very top of the page ──
    float up = (horizon - p.y) / HORIZON;
    col = mix(vec3(0.020, 0.030, 0.052), vec3(0.006, 0.009, 0.018), smoothstep(0.0, 1.0, up));
    // Stars are far away: they scroll with the page but do not grow when the camera closes in.
    // Two depths of them drift toward the pointer — the nearer layer more — and those close to it
    // glimmer; when the pointer leaves they ease back (STORYBOARD v2.3 §11.1; uStar is a slow spring).
    vec2 suv = vec2((vUv.x - uShaftX) * aspect, uDepth + 1.0 - vUv.y);
    vec2 toP = (uStar.xy - vUv) * vec2(aspect, -1.0);
    float dP = length(toP);
    vec3 stars = vec3(0.0);
    for (int L = 0; L < 2; L++) {
      float near = float(L);
      float pull = uStar.z * mix(0.05, 0.13, near) * smoothstep(0.9, 0.0, dP);
      vec2 sg = (suv - toP * pull - uStarDrag * mix(0.4, 1.0, near)) * mix(340.0, 215.0, near) + near * 17.3;
      vec2 cell = floor(sg);
      float seed = hash(cell);
      float star = step(mix(0.9978, 0.9986, near), seed) * smoothstep(0.45, 0.1, length(fract(sg) - 0.5));
      float twinkle = 0.78 + 0.22 * sin(uTime * (0.5 + 1.7 * hash(cell + 5.0)) + seed * 400.0);
      float glimmer = uStar.z * smoothstep(0.24, 0.0, dP) * (0.6 + 0.4 * sin(uTime * 2.1 + seed * 900.0));
      stars += vec3(0.75, 0.8, 0.95) * star * (0.35 + 0.65 * hash(cell + 3.0)) * twinkle * (1.0 + 1.8 * glimmer) * mix(1.0, 1.25, near);
    }
    col += stars * smoothstep(0.05, 0.5, up);
    float ridge = horizon - 0.006 - noise(vec2(p.x * 3.2 + 4.0, 1.0)) * 0.022;
    if (p.y > ridge) col = vec3(0.010, 0.014, 0.022);
    // Drill rig over the borehole: a small lattice tower, a shed, one warm light.
    vec2 r = vec2(p.x + uRig * 0.0004 * sin(uTime * 37.0), horizon - p.y) / 1.45;   // the rig shudders while it works
    float tower = min(segment(r, vec2(-0.008, 0.0), vec2(0.0, 0.058)), segment(r, vec2(0.008, 0.0), vec2(0.0, 0.058)));
    for (int k = 1; k < 5; k++) {
      float h0 = float(k) * 0.011;
      float w0 = 0.008 * (1.0 - h0 / 0.058);
      tower = min(tower, segment(r, vec2(-w0, h0), vec2(w0, h0 + 0.006)));
    }
    col = mix(col, vec3(0.05, 0.055, 0.06), smoothstep(0.0016, 0.0006, tower));
    if (r.x > 0.014 && r.x < 0.034 && r.y < 0.009) col = vec3(0.04, 0.042, 0.046);
    vec2 lamp = r - vec2(0.012, 0.012);
    float lampLevel = 1.0 + uRig * (0.9 + 0.6 * sin(uTime * 11.0));
    col += vec3(1.0, 0.72, 0.4) * lampLevel * (smoothstep(0.0022, 0.0008, length(lamp)) * 1.4 + 0.012 / (dot(lamp, lamp) * 900.0 + 0.06));
  } else {
    // ── Rock ──
    vec2 q = p;
    float hq = heightAt(p);
#if WALL_STEPS > 0
    float stepT = 1.0 / float(WALL_STEPS);
    float t = 0.0;
    float prevH = hq;
    for (int i = 0; i < WALL_STEPS; i++) {
      vec2 s = p + lean * t;
      float h = heightAt(s);
      if (h >= 1.0 - t) {
        float over = h - (1.0 - t);
        float before = (1.0 - (t - stepT)) - prevH;
        float back = clamp(over / (over + before + 1e-4), 0.0, 1.0) * stepT;
        q = p + lean * (t - back);
        hq = h;
        break;
      }
      prevH = h;
      t += stepT;
      q = s;
      hq = h;
    }
#endif
    float v = bedCoord(q);
    float b = floor(v);
    float f = fract(v);

    // Normal from the height field; light falls from above (world y grows downward).
#if WALL_STEPS > 0
    float e = 0.0016;
    float hx = detailAt(q + vec2(e, 0.0)) - detailAt(q - vec2(e, 0.0));
    float hy = detailAt(q + vec2(0.0, e)) - detailAt(q - vec2(0.0, e));
    vec3 n = normalize(vec3(-hx, -hy, e * 2.0 * 9.0));
#else
    // Low tier: forward differences of the coarse height only (a third of the noise lookups).
    float e = 0.003;
    float hx = heightAt(q + vec2(e, 0.0)) - hq;
    float hy = heightAt(q + vec2(0.0, e)) - hq;
    vec3 n = normalize(vec3(-hx, -hy, e * 7.0));
#endif
    // Rock texture (medium/high): it follows the bedding, one of three rock types per bed.
    float rockTone = 1.0;
#if WALL_STEPS > 0
    if (uRockMix > 0.001) {
      vec2 tuv = vec2(q.x * 1.25 + hash1(b * 7.3) * 5.0, v / BEDS * 1.25);
      float pick = hash1(b * 4.1 + 9.0);
      vec3 tx = pick < 0.42 ? texture2D(uRock0, tuv).xyz : (pick < 0.74 ? texture2D(uRock1, tuv).xyz : texture2D(uRock2, tuv).xyz);
      n = normalize(n + vec3((tx.xy - 0.5) * 2.6 * uRockMix, 0.0));
      rockTone = mix(1.0, 0.35 + 1.3 * tx.z, uRockMix);
    }
#endif
    vec3 L = normalize(vec3(0.3, -0.8, 0.42));
    float diff = max(dot(n, L), 0.0);
    diff = diff * diff * 1.5;

    float shadow = 1.0;
#if WALL_SHADOW > 0
    for (int i = 1; i <= WALL_SHADOW; i++) {
      float k = float(i) / float(WALL_SHADOW);
      float hs = heightAt(q + vec2(0.22, -0.85) * 0.06 * k);
      shadow = min(shadow, 1.0 - smoothstep(0.0, 0.25, hs - (hq + k * 0.75)) );
    }
#else
    shadow = 0.55 + 0.45 * smoothstep(0.0, 0.3, f); // painted shadow under each ledge
#endif

    float tone = hash1(b * 2.3 + 1.0);
    vec3 albedo = mix(earth(hash1(b * 5.7 + 2.0)), layerColor(q.y), 0.3) * (0.45 + 0.8 * tone);
    albedo *= mix(0.35, 1.0, smoothstep(0.0, 0.05, f));                      // seam
    albedo *= 0.86 + 0.14 * sin(v * 52.0 + noise(q * 7.0) * 7.0);            // laminae
#if WALL_STEPS > 0
    albedo *= mix(0.7 + 0.6 * ridged(q * vec2(60.0, 95.0)), 1.0, uRockMix * 0.8) * rockTone;   // grain: procedural until the texture arrives
#else
    albedo *= 0.75 + 0.5 * noise(q * vec2(60.0, 95.0));
#endif
    albedo *= 0.85 + 0.3 * hash(floor(q * vec2(520.0, 900.0)));              // grit
    float topsoil = smoothstep(0.022, 0.0, q.y - horizon);
    albedo = mix(albedo, vec3(0.05, 0.065, 0.035), topsoil);

    float dx = abs(q.x);
    float calm = mix(1.0, smoothstep(0.24, 0.6, vUv.x), uCalm);
    float level = mix(0.035, 1.0, calm * calm) * uDim;

    vec3 light = vec3(0.03, 0.033, 0.04) + vec3(0.62, 0.6, 0.56) * diff * shadow;
    // The borehole lights the rock beside it — only as far down as it has been drilled.
    float side = clamp(0.5 + 0.5 * n.x * sign(-q.x) * 3.0, 0.0, 1.0);
    float drilled = smoothstep(horizon + uShaftLen + 0.08, horizon + uShaftLen - 0.02, q.y);
    light += uEvidence * (1.5 * exp(-dx * 14.0) + 0.16 * exp(-dx * 3.5)) * (0.35 + 1.0 * side) * drilled;
    col = albedo * light * level;

    // ── Geodes ──
    float rockFace = 1.0;   // 0 inside a cavity: the lantern lights rock, not the miniatures
    for (int gi = 0; gi < 3; gi++) {
      vec2 c = gi == 0 ? vec2(-0.29, 0.305) : (gi == 1 ? vec2(-0.35, 0.515) : vec2(-0.32, 0.735));
      vec2 r = (gi == 0 ? vec2(0.250, 0.068) : (gi == 1 ? vec2(0.300, 0.082) : vec2(0.330, 0.062))) * uGeoScale;
      c.x *= uGeoShift * uGeoScale;
      vec2 gq = (q - c) / r;
      if (dot(gq, gq) > 16.0) continue;                          // far from this geode: nothing to add
      float d = length(gq) - 1.0 + (noise(q * 9.0 + float(gi) * 5.0) - 0.5) * 0.42 + (noise(q * 31.0) - 0.5) * 0.16 + (hq - 0.4) * 0.12;
      vec3 glowCol = gi == 0 ? vec3(0.5, 0.8, 0.9) : (gi == 1 ? mix(uCityLit, vec3(1.0, 0.75, 0.45), 0.45) : uEvidence);
      if (d < 0.0) {
        vec2 u = ((p + lean * 2.6) - c) / r;                     // the miniature sits behind the rock face
        vec3 inside = gi == 0 ? racks(u) : (gi == 1 ? cityMini(u) : river(u));
        // Cave wall behind the miniature: the same rock, far darker, lit by what is inside.
        vec3 cave = albedo * glowCol * (0.10 + 0.5 * smoothstep(0.0, -0.5, d)) * 0.55;
        inside = max(inside, cave * 0.6);
        float edge = smoothstep(-0.5, 0.0, d);
        float roof = smoothstep(0.1, -0.9, gq.y);                // the overhang shades the top of the cavity
        inside *= (1.0 - 0.9 * edge * edge) * (1.0 - roof * 0.75);
        inside *= 1.0 + uGeoPulse * (0.7 + 0.5 * sin(uTime * 2.4 + float(gi) * 1.7));
        col = mix(inside * mix(0.4, 1.0, calm) * min(1.0, uDim * 1.5), col * 0.25, smoothstep(-0.05, 0.0, d));
        rockFace = min(rockFace, smoothstep(-0.05, 0.0, d));
      } else {
        // The lower lip catches the light from inside; the rock above stays dark.
        float lip = exp(-d * 7.0) * (0.35 + 0.65 * smoothstep(-0.3, 0.6, gq.y));
        col += albedo * glowCol * (0.9 * lip + 0.25 * exp(-d * 2.2)) * mix(0.25, 1.0, calm) * uDim;
        col *= 1.0 - 0.55 * smoothstep(0.1, 0.0, d);             // contact shadow at the rim
      }
    }

    // ── Lantern ──
    vec2 bp = (vUv - uPointer) * vec2(aspect, 1.0);
    float beam = uBeam * smoothstep(0.36, 0.1, length(bp));
    if (beam > 0.001) {
      vec3 warm = vec3(1.0, 0.8, 0.54);
      col += albedo * warm * (0.4 + 1.5 * diff * shadow) * beam * 1.5 * rockFace;
      float reveal = beam * beam * rockFace;
      float veins = circuits(q, v) + circuits(q * 1.7 + 3.0, v * 1.6 + 5.0) * 0.8 + circuits(q * 2.9 + 7.0, v * 2.7 + 3.0) * 0.6
        + wireCube(q) + wireCube(q * 1.7 + 3.0) * 0.85 + wireCube(q * 2.9 + 8.0) * 0.6;
      vec2 sp = q * 150.0;
      veins += step(0.992, hash(floor(sp))) * smoothstep(0.5, 0.15, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sp)) * 6.28));
      col = mix(col, col * 0.7 + uEvidence * 0.06, reveal * 0.55);                 // the rock turns glassy
      col += uEvidence * veins * reveal * 1.25;
    }

    // ── Borehole ──
    float below = smoothstep(horizon - 0.002, horizon + 0.004, p.y) * smoothstep(horizon + uShaftLen + 0.004, horizon + uShaftLen - 0.004, p.y);
    // The drill bit: a bright point at the bottom of the shaft while it is still being drilled.
    vec2 bit = vec2(p.x, p.y - horizon - uShaftLen);
    col += uEvidence * 1.8 * exp(-dot(bit, bit) / 0.00003) * step(uShaftLen, 5.0) * step(0.0, uShaftLen);
    float px = abs(p.x);
    float joint = smoothstep(0.012, 0.0, abs(fract(p.y * 2.6 + 0.3) - 0.5) - 0.006);
    float core = exp(-px * px / (0.0032 * 0.0032));
    float pulse = 0.9 + 0.1 * sin(p.y * 40.0 - uTime * 2.2);
    // It breathes, irregularly (1/f-like flicker, STORYBOARD v2.1 §8.5; the same sum as worlds/kit.ts).
    float breath = 0.5 + (sin(uTime * 0.31) + 0.707 * sin(uTime * 0.83 + 1.3) + 0.577 * sin(uTime * 1.97 + 2.1) + 0.5 * sin(uTime * 4.13 + 0.7) + 0.447 * sin(uTime * 8.71 + 4.2)) / 6.462;
    col += uEvidence * (1.5 * core * pulse + 0.30 * exp(-px * 60.0) + 0.07 * exp(-px * 9.0)) * below * (0.84 + 0.16 * breath);
    col = mix(col, vec3(0.16, 0.2, 0.21) + uEvidence * 0.25, joint * smoothstep(0.0075, 0.0055, px) * below);
  }

  // Sink to the page colour at the far edges so the HTML sits on the same ground.
  col = max(col, uGround * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type WallMaterial = ShaderMaterial & {
  uniforms: {
    uRes: { value: Vector2 };
    uDepth: { value: number };
    uTime: { value: number };
    uPointer: { value: Vector2 };
    uStar: { value: Vector3 };
    uStarDrag: { value: Vector2 };
    uBeam: { value: number };
    uShaftX: { value: number };
    uCalm: { value: number };
    uDim: { value: number };
    uGeoScale: { value: number };
    uGeoShift: { value: number };
    uZoom: { value: number };
    uPan: { value: Vector2 };
    uShaftLen: { value: number };
    uGeoPulse: { value: number };
    uRig: { value: number };
    uLayerTop: { value: number[] };
    uRock0: { value: Texture | null };
    uRock1: { value: Texture | null };
    uRock2: { value: Texture | null };
    uRockMix: { value: number };
  };
};

export type WallUniforms = WallMaterial['uniforms'] & Record<string, { value: unknown }>;

/** One set of uniforms shared by every tier's material, so switching tier needs no re-sync. */
export function createWallUniforms(ids: readonly string[]): WallUniforms {
  const colors = Array.from({ length: WALL_LAYER_COUNT }, (_, i) => new Color(layer[(ids[i] ?? 'next') as keyof typeof layer] ?? layer.next));
  return {
    uRes: { value: new Vector2(1, 1) },
    uDepth: { value: 0 },
    uTime: { value: 0 },
    uPointer: { value: new Vector2(0.7, 0.5) },
    uStar: { value: new Vector3(0.5, 0.5, 0) },
    uStarDrag: { value: new Vector2() },
    uBeam: { value: 0 },
    uShaftX: { value: 0.8 },
    uCalm: { value: 1 },
    uDim: { value: 1 },
    uGeoScale: { value: 1 },
    uGeoShift: { value: 1 },
    uZoom: { value: 1 },
    uPan: { value: new Vector2(0, 0) },
    uShaftLen: { value: 1000 },
    uGeoPulse: { value: 0 },
    uRig: { value: 0 },
    uLayerColor: { value: colors },
    uLayerTop: { value: Array.from({ length: WALL_LAYER_COUNT }, (_, i) => i * 2) },
    uEvidence: { value: new Color(signal.evidence) },
    uCrisis: { value: new Color(signal.crisis) },
    uGround: { value: new Color(base.ground) },
    uCity: { value: new Color(city.building) },
    uCityLit: { value: new Color(city.buildingLit) },
    uRock0: { value: null },
    uRock1: { value: null },
    uRock2: { value: null },
    uRockMix: { value: 0 },
  };
}

/** The wall material of one tier. Pass shared uniforms to keep several tiers in step. */
export function createWallMaterial(quality: WallQuality, idsOrUniforms: readonly string[] | WallUniforms): WallMaterial {
  const steps = STEPS[quality];
  const uniforms = Array.isArray(idsOrUniforms) ? createWallUniforms(idsOrUniforms as readonly string[]) : (idsOrUniforms as WallUniforms);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: { WALL_STEPS: steps.march, WALL_SHADOW: steps.shadow },
    depthTest: false,
    depthWrite: false,
    uniforms,
  });
  return material as unknown as WallMaterial;
}

/** Framing that depends on the viewport shape: borehole position, calm side, geode size. */
export function frameWall(material: WallMaterial, width: number, height: number): void {
  const u = material.uniforms;
  u.uRes.value.set(width, height);
  const wide = width / height > 1.15;
  u.uShaftX.value = wide ? 0.8 : 0.5;
  u.uCalm.value = wide ? 1 : 0;
  u.uGeoScale.value = wide ? 1 : Math.min(1, (width / height) * 1.15);
  u.uGeoShift.value = wide ? 1 : 0;
}
