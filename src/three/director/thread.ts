/**
 * The thread of evidence (STORYBOARD v2.3 §10-C): from a big number under the pointer, a thin
 * cyan thread of light runs through the scene into the depth of the rock, to where its evidence
 * lies. Clicked, the camera follows the thread a little way before the evidence opens.
 *
 * One line in camera space (it is drawn in front of the camera wherever the camera is), grown and
 * withdrawn by a spring; the curve is rebuilt only when another number is pointed at.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three';

const SEGMENTS = 56;

export function createThread() {
  const positions = new Float32Array(SEGMENTS * 2 * 3);
  const along = new Float32Array(SEGMENTS * 2);
  for (let i = 0; i < SEGMENTS; i += 1) {
    along[i * 2] = i / SEGMENTS;
    along[i * 2 + 1] = (i + 1) / SEGMENTS;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aT', new BufferAttribute(along, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: { uGrow: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGrow;
      uniform float uTime;
      varying float vT;
      void main() {
        float shown = smoothstep(uGrow, uGrow - 0.06, vT);
        float pulse = 0.55 + 0.45 * smoothstep(0.92, 1.0, sin(vT * 34.0 - uTime * 3.2) * 0.5 + 0.5);
        float tip = smoothstep(0.1, 0.0, abs(vT - uGrow)) * 1.6;
        gl_FragColor = vec4(vec3(0.56, 0.8, 0.82) * (pulse + tip) * shown * (1.0 - 0.55 * vT) * step(0.001, uGrow), 1.0);
      }`,
  });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 12;
  lines.visible = false;
  lines.matrixAutoUpdate = false;

  const p0 = new Vector3();
  const p1 = new Vector3();
  const p2 = new Vector3();
  const p3 = new Vector3();
  const out = new Vector3();
  let key = '';
  const at = (t: number, target: Vector3) => {
    const u = 1 - t;
    return target.set(
      u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    );
  };

  return {
    lines,
    material,
    /**
     * `x`, `y`: the number on screen (NDC); `seed`: which number (where its evidence lies);
     * `grow` 0–1. Returns, in `follow`, the camera-space point `amount` of the way along the thread.
     */
    frame(camera: PerspectiveCamera, x: number, y: number, seed: number, grow: number, time: number, followAt: number, follow: Vector3) {
      lines.visible = grow > 0.002;
      follow.set(0, 0, 0);
      if (!lines.visible) return;
      const k = `${x.toFixed(3)}:${y.toFixed(3)}:${seed}:${camera.fov.toFixed(1)}:${camera.aspect.toFixed(3)}`;
      if (k !== key) {
        key = k;
        const d = 3;
        const half = Math.tan((camera.fov * Math.PI) / 360) * d;
        p0.set(x * half * camera.aspect, y * half, -d);
        const side = seed % 2 ? 1 : -1;
        const h = (n: number) => {
          const s = Math.sin((seed + 1) * n) * 43758.5453;
          return s - Math.floor(s);
        };
        p3.set(side * (14 + 16 * h(12.9)), -12 - 12 * h(78.2), -55 - 25 * h(37.7));
        p1.set(p0.x * 0.6, p0.y + 0.5, -9);
        p2.set(p3.x * 0.3, p3.y + 12, p3.z + 30);
        const a = new Vector3();
        const b = new Vector3();
        for (let i = 0; i < SEGMENTS; i += 1) {
          at(i / SEGMENTS, a);
          at((i + 1) / SEGMENTS, b);
          positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        }
        (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      }
      lines.matrix.copy(camera.matrixWorld);
      lines.matrixWorld.copy(camera.matrixWorld);
      material.uniforms.uGrow!.value = grow;
      material.uniforms.uTime!.value = time;
      if (followAt > 0) {
        at(followAt, out);
        follow.copy(out).sub(p0).applyQuaternion(camera.quaternion);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export type Thread = ReturnType<typeof createThread>;
