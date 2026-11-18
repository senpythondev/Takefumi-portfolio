/** Ids and paths shared by the server components and the (tiny) client controller. */
export const EVIDENCE_DIALOG_ID = 'evidence-dialog';
export const EVIDENCE_TITLE_ID = 'evidence-title';
/** One shared description ("show evidence") for every metric link, rendered once per page. */
export const METRIC_HINT_ID = 'metric-hint';
/** Shareable hash from before the evidence pages existed (#ev-<metric-id>); still opens the dialog. */
export const LEGACY_HASH_PREFIX = 'ev-';

export function evidencePath(locale: string, metricId: string): string {
  return `/${locale}/evidence/${metricId}`;
}

export function evidenceFragmentPath(locale: string, metricId: string): string {
  return `${evidencePath(locale, metricId)}/fragment`;
}
