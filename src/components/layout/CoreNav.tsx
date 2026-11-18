'use client';

import type { CSSProperties } from 'react';
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

  return (
    <>
      <nav className="core-nav" aria-label={label} data-core-slot="">
        <ol>
          {layers.map((l) => (
            <li key={l.id}>
              <a
                href={`#layer-${l.id}`}
                className="core-ring"
                data-passed={passed.includes(l.id) ? '' : undefined}
                aria-current={l.id === currentId ? 'location' : undefined}
                style={{ '--ring': l.color } as CSSProperties}
              >
                <span className="sr-only">
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
