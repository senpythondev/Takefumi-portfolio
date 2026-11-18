/**
 * Phase 3 placeholder scene. Deliberately holds the kinds of GPU resources a real scene will
 * (geometry, material/program, a data texture) so mounting/unmounting can be checked for leaks.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DataTexture, RGBAFormat, type Mesh } from 'three';
import type { SceneProps } from './index';

export type PlaceholderProps = SceneProps & { color: string; shape: 'box' | 'cylinder' | 'plane' };

function stripes(color: string): DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < size; y += 1) {
    const band = Math.floor(y / 8) % 2 === 0 ? 1 : 0.6; // sediment-like horizontal bands
    for (let x = 0; x < size; x += 1) {
      const o = (y * size + x) * 4;
      data[o] = (r ?? 0) * band;
      data[o + 1] = (g ?? 0) * band;
      data[o + 2] = (b ?? 0) * band;
      data[o + 3] = 255;
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export function Placeholder({ color, shape, quality }: PlaceholderProps) {
  const mesh = useRef<Mesh>(null);
  const texture = useMemo(() => stripes(color), [color]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * (quality === 'low' ? 0.15 : 0.3);
  });

  return (
    <group>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={1.2} />
      <mesh ref={mesh} rotation={[0.35, 0.6, 0]}>
        {shape === 'box' ? <boxGeometry args={[1.6, 1.6, 1.6]} /> : null}
        {shape === 'cylinder' ? <cylinderGeometry args={[0.9, 0.9, 2.2, quality === 'low' ? 16 : 48]} /> : null}
        {shape === 'plane' ? <planeGeometry args={[2.6, 1.6]} /> : null}
        <meshStandardMaterial map={texture} />
      </mesh>
    </group>
  );
}
