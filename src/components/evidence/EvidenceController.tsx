'use client';

import { useEffect } from 'react';

const PREFIX = 'ev-';

function dialogById(id: string | null): HTMLDialogElement | null {
  if (!id || !id.startsWith(PREFIX)) return null;
  const el = document.getElementById(id);
  return el instanceof HTMLDialogElement ? el : null;
}

/**
 * Progressive enhancement for the evidence dialogs:
 * - Invoker Commands fallback (`commandfor` / `command="show-modal"`) for older browsers
 * - `#ev-<metric-id>` in the URL opens that evidence directly (shareable)
 * - light dismiss (click on the backdrop) where `closedby="any"` is unsupported
 */
export function EvidenceController() {
  useEffect(() => {
    const nativeCommands = 'command' in HTMLButtonElement.prototype;
    const nativeClosedBy = 'closedBy' in HTMLDialogElement.prototype;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (!nativeCommands) {
        const button = target.closest<HTMLButtonElement>('button[commandfor][command="show-modal"]');
        const dialog = dialogById(button?.getAttribute('commandfor') ?? null);
        if (dialog && !dialog.open) {
          dialog.showModal();
          return;
        }
      }

      if (!nativeClosedBy && target instanceof HTMLDialogElement && target.classList.contains('evidence')) {
        const r = target.getBoundingClientRect();
        const outside = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
        if (outside) target.close();
      }
    };

    const openFromHash = () => {
      const dialog = dialogById(decodeURIComponent(window.location.hash.slice(1)));
      if (dialog && !dialog.open) dialog.showModal();
    };

    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  return null;
}
