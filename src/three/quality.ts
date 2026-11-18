/**
 * Quality tier for the 3D stage (CLAUDE.md §3, PM_REVIEW_03 §8, PM_REVIEW_06 §5-5).
 *
 *   high   desktop at start: every effect, DPR ≤ 2
 *   medium touch devices at start: DPR ≤ 1.5
 *   low    reached by PerformanceMonitor when frames drop: simplest materials, DPR 1
 *   static no WebGL2 / software renderer (reduced motion and Save-Data never even load the stage):
 *          no 3D at all, every piece of content still readable
 *
 * The starting tier is a simple, synchronous decision; PerformanceMonitor moves it up or down at
 * runtime from the measured frame rate. detect-gpu was removed (PM_REVIEW_06 §5-5): its benchmark
 * download (up to 156 KB per device) and extra round trip bought only a better first guess on weak
 * desktop GPUs, which PerformanceMonitor corrects within seconds anyway.
 */
import type { Quality } from '@/lib/scroll/store';

export const QUALITY_ORDER: readonly Quality[] = ['static', 'low', 'medium', 'high'];
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

export const DPR_CAP: Record<Exclude<Quality, 'static'>, number> = { high: 2, medium: 1.5, low: 1 };

export type QualityDecision = { quality: Quality; reason: string; renderer: string | null };

function isQuality(v: string | null): v is Quality {
  return v !== null && (QUALITY_ORDER as readonly string[]).includes(v);
}

/** WebGL2 support and the renderer string, using one short-lived probe context. */
function probeWebGL2(): { ok: boolean; renderer: string | null } {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { ok: false, renderer: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    // Release the probe context right away: the page must only ever hold one (the stage).
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, renderer };
  } catch {
    return { ok: false, renderer: null };
  }
}

export function decideQuality(forced: string | null): QualityDecision {
  if (isQuality(forced)) return { quality: forced, reason: `forced by ?quality=${forced}`, renderer: null };
  const { ok, renderer } = probeWebGL2();
  if (!ok) return { quality: 'static', reason: 'WebGL2 unavailable', renderer };
  // Software rasterisers (VMs, blocklisted GPUs) cannot keep 3D smooth: static version instead.
  if (renderer && SOFTWARE_RENDERER.test(renderer)) return { quality: 'static', reason: 'software renderer', renderer };
  if (window.matchMedia('(pointer: coarse)').matches) return { quality: 'medium', reason: 'touch device starts at medium (PM_REVIEW_03 §8)', renderer };
  return { quality: 'high', reason: 'desktop starts at high', renderer };
}

export function stepQuality(current: Quality, direction: 1 | -1): Quality {
  const i = QUALITY_ORDER.indexOf(current) + direction;
  return QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, Math.max(0, i))] as Quality;
}
