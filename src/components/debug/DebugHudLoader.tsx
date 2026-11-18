'use client';

import { useEffect } from 'react';

/** Loads the measurement HUD only when the URL has ?debug (PM_REVIEW_01 D10). */
export function DebugHudLoader() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) void import('./hud').then((m) => m.mountHud());
  }, []);
  return null;
}
