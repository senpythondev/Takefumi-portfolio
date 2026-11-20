/**
 * The single WebGL stage (CLAUDE.md §3: one Canvas, one context). Loaded lazily via ./boot.
 *
 * - R3F `createRoot` on our own <canvas> instead of <Canvas>: only the classes in ./registry are
 *   bundled (3D base ≈ 196 KB gzip with Turbopack; <Canvas> would register all of three.js).
 * - The root scene belongs to the director (src/three/director): the wall, the hero core and the
 *   cinematic acts, rendered through post-processing on high/medium (render priority 1).
 * - The navigator core at the right edge is a drei <View> over its DOM slot, drawn after it
 *   (priority 2), without post-processing.
 * - frameloop 'never': the effects bundle's single RAF loop calls `advance`.
 */
import { advance, createRoot, events, useThree, type ReconcilerRoot } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import { LAYER_IDS } from '@/content/layer-ids';
import { scrollLive, scrollStore, type Quality } from '@/lib/scroll/store';
import type { FrameListener } from '@/lib/scroll/effects';
import { DPR_CAP, createQualityGovernor } from './quality';
import { CoreView } from './core/CoreView';
import './registry';

type LiveQuality = Exclude<Quality, 'static'>;

export type StageHandle = { root: ReconcilerRoot<HTMLCanvasElement>; canvas: HTMLCanvasElement; dispose: () => void };

/** The director of the cinematic home: its own lazy chunk (the scene, its shaders and timelines). */
const Director = lazy(() => import('./director/Director'));

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 };
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
 * How many of [director, navigator core] are mounted. Starts at 1 and grows by one per idle slot,
 * so each mount (chunk evaluation, shader compile, upload) is its own short task (PM_REVIEW_05 §3.2).
 */
function useStagedMount(total: number): number {
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (count >= total) return;
    return whenIdle(() => setCount((c) => c + 1));
  }, [count, total]);
  return count;
}

function StageTree({ core, initial, adaptive, onQuality }: { core: RefObject<HTMLElement> | null; initial: LiveQuality; adaptive: boolean; onQuality: (q: Quality) => void }) {
  const [governor] = useState(() => createQualityGovernor(initial));
  const live = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().quality, () => initial);
  const ids = useMemo(() => [...LAYER_IDS], []);
  // The director first; the navigator core one idle slot later (each mount is its own short task).
  const mounted = useStagedMount(2);
  // On narrow screens the navigator is a thin HTML progress bar: too thin for the 3D core.
  const coreWide = useThree((s) => s.size.width) >= 700;
  const change = (direction: 1 | -1) => {
    const next = governor.step(direction);
    if (next) onQuality(next);
  };
  if (live === 'static' || live === 'pending') return null;
  return (
    <>
      {adaptive ? <PerformanceMonitor onIncline={() => change(1)} onDecline={() => change(-1)} /> : null}
      <Suspense fallback={null}>
        <Director ids={ids} quality={live} />
      </Suspense>
      {core && coreWide && mounted >= 2 ? <CoreView track={core} ids={ids} quality={live} /> : null}
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
    // The director's camera: the hero core is framed in a plane 10 units in front of it.
    camera: { fov: 30, position: [0, 0, 10], near: 0.1, far: 60 },
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
        // Debugging only: the scene, to look into a world from the console.
        (window as unknown as { __scene: unknown }).__scene = state.scene;
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

  const coreEl = document.querySelector<HTMLElement>('[data-core-slot]');
  const core = coreEl ? { current: coreEl } : null;
  scrollStore.set({ quality });
  root.render(<StageTree core={core} initial={quality} adaptive={adaptive} onQuality={setQuality} />);
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
  // R3F takes the timestamp as it is given and hands it to every useFrame as the clock: it must be
  // in seconds. (Until 2026-11-20 milliseconds were passed: every `elapsed` and `delta` in the 3D was
  // 1000× too large — shader time raced and every spring ran at its per-frame cap.)
  const removeFrame = addFrameListener((ms) => {
    if (scrollStore.get().quality !== 'low' || performance.now() - lastActivity < 1800 || scrollLive.settling) advance(ms / 1000);
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
      // Without 3D the acts are the stacked poster-and-HTML version (runtime step-down to static).
      delete document.documentElement.dataset.cinema;
      document.querySelector<HTMLElement>('.world')?.style.setProperty('--drill', '1');
    document.querySelector<HTMLElement>('.world')?.style.setProperty('--bore', '1');
    },
  };
  return handle;
}
