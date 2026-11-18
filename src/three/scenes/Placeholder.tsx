/**
 * Phase 3 placeholder scene: a slowly turning strata cross-section in the layer colour.
 * It owns the kinds of GPU resources a real scene will (geometry, material/program, and on the
 * low tier a baked texture), so mounting/unmounting can be checked for leaks.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { createStrataMaterial } from '../materials/strata';
import type { SceneProps } from './index';

export type PlaceholderProps = SceneProps & { color: string; shape: 'box' | 'cylinder' | 'plane' };

export function Placeholder({ color, shape, quality, layerId }: PlaceholderProps) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => createStrataMaterial({ color, bandScale: 3, quality, seed: layerId.length * 0.37 }), [color, quality, layerId]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * (quality === 'low' ? 0.15 : 0.3);
  });

  return (
    <mesh ref={mesh} material={material} rotation={[0.35, 0.6, 0]}>
      {shape === 'box' ? <boxGeometry args={[1.6, 1.6, 1.6]} /> : null}
      {shape === 'cylinder' ? <cylinderGeometry args={[0.9, 0.9, 2.2, quality === 'low' ? 16 : 48]} /> : null}
      {shape === 'plane' ? <planeGeometry args={[2.6, 1.6]} /> : null}
    </mesh>
  );
}
