/**
 * A city of ~45,000 buildings drawn with InstancedMesh (Phase 3-9 spike, pure three.js so it can be
 * mounted in the R3F stage later with <primitive object={city.group} />).
 *
 * Performance design:
 * - One InstancedMesh per district (15 × 15 = 225 draw calls at most). Each has its own bounding
 *   sphere, so three.js frustum-culls whole districts — during a dive most of the city is skipped.
 * - LOD: districts farther than `lodDistance` are drawn as ONE box (mean height) instead of ~200.
 * - Matrices are written once. Nothing per-instance is updated per frame: the pulse is computed
 *   in the shader from a per-instance flag and a time uniform.
 * - No shadows or lights: height-gradient ambient occlusion, face shading and fog in the shader.
 * - Boxes have no bottom face (10 triangles each).
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';

export type CityOptions = {
  /** Building heights in world units; one building per entry. */
  heights: Float32Array;
  districtsPerSide?: number;
  /** Districts farther than this from the camera are drawn as a single block. */
  lodDistance?: number;
  baseColor?: string;
  pulseColor?: string;
  fogColor?: string;
  seed?: number;
};

type District = { center: Vector3; detail: InstancedMesh<BufferGeometry, ShaderMaterial>; blockMatrix: Matrix4; near: boolean | null; pulse: InstancedBufferAttribute };

const CELL = 1; // spacing between buildings inside a district
const STREET = 2.2; // gap between districts

