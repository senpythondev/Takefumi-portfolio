'use client';

import { useEffect } from 'react';
import { EVIDENCE_DIALOG_ID, EVIDENCE_TITLE_ID, evidenceFragmentPath, LEGACY_HASH_PREFIX } from './ids';

const METRIC_LINK = 'a.metric[data-metric]';

/**
 * Progressive enhancement for evidence (PM_REVIEW_07 §2-1). Without JS every metric is a plain link
 * to its evidence page. With JS:
 * - a click opens the same content in the page's dialog (fetched from the static fragment);
 * - hover, focus and touch start prefetch the fragment, so the dialog usually fills at once;
 * - `#ev-<metric-id>` (links shared before the evidence pages existed) still opens the dialog;
 * - "copy a link" copies the evidence page's URL;
 * - light dismiss (click on the backdrop) where `closedby="any"` is unsupported.
 */
export function EvidenceController() {
  useEffect(() => {
    const dialog = document.getElementById(EVIDENCE_DIALOG_ID);
    if (!(dialog instanceof HTMLDialogElement)) return;
    const body = dialog.querySelector<HTMLElement>('[data-evidence-body]');
    if (!body) return;
    const locale = document.documentElement.lang;
    const nativeClosedBy = 'closedBy' in HTMLDialogElement.prototype;
    const cache = new Map<string, Promise<string>>();
    let request = 0;

    const load = (id: string): Promise<string> => {
      let html = cache.get(id);
      if (!html) {
        html = fetch(evidenceFragmentPath(locale, id)).then((r) => {
          if (!r.ok) throw new Error(`evidence ${id}: ${r.status}`);
          return r.text();
        });
        html.catch(() => cache.delete(id)); // a later attempt may succeed
        cache.set(id, html);
      }
      return html;
    };

    const open = async (id: string, onError: () => void) => {
      const current = ++request;
      const html = load(id);
      // Already loaded (prefetched): the content is swapped in before the next paint, no flicker.
      body.replaceChildren();
      const loading = document.createElement('p');
      loading.id = EVIDENCE_TITLE_ID;
      loading.className = 'evidence-loading';
      loading.setAttribute('role', 'status');
      loading.textContent = body.dataset.loadingLabel ?? '';
      body.append(loading);
      dialog.setAttribute('aria-busy', 'true');
      if (!dialog.open) dialog.showModal();
      try {
        const fragment = await html;
        if (current !== request) return;
        body.innerHTML = fragment; // same-origin, build-time HTML with every value escaped
      } catch {
        if (current !== request) return;
        dialog.close();
        onError();
      } finally {
        if (current === request) dialog.removeAttribute('aria-busy');
      }
    };

    const metricLink = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLAnchorElement>(METRIC_LINK) : null);

    const prefetch = (event: Event) => {
      const id = metricLink(event.target)?.dataset.metric;
      if (id) void load(id).catch(() => undefined);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = metricLink(target);
      if (link?.dataset.metric) {
        // New tab, new window, download: leave those to the browser (they open the evidence page).
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const href = link.href;
        void open(link.dataset.metric, () => window.location.assign(href));
        return;
      }

      const copy = target.closest<HTMLButtonElement>('button[data-copy-evidence]');
      if (copy?.dataset.copyEvidence) {
        void navigator.clipboard.writeText(new URL(copy.dataset.copyEvidence, window.location.origin).href).then(
          () => {
            copy.textContent = copy.dataset.copiedLabel ?? copy.textContent;
          },
          () => undefined, // clipboard blocked: the evidence page's URL is still in the link
        );
        return;
      }

      if (!nativeClosedBy && target === dialog) {
        const r = dialog.getBoundingClientRect();
        const outside = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
        if (outside) dialog.close();
      }
    };

    const openFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash.startsWith(LEGACY_HASH_PREFIX)) return;
      const id = hash.slice(LEGACY_HASH_PREFIX.length);
      // Unknown id: nothing to show, and the page stays where it is.
      if (/^[a-z0-9-]+$/.test(id)) void open(id, () => undefined);
    };

    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('focusin', prefetch);
    document.addEventListener('touchstart', prefetch, { passive: true });
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', prefetch);
      document.removeEventListener('focusin', prefetch);
      document.removeEventListener('touchstart', prefetch);
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  return null;
}
