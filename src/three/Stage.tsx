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
import { Suspense, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { scrollStore, type Quality } from '@/lib/scroll/store';
import type { FrameListener } from '@/lib/scroll/effects';
import { DPR_CAP, stepQuality } from './quality';
import { SCENES } from './scenes';
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

function Scenes({ slots, quality }: { slots: Slot[]; quality: LiveQuality }) {
  const layerId = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().layerId, () => 'surface');
  const current = Math.max(0, slots.findIndex((s) => s.id === layerId));
  return (
    <>
      {slots.map((slot, i) => {
        if (Math.abs(i - current) > MOUNT_WINDOW) return null;
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

function StageTree({ slots, initial, onQuality }: { slots: Slot[]; initial: LiveQuality; onQuality: (q: Quality) => void }) {
  const quality = useRef<Quality>(initial);
  const live = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().quality, () => initial);
  const change = (direction: 1 | -1) => {
    const next = stepQuality(quality.current, direction);
    if (next === quality.current) return;
    quality.current = next;
    onQuality(next);
  };
  return (
    <>
      <PerformanceMonitor flipflops={3} onIncline={() => change(1)} onDecline={() => change(-1)} onFallback={() => onQuality('low')} />
      {live !== 'static' && live !== 'pending' ? <Scenes slots={slots} quality={live} /> : null}
    </>
  );
}

export async function mountStage({ quality, addFrameListener }: { quality: LiveQuality; addFrameListener: (fn: FrameListener) => () => void }): Promise<StageHandle> {
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

  const slots = readSlots();
  scrollStore.set({ quality });
  root.render(<StageTree slots={slots} initial={quality} onQuality={setQuality} />);
  document.documentElement.dataset.stage = 'live';

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
