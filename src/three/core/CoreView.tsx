/**
 * 3D boring core (BRIEF §3, docs/concept/core-lab.png). Drawn behind the HTML core links
 * (src/components/layout/CoreNav.tsx), which remain the accessible controls. An orthographic
 * camera maps 1 world unit to 1 CSS pixel, so each band lines up with its link.
 *
 * One slender cylinder, one draw call (was 11 segments): the bands of the layers passed so far
 * stack up along it; the rest is a dark ghost, and the last band waits, faintly glowing.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, View } from '@react-three/drei';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { CylinderGeometry } from 'three';
import { scrollStore, type Quality } from '@/lib/scroll/store';
import { createCoreMaterial, sizeCore, type CoreMaterial } from '../materials/core';

const GLOW_SECONDS = 1.6;
const TILT = 0.2; // shows the polished cut face at the top

/** Per-frame state of the core, kept outside React (plain uniform writes). */
function createCoreDriver(material: CoreMaterial, ids: readonly string[]) {
  let seen = scrollStore.get().passed.length;
  material.uniforms.uPassed.value = seen;
  return (elapsed: number, delta: number) => {
    const { passed, layerId } = scrollStore.get();
    const u = material.uniforms;
    if (passed.length > seen) {
      u.uGlowBand.value = passed.length - 1;
      u.uGlow.value = 1;
    }
    seen = passed.length;
    u.uPassed.value += (passed.length - u.uPassed.value) * (1 - Math.exp(-delta * 5)); // a new band grows in
    u.uGlow.value = Math.max(0, u.uGlow.value - delta / GLOW_SECONDS);
    u.uCurrent.value = Math.max(0, ids.indexOf(layerId));
    u.uTime.value = elapsed;
  };
}

function Core({ ids, quality }: { ids: string[]; quality: Exclude<Quality, 'static'> }) {
  const size = useThree((s) => s.size);
  const radius = Math.max(1, (size.width / 2) * 0.84);
  // The tilt foreshortens the cylinder and adds the cut face's ellipse: fit both into the slot.
  const height = Math.max(1, (size.height - 2 * radius * Math.sin(TILT)) / Math.cos(TILT));

  const geometry = useMemo(() => new CylinderGeometry(radius, radius, height, quality === 'low' ? 56 : 64, 1), [radius, height, quality]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => createCoreMaterial(ids, quality !== 'low'), [ids, quality]);
  const driver = useRef<ReturnType<typeof createCoreDriver> | null>(null);
  useEffect(() => {
    driver.current = createCoreDriver(material, ids);
    return () => material.dispose();
  }, [material, ids]);
  useEffect(() => sizeCore(material, height, radius), [material, height, radius]);
  useFrame((state, delta) => driver.current?.(state.clock.elapsedTime, delta));

  return <mesh geometry={geometry} material={material} rotation={[TILT, 0, 0]} />;
}

export function CoreView({ track, ids, quality }: { track: RefObject<HTMLElement>; ids: string[]; quality: Exclude<Quality, 'static'> }) {
  return (
    <View track={track}>
      <OrthographicCamera makeDefault position={[0, 0, 400]} zoom={1} />
      <Core ids={ids} quality={quality} />
    </View>
  );
}
