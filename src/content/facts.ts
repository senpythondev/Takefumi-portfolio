/**
 * Typed access to docs/facts/ (CLAUDE.md §0: data in docs/facts/ is as authoritative as the fact sheet).
 * Runnable by Node type stripping (imported by scripts/validate-content.ts).
 */
import { z } from 'zod';
import gentenEvalRaw from '../../docs/facts/genten-eval.json' with { type: 'json' };

const ConfigId = z.enum(['closed-book', 'keyword-search', 'genten']);

export const GentenEvalSchema = z.object({
  source: z.string(),
  confidence: z.literal('measured'),
  configs: z.array(z.object({ id: ConfigId, label_ja: z.string(), label_en: z.string() })).length(3),
  questions: z.number().int().positive(),
  results: z.array(z.object({ question: z.number().int().positive(), config: ConfigId, correct: z.boolean() })),
  summary: z
    .array(
      z.object({
        config: ConfigId,
        correct: z.number().int().nonnegative(),
        correct_with_official_citation: z.number().int().nonnegative(),
        avg_seconds: z.number().positive().optional(),
        avg_seconds_approx: z.number().positive().optional(),
      }),
    )
    .length(3),
  summary_source: z.string(),
});

export type GentenEval = z.infer<typeof GentenEvalSchema>;
export type GentenConfigId = z.infer<typeof ConfigId>;

export const gentenEval: GentenEval = GentenEvalSchema.parse(gentenEvalRaw);

/** results[question-1][config] → correct */
export function gentenGrid(data: GentenEval = gentenEval): Array<Record<GentenConfigId, boolean>> {
  const grid: Array<Record<GentenConfigId, boolean>> = [];
  for (let q = 1; q <= data.questions; q += 1) {
    const row = {} as Record<GentenConfigId, boolean>;
    for (const c of data.configs) {
      const hit = data.results.find((r) => r.question === q && r.config === c.id);
      if (!hit) throw new Error(`genten-eval.json: missing result for question ${q} / ${c.id}`);
      row[c.id] = hit.correct;
    }
    grid.push(row);
  }
  return grid;
}
