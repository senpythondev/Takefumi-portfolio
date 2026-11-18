/**
 * The world behind the page: the wall shader drawn over the whole viewport
 * (docs/concept/ART_DIRECTION.md §1–2). One mesh, one draw call; its own lazy chunk.
 *
 * - Depth: the wall is locked to the page — `uDepth` is the scroll position in viewport heights,
 *   so scrolling is descending the borehole. Layer tops are measured from the DOM.
 * - Lantern: the beam follows the pointer on the hero and fades out below it. On touch devices it
 *   drifts slowly by itself and follows a drag (PLAN B2).
 * - `uDim`: the rock is brightest on the hero and dimmer under the layers' text.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { Quality } from '@/lib/scroll/store';
import { createWallMaterial, frameWall } from '../materials/wall';
import { createWallController, type WallController } from './controller';

type Props = { track: RefObject<HTMLElement>; ids: string[]; quality: Exclude<Quality, 'static'> };

function Wall({ ids, quality }: Omit<Props, 'track'>) {
  const size = useThree((s) => s.size);
  const material = useMemo(() => createWallMaterial(quality, ids), [quality, ids]);
  const controller = useRef<WallController | null>(null);
  useEffect(() => {
    const c = createWallController(material, ids);
    controller.current = c;
    return () => {
      c.dispose();
      material.dispose();
    };
  }, [material, ids]);
  useEffect(() => frameWall(material, size.width, size.height), [material, size.width, size.height]);
  useFrame((state, delta) => controller.current?.frame(state.clock.elapsedTime, delta, state.size.width, state.size.height));

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default function WorldView({ track, ids, quality }: Props) {
  return (
    <View track={track}>
      <Wall ids={ids} quality={quality} />
    </View>
  );
}
