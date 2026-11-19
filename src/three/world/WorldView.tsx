/**
 * The world behind the page: the wall shader drawn over the whole viewport
 * (docs/concept/ART_DIRECTION.md §1–2). One mesh, one draw call; its own lazy chunk.
 *
 * - Depth: the wall is locked to the page — `uDepth` is the scroll position in viewport heights,
 *   so scrolling is descending the borehole. Layer tops are measured from the DOM.
 * - Lantern: the beam follows the pointer on the hero and fades out below it. On touch devices it
 *   drifts slowly by itself and follows a drag (PLAN B2).
 * - `uDim`: the rock is brightest on the hero and dimmer under the layers' text.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { Quality } from '@/lib/scroll/store';
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, type WebGLRenderer } from 'three';
import { createWallMaterial, createWallUniforms, frameWall, type WallMaterial, type WallQuality } from '../materials/wall';
import { loadRock, type Rock } from './rock';
import { createWallController, type WallController } from './controller';

type Props = { track: RefObject<HTMLElement>; ids: string[]; quality: Exclude<Quality, 'static'> };

const TIERS: WallQuality[] = ['high', 'medium', 'low'];

/**
 * The wall keeps one material per tier, all on the same uniforms. The tiers below the current
 * one are compiled at idle (PM decision 3): when PerformanceMonitor steps down, the lower tier's
 * program already exists, so nothing compiles at the moment frames are dropping.
 */
function createWall(ids: readonly string[]) {
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

function whenIdle(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}

function Wall({ ids, quality }: Omit<Props, 'track'>) {
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const wall = useMemo(() => createWall(ids), [ids]);
  const material = useMemo(() => wall.get(quality), [wall, quality]);
  const controller = useRef<WallController | null>(null);
  useEffect(() => {
    const c = createWallController(wall.get('low'), ids); // any tier: the uniforms are shared
    controller.current = c;
    // After the first frames: textures (medium/high only), then the lower tiers' shaders.
    const cancel = whenIdle(() => {
      void (async () => {
        if (quality !== 'low') await wall.loadRock(gl);
        await wall.precompileBelow(quality, gl);
        const debug = (window as unknown as { __world?: { tiers?: string[] } }).__world;
        if (debug) debug.tiers = wall.compiled();
      })();
    });
    return () => {
      cancel();
      c.dispose();
      wall.dispose();
    };
    // Tier changes must not tear the wall down: `quality` is read once, for the first idle pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall, ids, gl]);
  useEffect(() => frameWall(material, size.width, size.height), [material, size.width, size.height]);
  useFrame((state, delta) => controller.current?.frame(state.clock.elapsedTime, delta, state.size.width, state.size.height));

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default function WorldView({ track, ids, quality }: Props) {
  return (
    <View track={track}>
      <Wall ids={ids} quality={quality} />
    </View>
  );
}