const vertexShader = /* glsl */ `
#ifdef USE_INSTANCING
attribute float aPulse;
attribute float aTone;
#endif
uniform float uTone;
varying float vUp;      // 0 at the ground, 1 at the roof
varying float vTone;
varying float vPulse;
varying vec3 vFace;
varying float vDepth;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
  vTone = aTone;
  vPulse = aPulse;
#else
  vTone = uTone;
  vPulse = 0.0;
#endif
  vUp = position.y;
  vFace = normal;
  vec4 mv = modelViewMatrix * p;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uPulse;
uniform vec3 uFog;
uniform float uFogDensity;
uniform float uTime;
varying float vUp;
varying float vTone;
varying float vPulse;
varying vec3 vFace;
varying float vDepth;
void main() {
  // Face shading without lights: roofs brightest, the two wall directions differ slightly.
  float face = vFace.y > 0.5 ? 1.0 : (abs(vFace.x) > 0.5 ? 0.62 : 0.78);
  float ao = mix(0.45, 1.0, smoothstep(0.0, 0.6, vUp)); // darker towards the street
  vec3 col = uBase * (0.55 + 0.6 * vTone) * face * ao;
  if (vPulse > 0.5) {
    float beat = 0.5 + 0.5 * sin(uTime * 5.0);
    col = mix(col, uPulse, 0.55 + 0.45 * beat) + uPulse * 0.35 * beat;
  }
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  col = mix(col, uFog, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unit box standing on y = 0, without the bottom face. */
function buildingGeometry(): BufferGeometry {
  const g = new BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const index = g.getIndex();
  if (index) {
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (6 indices each). Drop -y.
    const kept = Array.from(index.array).filter((_, i) => i < 18 || i >= 24);
    g.setIndex(new BufferAttribute(new Uint16Array(kept), 1));
  }
  return g;
}

export class CityField {
  readonly group = new Group();
  readonly count: number;
  readonly districts: District[] = [];
  readonly size: number;
  private readonly geometry = buildingGeometry();
  private readonly material: ShaderMaterial;
  private blocks!: InstancedMesh<BufferGeometry, ShaderMaterial>;
  private static readonly HIDDEN = new Matrix4().makeScale(0, 0, 0);
  private lodDistance: number;

  constructor({ heights, districtsPerSide = 15, lodDistance = 70, baseColor = '#a6806f', pulseColor = '#e5613f', fogColor = '#13110f', seed = 45000 }: CityOptions) {
    this.count = heights.length;
    this.lodDistance = lodDistance;
    const rand = mulberry32(seed);
    const districtCount = districtsPerSide * districtsPerSide;
    const perDistrict = Math.ceil(this.count / districtCount);
    const side = Math.ceil(Math.sqrt(perDistrict));
    const pitch = side * CELL + STREET;
    this.size = districtsPerSide * pitch;

    const uniforms = {
      uBase: { value: new Color(baseColor) },
      uPulse: { value: new Color(pulseColor) },
      uFog: { value: new Color(fogColor) },
      uFogDensity: { value: 0.0065 },
      uTime: { value: 0 },
      uTone: { value: 0.5 },
    };
    this.material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms });

    const m = new Matrix4();
    const blockTones: number[] = [];
    let next = 0;
    for (let d = 0; d < districtCount && next < this.count; d += 1) {
      const n = Math.min(perDistrict, this.count - next);
      const cx = ((d % districtsPerSide) - (districtsPerSide - 1) / 2) * pitch;
      const cz = (Math.floor(d / districtsPerSide) - (districtsPerSide - 1) / 2) * pitch;
      const detail = new InstancedMesh<BufferGeometry, ShaderMaterial>(this.geometry, this.material, n);
      const tone = new Float32Array(n);
      const pulse = new Float32Array(n);
      let heightSum = 0;
      for (let i = 0; i < n; i += 1) {
        const h = heights[next + i] as number;
        heightSum += h;
        // Irregular lots: jittered grid position and footprint (a city grown without a plan).
        const gx = (i % side) - (side - 1) / 2 + (rand() - 0.5) * 0.3;
        const gz = Math.floor(i / side) - (side - 1) / 2 + (rand() - 0.5) * 0.3;
        const w = 0.45 + rand() * 0.4;
        const dp = 0.45 + rand() * 0.4;
        m.makeScale(w, h, dp).setPosition(cx + gx * CELL, 0, cz + gz * CELL);
        detail.setMatrixAt(i, m);
        tone[i] = rand();
      }
      next += n;
      const pulseAttr = new InstancedBufferAttribute(pulse, 1);
      // Per-district instanced attributes need their own geometry object; vertex buffers stay shared.
      const g = new BufferGeometry();
      g.setIndex(this.geometry.getIndex());
      g.setAttribute('position', this.geometry.getAttribute('position'));
      g.setAttribute('normal', this.geometry.getAttribute('normal'));
      detail.geometry = g;
      detail.geometry.setAttribute('aTone', new InstancedBufferAttribute(tone, 1));
      detail.geometry.setAttribute('aPulse', pulseAttr);
      detail.instanceMatrix.needsUpdate = true;
      detail.computeBoundingSphere();
      detail.matrixAutoUpdate = false;

      // Far LOD: the district as one block (footprint × mean height), drawn by the shared block mesh.
      const blockMatrix = new Matrix4().makeScale(side * CELL * 0.92, (heightSum / n) * 0.9, side * CELL * 0.92).setPosition(cx, 0, cz);
      blockTones.push(0.35 + rand() * 0.3);

      this.group.add(detail);
      this.districts.push({ center: new Vector3(cx, 0, cz), detail, blockMatrix, near: null, pulse: pulseAttr });
    }

    // All far blocks in ONE instanced draw call (was one draw call per district).
    const bg = new BufferGeometry();
    bg.setIndex(this.geometry.getIndex());
    bg.setAttribute('position', this.geometry.getAttribute('position'));
    bg.setAttribute('normal', this.geometry.getAttribute('normal'));
    bg.setAttribute('aTone', new InstancedBufferAttribute(new Float32Array(blockTones), 1));
    bg.setAttribute('aPulse', new InstancedBufferAttribute(new Float32Array(this.districts.length), 1));
    this.blocks = new InstancedMesh<BufferGeometry, ShaderMaterial>(bg, this.material, this.districts.length);
    this.blocks.matrixAutoUpdate = false;
    this.blocks.frustumCulled = false; // spans the whole city
    this.group.add(this.blocks);
  }

  /**
   * Call once per frame: switches each district between detail and block by camera distance.
   * Block instance matrices are rewritten only for districts whose state changed.
   */
  update(camera: Camera, timeSeconds: number): { detailed: number; blocks: number } {
    (this.material.uniforms.uTime as { value: number }).value = timeSeconds;
    let detailed = 0;
    let changed = false;
    const limit = this.lodDistance * this.lodDistance;
    this.districts.forEach((d, i) => {
      const near = d.center.distanceToSquared(camera.position) < limit;
      if (near) detailed += 1;
      if (near === d.near) return;
      d.near = near;
      d.detail.visible = near;
      this.blocks.setMatrixAt(i, near ? CityField.HIDDEN : d.blockMatrix);
      changed = true;
    });
    if (changed) this.blocks.instanceMatrix.needsUpdate = true;
    return { detailed, blocks: this.districts.length - detailed };
  }

  setLodDistance(distance: number): void {
    this.lodDistance = distance;
  }

  /** Makes `count` buildings of one district pulse (pass 0 to clear). Written once, not per frame. */
  setPulse(districtIndex: number, count: number): Vector3 {
    const d = this.districts[districtIndex] as District;
    const array = d.pulse.array as Float32Array;
    array.fill(0);
    const start = Math.floor(array.length / 2) - Math.floor(count / 2);
    for (let i = 0; i < count && start + i < array.length; i += 1) array[Math.max(0, start + i)] = 1;
    d.pulse.needsUpdate = true;
    return d.center;
  }

  dispose(): void {
    for (const d of this.districts) {
      d.detail.geometry.dispose();
      d.detail.dispose();
    }
    this.blocks.geometry.dispose();
    this.blocks.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Deterministic, skewed (log-normal-like) heights for the spike: many low buildings, a few tall ones. */
export function sampleHeights(count: number, seed = 1): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const g = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    out[i] = Math.min(14, Math.max(0.3, Math.exp(g * 0.7) * 1.3));
  }
  return out;
}
