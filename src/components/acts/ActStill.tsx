import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CSSProperties } from 'react';

/**
 * A still of an act for the stacked version of the story (no 3D: reduced motion, static tier, no JS).
 *
 * The image must not be downloaded on the 3D path, and whether the 3D will run is only known after
 * load (src/three/boot.ts). So with JavaScript the still is a CSS background that applies once the
 * page has settled on the stacked version (`html[data-stage='off']`, globals.css) and the still
 * comes near the viewport (`data-near`, set in src/three/StageLoader.tsx); its box is reserved from
 * hydration on, so nothing moves when it arrives. Without JavaScript the <noscript> image is used.
 *
 * The stills are rendered from the real scene (`npm run poster`); an act without one yet renders
 * nothing (server-side check, so no request ever 404s).
 */
export function ActStill({ name }: { name: string }) {
  const wide = `/media/act-${name}-wide.webp`;
  const tall = `/media/act-${name}-tall.webp`;
  if (!existsSync(join(process.cwd(), 'public', wide)) || !existsSync(join(process.cwd(), 'public', tall))) return null;
  return (
    <figure className="act-still" aria-hidden="true" style={{ '--still-wide': `url(${wide})`, '--still-tall': `url(${tall})` } as CSSProperties}>
      <span className="act-still-image" />
      <noscript>
        <picture>
          <source media="(max-aspect-ratio: 115/100)" srcSet={tall} width={640} height={1280} />
          <img src={wide} width={1280} height={720} alt="" loading="lazy" decoding="async" />
        </picture>
      </noscript>
    </figure>
  );
}
