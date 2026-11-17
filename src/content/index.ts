/**
 * Server-side entry point for content. Validation runs once at module load, so `next build`
 * fails on invalid content even if the prebuild script is skipped.
 * Never import this from a client component (it pulls in zod).
 */
import { contentEn } from './layers.en.ts';
import { contentJa } from './layers.ja.ts';
import type { Metric, SiteContent } from './schema.ts';
import { validateContent } from './validate.ts';

const validated = validateContent(contentJa, contentEn);

export type Locale = SiteContent['locale'];

export function getContent(locale: Locale): SiteContent {
  return validated[locale];
}

export function metricMap(content: SiteContent): Map<string, Metric> {
  return new Map(content.metrics.map((m) => [m.id, m]));
}

export type { Block, Confidence, Layer, LayerId, Metric, SiteContent, Source } from './schema.ts';
