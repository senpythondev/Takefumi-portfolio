/**
 * The wall's materials and textures, outside React (shared by the director).
 * One material per tier on the same uniforms; tiers below the current one are compiled at idle,
 * so a step-down never compiles while frames are dropping (PM decision on the vertical slice).
 */
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, type WebGLRenderer } from 'three';
import { createWallMaterial, createWallUniforms, type WallMaterial, type WallQuality } from '../materials/wall';
import { loadRock, type Rock } from './rock';

const TIERS: WallQuality[] = ['high', 'medium', 'low'];

/**
 * The wall keeps one material per tier, all on the same uniforms. The tiers below the current
 * one are compiled at idle (PM decision 3): when PerformanceMonitor steps down, the lower tier's
 * program already exists, so nothing compiles at the moment frames are dropping.
 */
export function createWall(ids: readonly string[]) {
  const uniforms = createWallUniforms(ids);
  const materials = new Map<WallQuality, WallMaterial>();
  const get = (q: WallQuality) => {
    let m = materials.get(q);
    if (!m) {
      m = createWallMaterial(q, uniforms);
      materials.set(q, m);
    }
    return m;
  };
  let rock: Rock | null = null;
  let disposed = false;
  return {
    get,
    compiled: () => [...materials.keys()],
    async precompileBelow(current: WallQuality, gl: WebGLRenderer) {
      const scene = new Scene();
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new PlaneGeometry(2, 2);
      for (const q of TIERS.slice(TIERS.indexOf(current) + 1)) {
        if (disposed || materials.has(q)) continue;
        const mesh = new Mesh(geometry, get(q));
        scene.add(mesh);
        await gl.compileAsync(scene, camera).catch(() => undefined);
        scene.remove(mesh);
      }
      geometry.dispose();
    },
    uniforms,
    rock: () => rock,
    async loadRock(gl: WebGLRenderer) {
      const loaded = await loadRock(gl);
      if (!loaded) return;
      if (disposed) return loaded.dispose();
      rock = loaded;
      uniforms.uRock0.value = loaded.textures[0] ?? null;
      uniforms.uRock1.value = loaded.textures[1] ?? null;
      uniforms.uRock2.value = loaded.textures[2] ?? null;
    },
    dispose() {
      disposed = true;
      for (const m of materials.values()) m.dispose();
      rock?.dispose();
    },
  };
}

export function whenIdle(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}

