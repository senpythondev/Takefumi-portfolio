/**
 * Act 6 — the bedrock (礎, STORYBOARD v2.1 §4): principles read by light.
 *
 * A dark wall of bedrock. Only where the visitor's warm light falls (the lantern of act 0;
 * touch: it drifts and follows a drag) do the three carved principles appear — and the scroll
 * lights them in order too, so nothing depends on the pointer. Then one streak of light runs
 * through the rock from left to right: from Helsinki to the work in Finland and Japan.
 * The principles are the act's HTML list, carved here from that text.
 */
import { CanvasTexture, Color, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { COLORS, FLUCT_GLSL, disposeGroup, mix, motes, rng, seg, setPose, storyOf, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const PW = 18;
const PH = 10;
const LINES = [0.66, 0.5, 0.34];

export default function createBedrock(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(909);
  const creeds = [...ctx.section.querySelectorAll('.creeds li')].map((li) => li.textContent?.trim() ?? '');
  const font = getComputedStyle(ctx.section.querySelector('.act-headline') ?? document.body).fontFamily || 'serif';

  // The principles, carved: a canvas of white letters used as a height map.
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1138;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    creeds.forEach((text, i) => {
      let size = 120;
      c.font = `600 ${size}px ${font}`;
      while (c.measureText(text).width > canvas.width * 0.7 && size > 40) {
        size -= 6;
        c.font = `600 ${size}px ${font}`;
      }
      c.fillText(text, canvas.width / 2, (1 - (LINES[i] ?? 0.5)) * canvas.height);
    });
  }
  const carved = new CanvasTexture(canvas);

  const material = new ShaderMaterial({
    uniforms: {
      uText: { value: carved },
      uLight: { value: new Vector2(0.5, 0.5) },
      uLight2: { value: new Vector2(-1, -1) },
      uRadius: { value: 0.16 },
      uFade: { value: 0 },
      uTime: { value: 0 },
      uStreak: { value: -1 },
      uWarm: { value: new Color('#ffd7a3') },
      uCyan: { value: COLORS.evidence.clone() },
      uTexel: { value: new Vector2(1 / 2048, 1 / 1138) },
      uAspect: { value: PW / PH },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${FLUCT_GLSL}
      uniform sampler2D uText;
      uniform vec2 uLight;
      uniform vec2 uLight2;
      uniform float uRadius;
      uniform float uFade;
      uniform float uTime;
      uniform float uStreak;
      uniform vec3 uWarm;
      uniform vec3 uCyan;
      uniform vec2 uTexel;
      uniform float uAspect;
      varying vec2 vUv;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        float rock = fbm(p * 3.2) * 0.6 + fbm(p * 11.0) * 0.4;
        float beds = 0.5 + 0.5 * sin(vUv.y * 40.0 + fbm(p * 2.0) * 6.0);
        vec3 col = vec3(0.07, 0.065, 0.06) * (0.6 + 0.8 * rock) * (0.85 + 0.15 * beds);
        // Light: the visitor's lantern and the scroll's own light.
        float d1 = distance(vec2(vUv.x * uAspect, vUv.y), vec2(uLight.x * uAspect, uLight.y));
        float d2 = distance(vec2(vUv.x * uAspect, vUv.y), vec2(uLight2.x * uAspect, uLight2.y));
        float lit = max(smoothstep(uRadius * 1.2, uRadius * 0.15, d1), smoothstep(uRadius * 1.35, uRadius * 0.2, d2));
        lit *= 0.85 + 0.15 * fluct(uTime * 1.5, 0.2);
        // Carved letters: a groove (darker) with a lit upper edge, only in the light.
        float h = texture2D(uText, vUv).r;
        float hu = texture2D(uText, vUv + vec2(0.0, uTexel.y * 3.0)).r;
        float carve = h * 0.75;
        float rim = clamp(hu - h, 0.0, 1.0);
        vec3 lightCol = uWarm * (0.35 + 0.9 * rock);
        col = mix(col, col * 0.4 + lightCol * 0.55, lit);
        col -= carve * lit * 0.35;
        col += uWarm * rim * lit * 1.3;
        // Faint cyan veins in the lit rock (lantern.png).
        float vein = smoothstep(0.015, 0.0, abs(fbm(p * 5.0 + 3.0) - 0.5)) * lit;
        col += uCyan * vein * 0.35;
        // From Helsinki: one streak of light runs through the rock.
        float sy = 0.14 + 0.01 * sin(vUv.x * 20.0);
        float streak = exp(-pow((vUv.y - sy) / 0.004, 2.0)) * smoothstep(uStreak - 0.35, uStreak, vUv.x) * step(vUv.x, uStreak);
        col += uCyan * streak * 1.6 + vec3(1.0) * streak * smoothstep(uStreak - 0.02, uStreak, vUv.x);
        gl_FragColor = vec4(col * uFade, 1.0);
      }`,
  });
  const plane = new Mesh(new PlaneGeometry(PW, PH), material);
  group.add(plane);
  const dust = motes(ctx.count(400), [16, 8, 3], [0, 0, 1.5], new Color('#ffd7a3'), 1.0, 41);
  group.add(dust.points);

  const pose = (p: number, wide: boolean, out: Pose) => {
    const t = seg(p, 0.15, 0.85);
    setPose(out, [mix(-0.3, 0.3, t), 0, (wide ? 10.5 : 19) - t * 0.8], [0, 0, 0], wide ? 42 : 50);
  };

  const light = new Vector2(0.5, 0.5);
  const target = new Vector2();
  const ray = new Vector3();
  const hit = new Vector3();
  const auto = new Vector2(-1, -1);
  const off = new Vector2(-1, -1);

  return {
    group,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) out.set([(r() - 0.5) * PW * 0.8, (r() - 0.5) * PH * 0.8, 0], i * 3);
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const { camera, time, dt } = input;
      if (input.pointerOn) {
        ray.set(input.pointer.x, input.pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
        const t = -camera.position.z / (ray.z || -1);
        hit.copy(camera.position).addScaledVector(ray, t);
        target.set(hit.x / PW + 0.5, hit.y / PH + 0.5);
      } else target.set(0.5 + Math.sin(time * 0.21) * 0.28, 0.5 + Math.sin(time * 0.29 + 1) * 0.2);
      light.lerp(target, 1 - Math.exp(-dt * (input.pointerOn ? 9 : 1.2)));
      // The scroll lights the principles in order, so nothing depends on the pointer.
      const k = q < 0.3 ? 0 : q < 0.55 ? 1 : 2;
      const sweep = seg(q, [0.05, 0.3, 0.55][k] as number, [0.28, 0.53, 0.75][k] as number, (x) => x);
      auto.set(mix(0.3, 0.7, sweep), LINES[k] as number);
      material.uniforms.uLight!.value = light;
      material.uniforms.uLight2!.value = q < 0.78 ? auto : off;
      material.uniforms.uStreak!.value = q > 0.76 ? seg(q, 0.78, 0.97, (x) => x) * 1.3 : -1;
      material.uniforms.uFade!.value = input.fade;
      material.uniforms.uTime!.value = time;
      input.attr('data-step', String(k + 1));
      dust.material.uniforms.uTime!.value = time;
      dust.material.uniforms.uFade!.value = input.fade * 0.6;
      dust.material.uniforms.uPx!.value = input.px;
    },
    dispose() {
      carved.dispose();
      disposeGroup(group);
    },
  };
}
