/**
 * Content schema for GROUND TRUTH.
 *
 * Rules enforced here and in validate.ts / scripts/validate-content.ts:
 * - Every number shown on the site is a `Metric` and carries its own `Evidence`.
 * - Prose may reference metrics with `{{metric-id}}` tokens; bare numbers in prose are rejected
 *   (except dates/periods, which BRIEF §6 says are plain text without a confidence label).
 * - `Evidence.method` is null until the owner fills docs/EVIDENCE_INTAKE.md. Never invent it.
 *
 * This file must stay runnable by Node's built-in type stripping (scripts import it):
 * relative imports only, `.ts` extensions, no enums/namespaces.
 */
import { z } from 'zod';

export const LAYER_IDS = [
  'surface',
  'current',
  'genten',
  'pegasus',
  'php-audit',
  'auction',
  'patent',
  'deep',
  'catchup',
  'bedrock',
  'next',
] as const;

export const LayerIdSchema = z.enum(LAYER_IDS);
export type LayerId = z.infer<typeof LayerIdSchema>;

/** 実測 / 概算 / 再現 (BRIEF §3, §6「確度ラベルの付け方」) */
export const ConfidenceSchema = z.enum(['measured', 'approx', 'reconstructed']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Where the underlying record comes from. Labels live in messages/*.json. */
export const SourceSchema = z.enum(['records', 'eval', 'article', 'ci']);
export type Source = z.infer<typeof SourceSchema>;

export const LINK_KEYS = ['genten', 'gentenArticle', 'github', 'devProfile', 'pegasus'] as const;
export const LinkKeySchema = z.enum(LINK_KEYS);
export type LinkKey = z.infer<typeof LinkKeySchema>;

const IdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case id');

/** Plain text that may contain `{{metric-id}}` tokens. */
const RichTextSchema = z.string().min(1);

export const EvidenceSchema = z.object({
  /** The fact-sheet statement this number comes from (translated for en). */
  statement: z.string().min(1),
  /** How it was measured — only what the owner wrote in EVIDENCE_INTAKE.md. */
  method: z.string().min(1).nullable(),
  source: SourceSchema,
  note: z.string().min(1).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const MetricSchema = z.object({
  id: IdSchema,
  /** Exactly what is printed, e.g. 「約45,000本」 / "about 45,000". */
  display: z.string().min(1),
  /** What the number is about (dialog title, accessible name). */
  label: z.string().min(1),
  confidence: ConfidenceSchema,
  evidence: EvidenceSchema,
});
export type Metric = z.infer<typeof MetricSchema>;

const ProjectSchema = z.object({
  id: IdSchema,
  period: z.string().min(1),
  title: z.string().min(1),
  industry: z.string().min(1),
  summary: z.string().min(1),
  tech: z.array(z.string().min(1)).min(1),
  role: z.string().min(1),
  team: RichTextSchema,
  results: z.array(RichTextSchema),
});

const GentenConfigIdSchema = z.enum(['closed-book', 'keyword-search', 'genten']);

/**
 * A quotation with its source (PM_REVIEW_03 §6). Not a Metric and has no confidence label:
 * the numbers inside are someone else's figures, quoted with a mandatory link to the source.
 * Excluded from the fact-sheet lint; ja/en must quote the same amounts (checked in validate.ts).
 */
export const CitationSchema = z.object({
  quote: z.string().min(1),
  /** What the source shows, in one sentence. */
  context: z.string().min(1).optional(),
  /** Name of the source as displayed. */
  sourceLabel: z.string().min(1),
  /** The source link — must be an allowlisted link (src/content/links.ts). Required. */
  sourceLink: LinkKeySchema,
  /** The authority the source itself relies on (e.g. the FSA). */
  basis: z.string().min(1).optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

const BlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paragraph'), text: RichTextSchema }),
  z.object({
    kind: z.literal('list'),
    heading: z.string().min(1).optional(),
    items: z.array(RichTextSchema).min(1),
  }),
  z.object({
    kind: z.literal('tech'),
    heading: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
  }),
  z.object({ kind: z.literal('chips'), items: z.array(RichTextSchema).min(1) }),
  z.object({ kind: z.literal('availability'), text: z.string().min(1) }),
  z.object({
    kind: z.literal('summary'),
    heading: z.string().min(1),
    items: z.array(RichTextSchema).min(1),
  }),
  z.object({
    kind: z.literal('notice'),
    tone: z.enum(['reconstructed', 'info']),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal('timeline'),
    heading: z.string().min(1),
    items: z.array(z.object({ when: z.string().min(1), what: z.string().min(1) })).min(1),
  }),
  z.object({ kind: z.literal('projects'), heading: z.string().min(1), projects: z.array(ProjectSchema).min(1) }),
  z.object({
    kind: z.literal('skills'),
    heading: z.string().min(1),
    levels: z
      .array(
        z.object({
          grade: z.enum(['A', 'B', 'C']),
          description: z.string().min(1).optional(),
          items: z.array(RichTextSchema).min(1),
        }),
      )
      .min(1),
  }),
  z.object({
    kind: z.literal('genten-eval'),
    heading: z.string().min(1),
    intro: RichTextSchema,
    configs: z
      .array(z.object({ id: GentenConfigIdSchema, label: RichTextSchema }))
      .length(3),
    rows: z
      .array(
        z.object({
          label: z.string().min(1),
          metrics: z.object({
            'closed-book': IdSchema,
            'keyword-search': IdSchema,
            genten: IdSchema,
          }),
        }),
      )
      .min(1),
    takeaway: RichTextSchema,
    gridCaption: z.string().min(1),
  }),
  z.object({ kind: z.literal('creeds'), items: z.array(z.string().min(1)).length(3) }),
  z.object({ kind: z.literal('citation'), citation: CitationSchema }),
  z.object({ kind: z.literal('contact'), heading: z.string().min(1) }),
  z.object({
    kind: z.literal('links'),
    heading: z.string().min(1),
    links: z.array(z.object({ key: LinkKeySchema, label: z.string().min(1) })).min(1),
  }),
]);
export type Block = z.infer<typeof BlockSchema>;

export const LayerSchema = z.object({
  id: LayerIdSchema,
  title: z.string().min(1),
  period: z.string().min(1).optional(),
  lead: RichTextSchema,
  /** Link key whose domain may be shown next to the title (gated by a feature flag). */
  titleLink: LinkKeySchema.optional(),
  blocks: z.array(BlockSchema),
});
export type Layer = z.infer<typeof LayerSchema>;

export const SiteContentSchema = z.object({
  locale: z.enum(['ja', 'en']),
  person: z.object({
    name: z.string().min(1),
    nameLatin: z.string().min(1),
    role: z.string().min(1),
  }),
  layers: z.array(LayerSchema).length(LAYER_IDS.length),
  metrics: z.array(MetricSchema).min(1),
});
export type SiteContent = z.infer<typeof SiteContentSchema>;
export type SiteContentInput = z.input<typeof SiteContentSchema>;

export const METRIC_TOKEN = /\{\{([a-z0-9]+(?:-[a-z0-9]+)*)\}\}/g;
