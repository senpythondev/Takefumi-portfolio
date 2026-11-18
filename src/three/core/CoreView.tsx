/**
 * 3D boring core (BRIEF §3). Drawn behind the HTML core links (src/components/layout/CoreNav.tsx),
 * which remain the accessible controls. An orthographic camera maps 1 world unit to 1 CSS pixel,
 * so each segment lines up with its ring link (same count, height and gap as the CSS grid).
 *
 * Each segment uses the sedimentary strata material in its layer colour. A ring that has just
 * been passed glows from the inside and fades over GLOW_SECONDS; the current layer keeps a faint glow.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, View } from '@react-three/drei';
import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { CylinderGeometry } from 'three';
import { LAYER_COLORS } from '@/lib/layer-colors';
import { scrollStore, type Quality } from '@/lib/scroll/store';
import { createStrataMaterial } from '../materials/strata';

const GAP_PX = 4; // keep in sync with .core-nav ol { gap } in globals.css
const GLOW_SECONDS = 1.6;
const CURRENT_GLOW = 0.22;

function Segments({ ids, quality }: { ids: string[]; quality: Exclude<Quality, 'static'> }) {
  const size = useThree((s) => s.size);
  const passed = useSyncExternalStore(scrollStore.subscribe, () => scrollStore.get().passed, () => ['surface']);
  const n = ids.length;
  const h = Math.max(1, (size.height - GAP_PX * (n - 1)) / n);
  const r = Math.max(1, (size.width / 2) * 0.86);

  // All segments are the same shape: one shared geometry. One material per layer colour
  // (a single shader program is shared between them).
  const geometry = useMemo(() => new CylinderGeometry(r, r, h * 0.98, quality === 'low' ? 16 : 32), [r, h, quality]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const materials = useMemo(
    () => ids.map((id, i) => createStrataMaterial({ color: LAYER_COLORS[id] ?? '#777777', bandScale: 3.2 / h, quality, seed: i * 1.7 })),
    [ids, h, quality],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  // Glow bookkeeping: when a layer enters `passed`, start its glow at 1 and let it decay.
  const glow = useRef<number[]>([]);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (known.current === null) {
      known.current = new Set(passed); // first render: no glow for layers already passed
    } else {
      ids.forEach((id, i) => {
        if (passed.includes(id) && !known.current?.has(id)) glow.current[i] = 1;
      });
      known.current = new Set(passed);
    }
    ids.forEach((id, i) => materials[i]?.userData.strata.setPassed(passed.includes(id)));
  }, [passed, ids, materials]);

  useFrame((_, delta) => {
    const current = scrollStore.get().layerId;
    ids.forEach((id, i) => {
      const g = Math.max(0, (glow.current[i] ?? 0) - delta / GLOW_SECONDS);
      glow.current[i] = g;
      // ease-out so the glow lingers softly before it is gone
      materials[i]?.userData.strata.setGlow(Math.max(g * g, id === current ? CURRENT_GLOW : 0));
    });
  });

  return (
    <>
      {ids.map((id, i) => (
        <mesh key={id} geometry={geometry} material={materials[i]} position={[0, size.height / 2 - h / 2 - i * (h + GAP_PX), 0]} rotation={[0.22, 0, 0]} />
      ))}
    </>
  );
}

export function CoreView({ track, ids, quality }: { track: RefObject<HTMLElement>; ids: string[]; quality: Exclude<Quality, 'static'> }) {
  return (
    <View track={track}>
      <OrthographicCamera makeDefault position={[0, 0, 200]} zoom={1} />
      <Segments ids={ids} quality={quality} />
    </View>
  );
}
