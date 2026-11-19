/**
 * The small holograms above the bands (STORYBOARD v2.1 §1, §4 act 7; docs/concept/core-lab.png):
 * a thin cyan wireframe of each section's world, one per band, linked to it by a line. Shown for
 * the hovered band in the index and for every band in the finale. Its own small lazy chunk.
 *
 * Every hologram maps to a real section (ART_DIRECTION: no generic icons), drawn with line segments
 * only, about one unit across, standing on y = 0.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, LineSegments, ShaderMaterial } from 'three';

type Seg = number[]; // x1 y1 z1 x2 y2 z2 …

const box = (s: Seg, cx: number, cz: number, w: number, d: number, h: number, y0 = 0) => {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const y1 = y0 + h;
  const c = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const;
  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = c[i] as readonly [number, number];
    const [bx, bz] = c[(i + 1) % 4] as readonly [number, number];
    s.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz, ax, y0, az, ax, y1, az);
  }
};
const ring = (s: Seg, cx: number, cy: number, cz: number, r: number, n = 24, axis: 'y' | 'z' = 'y') => {
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    if (axis === 'y') s.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cy, cz + Math.sin(b) * r);
    else s.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz, cx + Math.cos(b) * r, cy + Math.sin(b) * r, cz);
  }
};
const curve = (s: Seg, f: (t: number) => [number, number, number], n = 24) => {
  for (let i = 0; i < n; i += 1) s.push(...f(i / n), ...f((i + 1) / n));
};

/** One builder per band, surface (0) to the next layer (10). */
const BUILDERS: ((s: Seg) => void)[] = [
  // 0 surface: the rig over the borehole, the ground line.
  (s) => {
    s.push(-0.5, 0.15, 0, 0.5, 0.15, 0, 0, 0.15, 0, 0, -0.1, 0);
    s.push(-0.08, 0.15, 0, 0, 0.75, 0, 0.08, 0.15, 0, 0, 0.75, 0, -0.05, 0.4, 0, 0.05, 0.4, 0);
  },
  // 1 current: unknown terrain.
  (s) => {
    const h = (x: number, z: number) => 0.18 + 0.12 * Math.sin(x * 5 + 1) * Math.cos(z * 4) + 0.05 * Math.sin(x * 11 + z * 7);
    for (let i = 0; i <= 6; i += 1)
      for (let j = 0; j < 6; j += 1) {
        const x = -0.5 + i / 6;
        const z0 = -0.4 + j / 7.5;
        const z1 = -0.4 + (j + 1) / 7.5;
        s.push(x, h(x, z0), z0, x, h(x, z1), z1);
        s.push(z0 * 1.25, h(z0 * 1.25, x * 0.8), x * 0.8, z1 * 1.25, h(z1 * 1.25, x * 0.8), x * 0.8);
      }
  },
  // 2 genten: three lanes through gates.
  (s) => {
    for (const x of [-0.3, 0, 0.3]) s.push(x, 0, 0.5, x, 0, -0.5);
    for (let g = 0; g < 5; g += 1) {
      const z = 0.4 - g * 0.2;
      for (const x of [-0.3, 0, 0.3]) s.push(x - 0.1, 0, z, x - 0.1, 0.22, z, x - 0.1, 0.22, z, x + 0.1, 0.22, z, x + 0.1, 0.22, z, x + 0.1, 0, z);
    }
  },
  // 3 site migration: two towns and the river of light between them.
  (s) => {
    box(s, -0.35, 0, 0.25, 0.25, 0.18);
    box(s, 0.35, 0, 0.22, 0.25, 0.4);
    curve(s, (t) => [-0.22 + t * 0.44, 0.08 + 0.05 * Math.sin(t * 9), 0.08 * Math.sin(t * 5)]);
  },
  // 4 PHP audit: the city.
  (s) => {
    const hs = [0.25, 0.45, 0.2, 0.6, 0.3, 0.35, 0.18, 0.5, 0.28];
    hs.forEach((h, i) => box(s, -0.36 + (i % 3) * 0.36, -0.3 + Math.floor(i / 3) * 0.3, 0.16, 0.16, h));
  },
  // 5 auction: eight CPU pillars of light.
  (s) => {
    ring(s, 0, 0, 0, 0.42, 32);
    for (let i = 0; i < 8; i += 1) {
      const x = -0.42 + (i / 7) * 0.84;
      s.push(x, 0, 0, x, 0.65, 0);
    }
  },
  // 6 patent: the glass pipe and its four stations.
  (s) => {
    curve(s, (t) => [-0.5 + t, 0.25 + 0.12 * Math.sin(t * 6), 0.05]);
    curve(s, (t) => [-0.5 + t, 0.35 + 0.12 * Math.sin(t * 6), 0.05]);
    for (let k = 0; k < 4; k += 1) {
      const t = 0.15 + k * 0.23;
      box(s, -0.5 + t, 0.05, 0.08, 0.08, 0.08, 0.26 + 0.12 * Math.sin(t * 6));
    }
  },
  // 7 deep: eight thin sections around an upright core.
  (s) => {
    s.push(0, 0, 0, 0, 0.8, 0);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const y = 0.08 + i * 0.08;
      const cx = Math.cos(a) * 0.38;
      const cz = Math.sin(a) * 0.38;
      const tx = -Math.sin(a) * 0.1;
      const tz = Math.cos(a) * 0.1;
      s.push(cx - tx, y, cz - tz, cx + tx, y, cz + tz, cx + tx, y, cz + tz, cx + tx, y + 0.12, cz + tz, cx + tx, y + 0.12, cz + tz, cx - tx, y + 0.12, cz - tz, cx - tx, y + 0.12, cz - tz, cx - tx, y, cz - tz);
    }
  },
  // 8 catch-up: the borehole rushing past.
  (s) => {
    for (let i = 0; i < 6; i += 1) ring(s, 0, 0.35, -0.5 + i * 0.2, 0.12 + i * 0.05, 20, 'z');
    s.push(0, 0.35, -0.6, 0, 0.35, 0.6);
  },
  // 9 bedrock: three creeds carved in rock.
  (s) => {
    for (let k = 0; k < 3; k += 1) s.push(-0.4, 0.2 + k * 0.16, 0, 0.4 - k * 0.1, 0.2 + k * 0.16, 0);
    curve(s, (t) => [-0.5 + t, 0.02 * Math.sin(t * 20), 0], 16);
  },
  // 10 the next layer: an empty frame.
  (s) => {
    box(s, 0, 0, 0.6, 0.3, 0.4);
  },
];

