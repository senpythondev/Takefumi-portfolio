'use client';

import { useEffect } from 'react';

/** Loads the measurement HUD only when the URL has ?debug (PM_REVIEW_01 D10), and the scroll tuning panel with ?debug=scroll. */
export function DebugHudLoader() {
  useEffect(() => {
    const debug = new URLSearchParams(window.location.search).get('debug');
    if (debug !== null) void import('./hud').then((m) => m.mountHud());
    // ?debug=scroll: the owner's tuning panel (STORYBOARD v2.3 §9-4).
    if (debug === 'scroll') void import('./scroll-panel').then((m) => m.mountScrollPanel());
  }, []);
  return null;
}
