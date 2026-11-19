/**
 * A still of an act for the stacked version of the story (no 3D: reduced motion, static tier, no JS).
 *
 * The image must not be downloaded on the 3D path, and whether the 3D will run is only known after
 * load (src/three/boot.ts). So with JavaScript the still is a CSS background that applies once the
 * page has settled on the stacked version (`html[data-stage='off']`, globals.css); its box is
 * reserved from hydration on, so nothing moves when it arrives. Without JavaScript the <noscript>
 * image is used.
 */
export function ActStill({ name }: { name: 'core' | 'explode' }) {
  return (
    <figure className={`act-still act-still-${name}`} aria-hidden="true">
      <span className="act-still-image" />
      <noscript>
        <picture>
          <source media="(max-aspect-ratio: 115/100)" srcSet={`/media/act-${name}-tall.webp`} width={640} height={1280} />
          <img src={`/media/act-${name}-wide.webp`} width={1280} height={720} alt="" loading="lazy" decoding="async" />
        </picture>
      </noscript>
    </figure>
  );
}
