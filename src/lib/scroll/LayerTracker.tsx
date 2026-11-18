'use client';

import { useEffect } from 'react';
import { startLayerObserver } from './observer';

/** Initial island: keeps scrollStore.layerId / passed in sync with the page (IntersectionObserver). */
export function LayerTracker() {
  useEffect(() => startLayerObserver(), []);
  return null;
}
