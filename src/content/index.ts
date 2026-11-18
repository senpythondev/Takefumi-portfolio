/**
 * Server-side entry point for content. Validation runs once at module load, so `next build`
 * fails on invalid content even if the prebuild script is skipped.
 * Never import this from a client component (it pulls in zod).
 */
import { contentEn } from './layers.en.ts';
import { contentJa } from './layers.ja.ts';
import type { LayerId, Metric, SiteContent } from './schema.ts';
import { blockMetricRefs, layerStrings, tokensIn, validateContent } from './validate.ts';

const validated = validateContent(contentJa, contentEn);

export type Locale = SiteContent['locale'];

export function getContent(locale: Locale): SiteContent {
  return validated[locale];
}

export function metricMap(content: SiteContent): Map<string, Metric> {
  return new Map(content.metrics.map((m) => [m.id, m]));
}

/** The layer where each metric first appears (the evidence page links back to it). */
export function metricLayers(content: SiteContent): Map<string, LayerId> {
  const map = new Map<string, LayerId>();
  for (const layer of content.layers) {
    const ids = [...[...layerStrings(layer)].flatMap((s) => tokensIn(s.text)), ...layer.blocks.flatMap(blockMetricRefs)];
    for (const id of ids) if (!map.has(id)) map.set(id, layer.id);
  }
  return map;
}

export type { Block, Confidence, Layer, LayerId, Metric, SiteContent, Source } from './schema.ts';
