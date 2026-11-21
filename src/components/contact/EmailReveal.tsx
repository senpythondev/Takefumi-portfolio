'use client';

import { useState, useSyncExternalStore } from 'react';
import { EMAIL_PARTS, mailtoHref } from '@/content/contact';

const noopSubscribe = () => () => {};

type Labels = { copy: string; copied: string; noscript: string };

/**
 * The address is assembled only in the browser, so it never appears as plain text in the HTML
 * (CLAUDE.md §1-2). Before hydration / without JS, a short note points to GitHub and DEV instead.
 */
export function EmailReveal({ labels }: { labels: Labels }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [copied, setCopied] = useState(false);

  if (!hydrated) {
    return (
      <div className="contact">
        <p className="contact-fallback">{labels.noscript}</p>
      </div>
    );
  }

  const address = `${EMAIL_PARTS.user}@${EMAIL_PARTS.domain}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard unavailable (permissions, insecure context): the address is still shown and selectable.
    }
  };

  return (
    <div className="contact">
      <a className="contact-address" href={mailtoHref()}>
        {address}
      </a>
      <button type="button" className="contact-copy" onClick={copy}>
        {copied ? labels.copied : labels.copy}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? labels.copied : ''}
      </span>
    </div>
  );
}
