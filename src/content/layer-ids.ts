/** The eleven layers, surface to the next layer (BRIEF §4). No imports: the 3D code uses this too. */
export const LAYER_IDS = [
  'surface',
  'current',
  'genten',
  'site-migration',
  'php-audit',
  'auction',
  'patent',
  'deep',
  'catchup',
  'bedrock',
  'next',
] as const;

export type LayerId = (typeof LAYER_IDS)[number];
