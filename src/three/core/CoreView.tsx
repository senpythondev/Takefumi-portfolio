/**
 * 3D boring core (BRIEF §3). Drawn behind the HTML core links (src/components/layout/CoreNav.tsx),
 * which remain the accessible controls. An orthographic camera maps 1 world unit to 1 CSS pixel,
 * so each segment lines up with its ring link (same count, height and gap as the CSS grid).
 * Phase 3-8 replaces the standard material with the sedimentary GLSL material.
 */
import { useThree } from '@react-three/fiber';
import { OrthographicCamera, View } from '@react-three/drei';
import { useEffect, useMemo, useSyncExternalStore, type RefObject } from 'react';
import { CylinderGeometry } from 'three';
import { LAYER_COLORS } from '@/lib/layer-colors';
import { scrollStore } from '@/lib/scroll/store';

const GAP_PX = 4; // keep in sync with .core-nav ol { gap } in globals.css
const UNPASSED = '#2a2622';

function Segments({ ids }: { ids: string[] }) {
  const size = useThree((s) => s.size);
  const passed = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().passed, () => ['surface']);
  const current = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().layerId, () => 'surface');
  const n = ids.length;
  const h = (size.height - GAP_PX * (n - 1)) / n;
  const r = (size.width / 2) * 0.86;
  // All segments are the same shape: one shared geometry instead of one per segment.
  const geometry = useMemo(() => new CylinderGeometry(r, r, Math.max(1, h * 0.98), 32), [r, h]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      {ids.map((id, i) => {
        const isPassed = passed.includes(id);
        const isCurrent = id === current;
        const color = LAYER_COLORS[id] ?? '#777777';
        return (
          <mesh key={id} geometry={geometry} position={[0, size.height / 2 - h / 2 - i * (h + GAP_PX), 0]} rotation={[0.22, 0, 0]}>
            <meshStandardMaterial
              color={isPassed ? color : UNPASSED}
              emissive={isCurrent ? color : '#000000'}
              emissiveIntensity={isCurrent ? 0.45 : 0}
              transparent={!isPassed}
              opacity={isPassed ? 1 : 0.45}
            />
          </mesh>
        );
      })}
    </>
  );
}

export function CoreView({ track, ids }: { track: RefObject<HTMLElement>; ids: string[] }) {
  return (
    <View track={track}>
      <OrthographicCamera makeDefault position={[0, 0, 200]} zoom={1} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[60, 120, 160]} intensity={1.3} />
      <Segments ids={ids} />
    </View>
  );
}
