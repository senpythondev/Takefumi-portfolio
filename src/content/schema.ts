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
// The layer ids live in a zod-free module so the 3D code can use them without pulling zod into
// the 3D base chunk (perf-auditor, 2026-11-19).
import { LAYER_IDS, type LayerId } from './layer-ids.ts';

export { LAYER_IDS };
export type { LayerId };

export const LayerIdSchema = z.enum(LAYER_IDS);

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
  /** A build-time SVG chart drawn from docs/facts/ (no JS). */
  chart: z.enum(['genten-accuracy', 'genten-citation', 'genten-time']).optional(),
});
export type ChartKind = NonNullable<z.infer<typeof EvidenceSchema>['chart']>;
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

/**
 * One act of the cinematic home: a one-line headline and its big numbers (STORYBOARD v2.1 §3).
 * At most three numbers, except the catch-up act, whose four durations appear one at a time.
 */
export const ActCopySchema = z.object({
  headline: RichTextSchema,
  metrics: z.array(IdSchema).max(4),
  /** The numbers the result switches to afterwards (Genten: accuracy → answered with an official source). */
  then: z.array(IdSchema).max(3).optional(),
  /**
   * The act told in four beats (STORYBOARD v2.4 §12.2): ① problem, ② investigation, ③ action,
   * ④ result. One plain sentence each; numbers are {{metric}} tokens.
   */
  beats: z.tuple([RichTextSchema, RichTextSchema, RichTextSchema, RichTextSchema]).optional(),
  /** The one line of the title card (§12.1): what the work was. Without it the card shows the layer's lead. */
  role: RichTextSchema.optional(),
  /** Small labels on the objects of the act's world, by key (§12.2): what each metaphor stands for. */
  labels: z.record(IdSchema, RichTextSchema).optional(),
});
export type ActCopy = z.infer<typeof ActCopySchema>;

export const SiteContentSchema = z.object({
  locale: z.enum(['ja', 'en']),
  person: z.object({
    name: z.string().min(1),
    nameLatin: z.string().min(1),
    role: z.string().min(1),
  }),
  layers: z.array(LayerSchema).length(LAYER_IDS.length),
  /** Lines of the cinematic home (docs/STORYBOARD.md v2.1): one headline per act, metrics as {{tokens}}. */
  cinema: z.object({
    /** Act 1: the core lies on its side, filling the screen. */
    coreHeadline: RichTextSchema,
    /** Act 2: the small guide once the split core is the index. */
    indexGuide: z.string().min(1),
    /** Acts 3–7, one per layer after the surface. */
    acts: z.object(Object.fromEntries(LAYER_IDS.filter((id) => id !== 'surface').map((id) => [id, ActCopySchema])) as Record<Exclude<LayerId, 'surface'>, typeof ActCopySchema>),
    /** Act 3-2: who says which amount in the quoted clash (the amounts themselves come from the citation). */
    gentenClash: z.object({ left: z.string().min(1), right: z.string().min(1) }),
    /** 3-5 result (§13.1): what the fix changed, as "after" against a "before" that has no number. */
    auctionAfter: RichTextSchema,
  }),
  metrics: z.array(MetricSchema).min(1),
});
export type SiteContent = z.infer<typeof SiteContentSchema>;
export type SiteContentInput = z.input<typeof SiteContentSchema>;

export const METRIC_TOKEN = /\{\{([a-z0-9]+(?:-[a-z0-9]+)*)\}\}/g;