export function createHolograms(color = new Color('#8fcbd0')) {
  const group = new Group();
  group.name = 'holograms';
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: color }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aFlick;
      varying float vF;
      void main() {
        vF = aFlick;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uAmount;
      varying float vF;
      void main() {
        float f = 0.75 + 0.25 * sin(uTime * (1.3 + vF) + vF * 20.0) * sin(uTime * 0.37 + vF * 7.0);
        gl_FragColor = vec4(uColor * f * uAmount, 1.0);
      }`,
  });
  const items = BUILDERS.map((build, i) => {
    const seg: Seg = [];
    build(seg);
    // The line down to the band.
    seg.push(0, 0, 0, 0, -0.55, 0);
    const pos = new Float32Array(seg);
    const flick = new Float32Array(pos.length / 3).map((_, k) => ((k * 0.618 + i * 0.37) % 1) * 0.6);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aFlick', new BufferAttribute(flick, 1));
    const m = material.clone();
    m.uniforms.uAmount = { value: 0 };
    const lines = new LineSegments(g, m);
    lines.visible = false;
    lines.frustumCulled = false;
    group.add(lines);
    return { lines, material: m, geometry: g };
  });

  return {
    group,
    /** Show hologram `i` with `amount` 0–1, standing at (x, y, z) at `scale` world units. */
    set(i: number, amount: number, x: number, y: number, z: number, scale: number, yaw = 0) {
      const it = items[i];
      if (!it) return;
      it.lines.visible = amount > 0.003;
      (it.material.uniforms.uAmount as { value: number }).value = amount;
      it.lines.position.set(x, y, z);
      it.lines.scale.setScalar(scale);
      it.lines.rotation.y = yaw;
    },
    update(time: number) {
      for (const it of items) (it.material.uniforms.uTime as { value: number }).value = time;
    },
    dispose() {
      for (const it of items) {
        it.geometry.dispose();
        it.material.dispose();
      }
      material.dispose();
    },
  };
}

export type Holograms = ReturnType<typeof createHolograms>;
