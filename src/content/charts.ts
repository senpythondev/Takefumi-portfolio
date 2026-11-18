/**
 * Build-time chart data for the evidence drawer (no chart library, no JS).
 * Values come from docs/facts/genten-eval.json; labels are the validated metric displays,
 * so a chart can never disagree with the numbers shown on the page.
 */
import { gentenEval } from './facts.ts';
import type { ChartKind, SiteContent } from './schema.ts';

export type ChartBar = { label: string; display: string; value: number; highlight: boolean };
export type Chart = { caption: string; max: number; bars: ChartBar[] };

const ROW_FOR: Record<ChartKind, number> = { 'genten-accuracy': 0, 'genten-citation': 1, 'genten-time': 2 };

export function buildCharts(content: SiteContent): Partial<Record<ChartKind, Chart>> {
  const block = content.layers.flatMap((l) => l.blocks).find((b) => b.kind === 'genten-eval');
  if (!block || block.kind !== 'genten-eval') return {};
  const metrics = new Map(content.metrics.map((m) => [m.id, m]));
  const label = (text: string) => text.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, id: string) => metrics.get(id)?.display ?? '');
  const valueOf = (kind: ChartKind, config: string): number => {
    const s = gentenEval.summary.find((x) => x.config === config);
    if (!s) return 0;
    if (kind === 'genten-accuracy') return (s.correct / gentenEval.questions) * 100;
    if (kind === 'genten-citation') return (s.correct_with_official_citation / gentenEval.questions) * 100;
    return s.avg_seconds ?? s.avg_seconds_approx ?? 0;
  };

  const charts: Partial<Record<ChartKind, Chart>> = {};
  for (const kind of Object.keys(ROW_FOR) as ChartKind[]) {
    const row = block.rows[ROW_FOR[kind]];
    if (!row) continue;
    const bars = block.configs.map((c) => ({
      label: label(c.label),
      display: metrics.get(row.metrics[c.id])?.display ?? '',
      value: valueOf(kind, c.id),
      highlight: c.id === 'genten',
    }));
    charts[kind] = { caption: row.label, max: kind === 'genten-time' ? Math.max(...bars.map((b) => b.value)) : 100, bars };
  }
  return charts;
}
