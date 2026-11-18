/**
 * Quality tier for the 3D stage (CLAUDE.md §3, PLAN.md §2.5, PM_REVIEW_03 §8).
 *
 *   high   desktop-class GPU: every effect, DPR ≤ 2
 *   medium mid GPU or any touch device at start: DPR ≤ 1.5
 *   low    weak GPU: simplest materials, DPR 1
 *   static no WebGL / blocklisted GPU / reduced motion / Save-Data: no 3D at all
 *
 * Touch devices never START above medium; PerformanceMonitor may raise them later when the
 * measured frame rate allows it (PM_REVIEW_03 §8-1). detect-gpu's benchmark data is served from
 * /gpu-benchmarks (copied at build time) so no third-party request is made.
 */
import { getGPUTier, type TierResult } from 'detect-gpu';
import type { Quality } from '@/lib/scroll/store';

export const QUALITY_ORDER: readonly Quality[] = ['static', 'low', 'medium', 'high'];
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

export const DPR_CAP: Record<Exclude<Quality, 'static'>, number> = { high: 2, medium: 1.5, low: 1 };

export type QualityDecision = { quality: Quality; reason: string; gpu: Pick<TierResult, 'tier' | 'type' | 'gpu' | 'isMobile' | 'fps'> | null };

function isQuality(v: string | null): v is Quality {
  return v !== null && (QUALITY_ORDER as readonly string[]).includes(v);
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    // Release the probe context right away: the page must only ever hold one (the stage).
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

export async function decideQuality(forced: string | null): Promise<QualityDecision> {
  if (isQuality(forced)) return { quality: forced, reason: `forced by ?quality=${forced}`, gpu: null };
  if (!hasWebGL()) return { quality: 'static', reason: 'WebGL unavailable', gpu: null };

  const tier = await getGPUTier({ benchmarksURL: '/gpu-benchmarks' });
  const gpu = { tier: tier.tier, type: tier.type, gpu: tier.gpu, isMobile: tier.isMobile, fps: tier.fps };
  // Software rasterisers (VMs, blocklisted GPUs) report a usable "fallback" tier but cannot keep
  // 3D smooth: they get the static version (all content still readable).
  if (SOFTWARE_RENDERER.test(tier.gpu ?? '')) return { quality: 'static', reason: `software renderer (${tier.gpu})`, gpu };
  const byTier: Quality = tier.tier >= 3 ? 'high' : tier.tier === 2 ? 'medium' : tier.tier === 1 ? 'low' : 'static';
  const touch = window.matchMedia('(pointer: coarse)').matches || tier.isMobile === true;
  if (touch && byTier === 'high') return { quality: 'medium', reason: 'touch device starts at medium (PM_REVIEW_03 §8)', gpu };
  return { quality: byTier, reason: `detect-gpu tier ${tier.tier} (${tier.type})`, gpu };
}

export function stepQuality(current: Quality, direction: 1 | -1): Quality {
  const i = QUALITY_ORDER.indexOf(current) + direction;
  return QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, Math.max(0, i))] as Quality;
}
