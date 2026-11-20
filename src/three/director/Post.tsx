/**
 * Post-processing for the cinematic home (STORYBOARD §3-4; Active Theory and Blendr references):
 * - high: depth of field (the wall falls out of focus behind the core), bloom, film grain,
 *   vignette, a brief chromatic aberration (and more grain) as a world is entered or left;
 * - medium: bloom at half resolution, grain, vignette — no depth of field.
 * Its own lazy chunk, loaded after the first frames; the low tier never loads it.
 * Tone mapping happens here (ACES), once, at the end.
 */
import { useFrame } from '@react-three/fiber';
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type BloomEffect, type ChromaticAberrationEffect, type DepthOfFieldEffect, type NoiseEffect } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import { Vector2 } from 'three';
import { postLive } from './post-live';

export default function Post({ quality, onReady }: { quality: 'high' | 'medium'; onReady: () => void }) {
  const dof = useRef<DepthOfFieldEffect>(null);
  const aberration = useRef<ChromaticAberrationEffect>(null);
  const noise = useRef<NoiseEffect>(null);
  const bloom = useRef<BloomEffect>(null);
  const offset = useMemo(() => new Vector2(0, 0), []);
  useEffect(() => {
    onReady();
  }, [onReady]);
  useFrame(() => {
    const d = dof.current;
    if (d) {
      d.cocMaterial.worldFocusDistance = postLive.focus;
      d.cocMaterial.worldFocusRange = 2.2;
      d.bokehScale = 4.5 * postLive.dof;
    }
    offset.set(0.0022 * postLive.aberration, 0.0012 * postLive.aberration);
    // The film grain rises for a moment as a world is entered or left.
    if (noise.current) noise.current.blendMode.opacity.value = 0.32 + 0.3 * postLive.grain;
    if (bloom.current) bloom.current.intensity = (quality === 'high' ? 0.95 : 0.8) * postLive.bloom;
  }, 0);

  const high = quality === 'high';
  return (
    <EffectComposer multisampling={0} renderPriority={1}>
      {high ? <DepthOfField ref={dof} worldFocusDistance={10} worldFocusRange={2.2} bokehScale={0} /> : <></>}
      <Bloom ref={bloom} mipmapBlur intensity={high ? 0.95 : 0.8} luminanceThreshold={0.55} luminanceSmoothing={0.3} resolutionScale={high ? 1 : 0.5} />
      {high ? <ChromaticAberration ref={aberration} offset={offset} radialModulation={false} modulationOffset={0} /> : <></>}
      <Noise ref={noise} premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.32} />
      <Vignette offset={0.28} darkness={0.62} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
