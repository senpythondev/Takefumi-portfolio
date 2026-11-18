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
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { scrollStore, type Quality } from '@/lib/scroll/store';
import type { FrameListener } from '@/lib/scroll/effects';
import { DPR_CAP, stepQuality } from './quality';
import { SCENES } from './scenes';
import { CoreView } from './core/CoreView';
import './registry';

type Slot = { id: string; ref: RefObject<HTMLElement> };
type LiveQuality = Exclude<Quality, 'static'>;

export type StageHandle = { root: ReconcilerRoot<HTMLCanvasElement>; canvas: HTMLCanvasElement; dispose: () => void };

const MOUNT_WINDOW = 1;

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

function StageTree({ slots, core, initial, adaptive, onQuality }: { slots: Slot[]; core: RefObject<HTMLElement> | null; initial: LiveQuality; adaptive: boolean; onQuality: (q: Quality) => void }) {
  const quality = useRef<Quality>(initial);
  const live = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().quality, () => initial);
  const ids = useMemo(() => slots.map((s) => s.id), [slots]);
  const mounted = useStagedMount(4);
  const change = (direction: 1 | -1) => {
    const next = stepQuality(quality.current, direction);
    if (next === quality.current) return;
    quality.current = next;
    onQuality(next);
  };
  return (
    <>
      {adaptive ? <PerformanceMonitor flipflops={3} onIncline={() => change(1)} onDecline={() => change(-1)} onFallback={() => onQuality('low')} /> : null}
      {live !== 'static' && live !== 'pending' ? <Scenes slots={slots} quality={live} mounted={mounted} /> : null}
      {core && live !== 'static' && live !== 'pending' && mounted >= 4 ? <CoreView track={core} ids={ids} quality={live} /> : null}
    </>
  );
}

export async function mountStage({ quality, adaptive, addFrameListener }: { quality: LiveQuality; adaptive: boolean; addFrameListener: (fn: FrameListener) => () => void }): Promise<StageHandle> {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.stage = '';
  document.body.appendChild(canvas);

  const root = createRoot(canvas);
  await root.configure({
    events,
    frameloop: 'never',
    dpr: [1, DPR_CAP[quality]],
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
    void root.configure({ dpr: [1, DPR_CAP[q]] });
  };

  // Renderer/context creation and the first React render are separate tasks.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const slots = readSlots();
  const coreEl = document.querySelector<HTMLElement>('[data-core-slot]');
  const core = coreEl ? { current: coreEl } : null;
  scrollStore.set({ quality });
  root.render(<StageTree slots={slots} core={core} initial={quality} adaptive={adaptive} onQuality={setQuality} />);
  document.documentElement.dataset.stage = 'live';
  performance.mark('stage:live');

  const removeFrame = addFrameListener((ms) => advance(ms));
  const onResize = () => void root.configure({ size: viewportSize() });
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
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      root.unmount();
      canvas.remove();
      delete document.documentElement.dataset.stage;
    },
  };
  return handle;
}
