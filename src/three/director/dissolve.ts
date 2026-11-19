/**
 * Entry and return of every world (STORYBOARD v2.1 §3, after Sixfold): the polished cut face that
 * fills the screen breaks into particles, which drift and re-form as the world's silhouette — and
 * back. One point cloud, positioned in camera space: the camera can jump from the core to the
 * world's own pose behind it without a cut.
 *
 * - `aFrom`: a disk filling the screen (the cut face), coloured like its bedding in the band's tint.
 * - `aTo`: the world's `shape()` points, carried into the view space of the world's entry (or
 *   return) camera pose.
 * - `uMorph` 0→1 moves them, each with its own delay and a curl of drift (eased per particle);
 *   `uAlpha` shows the cloud only while it is the picture.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Matrix4, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three';
import { FLUCT_GLSL, rng, type Pose } from '../worlds/kit';

export type Dissolve = ReturnType<typeof createDissolve>;

export function createDissolve(count: number) {
  const r = rng(29);
  const from = new Float32Array(count * 3);
  const to = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const shade = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    // A unit disk (scaled in the shader to cover the screen), denser toward the middle.
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    from[i * 3] = Math.cos(a) * d;
    from[i * 3 + 1] = Math.sin(a) * d;
    from[i * 3 + 2] = 0;
    for (let k = 0; k < 4; k += 1) seed[i * 4 + k] = r();
    shade[i] = r();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(from, 3));
  g.setAttribute('aTo', new BufferAttribute(to, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 4));
  g.setAttribute('aShade', new BufferAttribute(shade, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uMorph: { value: 0 },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uPx: { value: 1 },
      uDisk: { value: new Vector3(1, 1, 5) }, // radius x, radius y, distance
      uTint: { value: new Color('#988979') },
      uTarget: { value: new Color('#8fcbd0') },
    },
    vertexShader: /* glsl */ `
      ${FLUCT_GLSL}
      attribute vec3 aTo;
      attribute vec4 aSeed;
      attribute float aShade;
      uniform float uMorph;
      uniform float uTime;
      uniform float uPx;
      uniform vec3 uDisk;
      uniform vec3 uTint;
      uniform vec3 uTarget;
      varying vec3 vColor;
      varying float vA;
      void main() {
        vec3 a = vec3(position.xy * uDisk.xy, -uDisk.z);
        float delay = aSeed.x * 0.45;
        float t = clamp((uMorph - delay) / 0.55, 0.0, 1.0);
        float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
        vec3 p = mix(a, aTo, e);
        // A curl of drift on the way, strongest half way (no straight lines).
        float sw = sin(3.14159 * e);
        p += sw * vec3(sin(aSeed.y * 6.283 + uTime * 0.7), cos(aSeed.z * 6.283 + uTime * 0.6), sin(aSeed.w * 6.283 + uTime * 0.5)) * (0.25 + 0.6 * aSeed.x) * (0.4 + 0.12 * abs(p.z));
        vec4 mv = vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.6 + 4.2 * aSeed.y) * uPx * (6.0 / max(0.4, -mv.z));
        // The face's bedding: horizontal beds of the band's tint, a few brighter grains.
        float bed = 0.55 + 0.45 * sin(position.y * 9.0 + sin(position.x * 3.0 + aSeed.w) * 1.2);
        vec3 face = uTint * (0.6 + 0.9 * bed * aShade) + vec3(0.15) * step(0.94, aShade);
        vColor = mix(face, uTarget * (0.7 + 0.6 * aShade), e);
        vA = 0.55 + 0.45 * fluct(uTime * 2.0, aSeed.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying vec3 vColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vColor * 1.7 * a * vA * uAlpha, 1.0);
      }`,
  });
  const points = new Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = 10;
  points.visible = false;

  const view = new Matrix4();
  const cam = new PerspectiveCamera();
  const v = new Vector3();
  let target: string | null = null;

  return {
    points,
    material,
    count,
    /**
     * Carry a world's silhouette into the view space of `pose` (only when the world, the pose or
     * the orientation changed).
     */
    setTarget(key: string, shape: Float32Array, pose: Pose) {
      if (key === target) return;
      target = key;
      cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      cam.lookAt(pose.look[0], pose.look[1], pose.look[2]);
      cam.updateMatrixWorld();
      view.copy(cam.matrixWorldInverse);
      const attr = g.getAttribute('aTo') as BufferAttribute;
      const arr = attr.array as Float32Array;
      const n = Math.min(count, shape.length / 3);
      for (let i = 0; i < count; i += 1) {
        const k = (i % n) * 3;
        v.set(shape[k] ?? 0, shape[k + 1] ?? 0, shape[k + 2] ?? 0).applyMatrix4(view);
        arr[i * 3] = v.x;
        arr[i * 3 + 1] = v.y;
        arr[i * 3 + 2] = v.z;
      }
      attr.needsUpdate = true;
    },
    /** Size the face disk to cover the screen at the camera's field of view. */
    frame(fovDeg: number, aspect: number, time: number, px: number) {
      const dist = 5;
      const half = Math.tan((fovDeg * Math.PI) / 360) * dist;
      const r = half * Math.sqrt(1 + aspect * aspect) * 1.02;
      (material.uniforms.uDisk!.value as Vector3).set(r, r, dist);
      material.uniforms.uTime!.value = time;
      material.uniforms.uPx!.value = px;
    },
    dispose() {
      g.dispose();
      material.dispose();
    },
  };
}
