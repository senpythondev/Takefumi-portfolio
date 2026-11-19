/**
 * The section worlds (STORYBOARD v2.1 §6-3): each is its own lazily loaded chunk. The director
 * keeps only the current act's world and its neighbours mounted (CLAUDE.md §3: everything else
 * is disposed to free GPU memory) and fetches the code of the next two ahead of time. Hovering or
 * focusing a band in the index prefetches that band's world too, so a flight there is quick.
 */
import { Group, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { ACTS, beatsOf } from '@/content/acts';
import type { World, WorldContext, WorldFactory, Tier } from '../worlds/kit';

export type WorldId = 'current' | 'genten' | 'pegasus' | 'php-audit' | 'auction' | 'patent' | 'deep' | 'catchup' | 'bedrock' | 'next';

// One import() per world, written out, so the bundler makes one chunk per world.
const LOADERS: Record<WorldId, () => Promise<{ default: WorldFactory }>> = {
  current: () => import('../worlds/current'),
  genten: () => import('../worlds/genten'),
  pegasus: () => import('../worlds/pegasus'),
  'php-audit': () => import('../worlds/php-audit'),
  auction: () => import('../worlds/auction'),
  patent: () => import('../worlds/patent'),
  deep: () => import('../worlds/deep'),
  catchup: () => import('../worlds/catchup'),
  bedrock: () => import('../worlds/bedrock'),
  next: () => import('../worlds/finale'),
};

export function isWorldId(id: string): id is WorldId {
  return id in LOADERS;
}

type Entry = { world: World | null; loading: Promise<void> | null; ready: boolean; disposed: boolean };

export function createWorldHost({
  scene,
  gl,
  camera,
  tier,
  tints,
  coreModel,
}: {
  scene: Scene;
  gl: WebGLRenderer;
  camera: PerspectiveCamera;
  tier: Tier;
  tints: Record<string, string>;
  coreModel: (bands: number) => Group;
}) {
  const modules = new Map<WorldId, Promise<{ default: WorldFactory }>>();
  const mounted = new Map<WorldId, Entry>();
  const root = new Group();
  root.name = 'worlds';
  scene.add(root);
  const scale = tier === 'high' ? 1 : tier === 'medium' ? 0.5 : 0.25;

  const code = (id: WorldId) => {
    let m = modules.get(id);
    if (!m) {
      m = LOADERS[id]();
      modules.set(id, m);
      m.catch(() => modules.delete(id));
    }
    return m;
  };

  const mount = (id: WorldId) => {
    if (mounted.has(id)) return;
    const section = document.querySelector<HTMLElement>(`section[data-act="${id}"]`);
    if (!section) return;
    const entry: Entry = { world: null, loading: null, ready: false, disposed: false };
    mounted.set(id, entry);
    entry.loading = code(id).then(async ({ default: create }) => {
      if (entry.disposed) return;
      const act = ACTS.find((a) => a.id === id);
      const result = act ? beatsOf(act).result : 0.8;
      const ctx: WorldContext = { tier, gl, section, tint: tints[id] ?? '#988979', count: (n) => Math.max(8, Math.round(n * scale)), coreModel, result };
      const world = create(ctx);
      world.group.name = id;
      entry.world = world;
      world.group.visible = false;
      root.add(world.group);
      await world.ready;
      if (entry.disposed) return;
      // Compile its programs before it is needed (no compile at the moment it appears).
      world.group.visible = true;
      await gl.compileAsync(world.group, camera).catch(() => undefined);
      world.group.visible = false;
      entry.ready = true;
    });
  };

  const release = (id: WorldId) => {
    const entry = mounted.get(id);
    if (!entry) return;
    entry.disposed = true;
    mounted.delete(id);
    if (entry.world) {
      root.remove(entry.world.group);
      entry.world.dispose();
    }
  };

  return {
    /** Fetch the code only (no GPU work). */
    prefetch(id: string) {
      if (isWorldId(id)) void code(id).catch(() => undefined);
    },
    /** Keep exactly these worlds mounted. */
    keep(ids: WorldId[]) {
      for (const id of ids) mount(id);
      for (const id of [...mounted.keys()]) if (!ids.includes(id)) release(id);
    },
    /** The world, once it is ready to be shown. */
    get(id: string): World | null {
      if (!isWorldId(id)) return null;
      const e = mounted.get(id);
      return e?.ready ? e.world : null;
    },
    mounted: () => [...mounted.entries()].filter(([, e]) => e.ready).map(([id]) => id),
    hideAll() {
      for (const e of mounted.values()) if (e.world) e.world.group.visible = false;
    },
    dispose() {
      for (const id of [...mounted.keys()]) release(id);
      scene.remove(root);
    },
  };
}
