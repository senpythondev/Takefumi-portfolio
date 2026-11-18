/**
 * The single WebGL stage (CLAUDE.md §3: one Canvas, one context). Loaded lazily via ./boot.
 *
 * - R3F `createRoot` on our own <canvas> instead of <Canvas>: only the classes in ./registry are
 *   bundled (3D base 189.1 KB gzip with Turbopack; <Canvas> would register all of three.js).
 * - Scenes draw into the DOM slots `[data-stage-slot]` with drei <View track>.
 * - Only the current layer and its neighbours are mounted; leaving scenes unmount and dispose.
 * - frameloop 'never': the effects bundle's single RAF loop calls `advance`.
 */
import { advance, createRoot, events, useThree, type ReconcilerRoot } from '@react-three/fiber';
import { PerformanceMonitor, PerspectiveCamera, View } from '@react-three/drei';
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import { scrollStore, type Quality } from '@/lib/scroll/store';
import type { FrameListener } from '@/lib/scroll/effects';
import { DPR_CAP, createQualityGovernor } from './quality';
import { SCENES } from './scenes';
import { CoreView } from './core/CoreView';
import './registry';

type Slot = { id: string; ref: RefObject<HTMLElement> };
type LiveQuality = Exclude<Quality, 'static'>;

export type StageHandle = { root: ReconcilerRoot<HTMLCanvasElement>; canvas: HTMLCanvasElement; dispose: () => void };

const MOUNT_WINDOW = 1;

/** The wall behind the whole page (its own chunk; mounted first, so it is drawn first). */
const WorldView = lazy(() => import('./world/WorldView'));

function readSlots(): Slot[] {
  return [...document.querySelectorAll<HTMLElement>('[data-stage-slot]')].map((el) => ({
    id: el.dataset.stageSlot as string,
    ref: { current: el },
  }));
}

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 };
}

/** Compile a scene's shaders as soon as it mounts (it mounts one layer early), so entering it does not hitch. */
function Precompile() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    void gl.compileAsync(scene, camera).catch(() => undefined);
  }, [gl, scene, camera]);
  return null;
}

/** Next idle moment (Safari has no requestIdleCallback). */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 400 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 60);
  return () => window.clearTimeout(id);
}

/**
 * How many of [current scene, next scene, previous scene, 3D core] are mounted. Starts at 1 and
 * grows by one per idle slot, so the first frame only prepares the current layer and each
 * further mount (chunk evaluation, shader compile, upload) is its own short task (PM_REVIEW_05 §3.2).
 */
function useStagedMount(total: number): number {
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (count >= total) return;
    return whenIdle(() => setCount((c) => c + 1));
  }, [count, total]);
  return count;
}

function Scenes({ slots, quality, mounted }: { slots: Slot[]; quality: LiveQuality; mounted: number }) {
  const layerId = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().layerId, () => 'surface');
  const current = Math.max(0, slots.findIndex((s) => s.id === layerId));
  // Mount order: current (1), next (2), previous (3).
  const allowed = new Set([current, current + 1, current - 1].slice(0, mounted));
  return (
    <>
      {slots.map((slot, i) => {
        if (Math.abs(i - current) > MOUNT_WINDOW || !allowed.has(i)) return null;
        const Scene = SCENES[slot.id];
        if (!Scene) return null;
        return (
          <View key={slot.id} track={slot.ref as RefObject<HTMLElement>}>
            <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={40} />
            <Suspense fallback={null}>
              <Scene layerId={slot.id} quality={quality} />
              <Precompile />
            </Suspense>
          </View>
        );
      })}
    </>
  );
}

function StageTree({ slots, core, world, initial, adaptive, onQuality }: { slots: Slot[]; core: RefObject<HTMLElement> | null; world: RefObject<HTMLElement> | null; initial: LiveQuality; adaptive: boolean; onQuality: (q: Quality) => void }) {
  const [governor] = useState(() => createQualityGovernor(initial));
  const live = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().quality, () => initial);
  const ids = useMemo(() => slots.map((s) => s.id), [slots]);
  const mounted = useStagedMount(4);
  // On narrow screens the navigator is a thin HTML progress bar: too thin for the 3D core.
  const coreWide = useThree((s) => s.size.width) >= 700;
  const change = (direction: 1 | -1) => {
    const next = governor.step(direction);
    if (next) onQuality(next);
  };
  return (
    <>
      {adaptive ? <PerformanceMonitor onIncline={() => change(1)} onDecline={() => change(-1)} /> : null}
      {world && live !== 'static' && live !== 'pending' ? (
        <Suspense fallback={null}>
          <WorldView track={world as RefObject<HTMLElement>} ids={ids} quality={live} />
        </Suspense>
      ) : null}
      {live !== 'static' && live !== 'pending' ? <Scenes slots={slots} quality={live} mounted={mounted} /> : null}
      {core && coreWide && live !== 'static' && live !== 'pending' && mounted >= 4 ? <CoreView track={core} ids={ids} quality={live} /> : null}
    </>
  );
}

