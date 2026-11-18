import { getTranslations } from 'next-intl/server';
import { esc } from './evidence-html';
import { EVIDENCE_DIALOG_ID, EVIDENCE_TITLE_ID } from './ids';

/**
 * The page's single evidence dialog. Its body is filled by EvidenceController with the fragment
 * of the selected metric (/[locale]/evidence/[id]/fragment), so the page HTML no longer carries all
 * 74 evidences (PM_REVIEW_07 §2-1). Emitted as a static string: React never manages it.
 */
export async function EvidenceDialog() {
  const t = await getTranslations('evidence');
  const html =
    `<dialog id="${EVIDENCE_DIALOG_ID}" class="evidence" aria-labelledby="${EVIDENCE_TITLE_ID}" closedby="any">` +
    `<div class="evidence-panel">` +
    `<form method="dialog" class="evidence-close"><button type="submit">${esc(t('close'))}</button></form>` +
    `<div class="evidence-body" data-evidence-body data-loading-label="${esc(t('loading'))}"></div>` +
    `</div></dialog>`;
  return <div className="evidence-host" dangerouslySetInnerHTML={{ __html: html }} />;
}
