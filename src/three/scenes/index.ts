/**
 * Scene registry: one lazily loaded chunk per layer (CLAUDE.md §3, budget ≤ 250 KB gzip each,
 * scene-only code). Phase 3 ships placeholders; Phase 5 replaces each file with the real scene.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Quality } from '@/lib/scroll/store';

export type SceneProps = { layerId: string; quality: Exclude<Quality, 'static'> };

export const SCENES: Record<string, LazyExoticComponent<ComponentType<SceneProps>>> = {
  surface: lazy(() => import('./surface')),
  current: lazy(() => import('./current')),
  genten: lazy(() => import('./genten')),
  pegasus: lazy(() => import('./pegasus')),
  'php-audit': lazy(() => import('./php-audit')),
  auction: lazy(() => import('./auction')),
  patent: lazy(() => import('./patent')),
  deep: lazy(() => import('./deep')),
  catchup: lazy(() => import('./catchup')),
  bedrock: lazy(() => import('./bedrock')),
  next: lazy(() => import('./next')),
};
