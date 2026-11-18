'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useScrollState } from '@/lib/scroll/store';

export type CoreLayer = { id: string; depth: string; title: string; color: string };

/**
 * Boring-core navigator (BRIEF §3) — HTML version, always present and keyboard/no-JS usable:
 * one anchor link per layer. Rings of layers the visitor has passed are filled; the 3D core
 * (src/three/core) is drawn behind these links when the stage runs, the links stay the controls.
 * Also renders the depth meter (current depth and layer name).
 */
export function CoreNav({ layers, label }: { layers: CoreLayer[]; label: string }) {
  const passed = useScrollState((s) => s.passed);
  const currentId = useScrollState((s) => s.layerId);
  const current = layers.find((l) => l.id === currentId) ?? layers[0];
  const [open, setOpen] = useState(false);
  // CSS reads the current layer from <html data-layer> (the poster belongs to the surface only).
  useEffect(() => {
    document.documentElement.dataset.layer = currentId;
  }, [currentId]);

  return (
    <>
      {/* Narrow screens: the core is a thin progress bar; this button opens it into a labelled list. */}
      <button type="button" className="core-toggle" aria-expanded={open} aria-controls="core-list" aria-label={label} onClick={() => setOpen((o) => !o)} />
      <nav className="core-nav" aria-label={label} data-core-slot="" data-open={open ? '' : undefined}>
        <ol id="core-list">
          {layers.map((l) => (
            <li key={l.id}>
              <a
                href={`#layer-${l.id}`}
                className="core-ring"
                data-passed={passed.includes(l.id) ? '' : undefined}
                aria-current={l.id === currentId ? 'location' : undefined}
                style={{ '--ring': l.color } as CSSProperties}
                onClick={() => setOpen(false)}
              >
                <span className="core-label">
                  {l.depth}：{l.title}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {current ? (
        <p className="depth-meter" aria-hidden="true">
          <span className="depth-meter-depth">{current.depth}</span>
          <span className="depth-meter-title">{current.title}</span>
        </p>
      ) : null}
    </>
  );
}