export async function mountStage({ quality, adaptive, addFrameListener }: { quality: LiveQuality; adaptive: boolean; addFrameListener: (fn: FrameListener) => () => void }): Promise<StageHandle> {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.stage = '';
  document.body.appendChild(canvas);

  // `?dpr=0.5` renders at a reduced resolution (debugging, and tests on software-rendered WebGL).
  const dprParam = Number(new URLSearchParams(window.location.search).get('dpr'));
  const dprFor = (q: LiveQuality): number | [number, number] => (dprParam > 0 ? dprParam : [1, DPR_CAP[q]]);

  const root = createRoot(canvas);
  await root.configure({
    events,
    frameloop: 'never',
    dpr: dprFor(quality),
    size: viewportSize(),
    gl: { antialias: quality === 'high', powerPreference: 'high-performance', alpha: true },
    onCreated: (state) => {
      // Content sits above the fixed canvas, so pointer events are read from the document.
      state.events.connect?.(document.body);
      state.setEvents({
        compute: (event, s) => {
          s.pointer.set((event.clientX / s.size.width) * 2 - 1, -(event.clientY / s.size.height) * 2 + 1);
          s.raycaster.setFromCamera(s.pointer, s.camera);
        },
      });
      if (new URLSearchParams(window.location.search).has('debug')) {
        (window as unknown as { __stage: unknown }).__stage = {
          info: () => ({ ...state.gl.info.memory, programs: state.gl.info.programs?.length ?? 0, calls: state.gl.info.render.calls }),
          quality: () => scrollStore.get().quality,
        };
        (window as unknown as { __world: unknown }).__world = { depth: 0, beam: 0 };
      }
    },
  });

  let disposed = false;
  const setQuality = (q: Quality) => {
    scrollStore.set({ quality: q });
    if (q === 'static') {
      handle.dispose();
      return;
    }
    void root.configure({ dpr: dprFor(q) });
  };

  // Renderer/context creation and the first React render are separate tasks.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const slots = readSlots();
  const coreEl = document.querySelector<HTMLElement>('[data-core-slot]');
  const core = coreEl ? { current: coreEl } : null;
  const worldEl = document.querySelector<HTMLElement>('[data-world-slot]');
  const world = worldEl ? { current: worldEl } : null;
  scrollStore.set({ quality });
  root.render(<StageTree slots={slots} core={core} world={world} initial={quality} adaptive={adaptive} onQuality={setQuality} />);
  document.documentElement.dataset.stage = 'live';
  performance.mark('stage:live');

  // The low tier draws only while something changes (scroll, pointer, keys, resize, layer change)
  // and for a short tail afterwards so easings settle: an idle page costs a weak device nothing.
  let lastActivity = performance.now();
  const poke = () => {
    lastActivity = performance.now();
  };
  const ACTIVITY = ['scroll', 'pointermove', 'pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
  for (const type of ACTIVITY) window.addEventListener(type, poke, { passive: true });
  const unsubscribe = scrollStore.subscribe(poke);
  const removeFrame = addFrameListener((ms) => {
    if (scrollStore.get().quality !== 'low' || performance.now() - lastActivity < 1800) advance(ms);
  });
  const onResize = () => {
    poke();
    void root.configure({ size: viewportSize() });
  };
  const onContextLost = (e: Event) => {
    e.preventDefault();
    setQuality('static');
  };
  window.addEventListener('resize', onResize);
  canvas.addEventListener('webglcontextlost', onContextLost);

  const handle: StageHandle = {
    root,
    canvas,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      removeFrame();
      unsubscribe();
      for (const type of ACTIVITY) window.removeEventListener(type, poke);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      root.unmount();
      canvas.remove();
      document.documentElement.dataset.stage = 'off';
      delete document.documentElement.dataset.world;
    },
  };
  return handle;
}
