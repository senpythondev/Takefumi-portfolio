import { Placeholder } from '../Placeholder';
import type { SceneProps } from '../index';

/** Phase 3 placeholder for the "surface" layer. Replaced by the real scene in Phase 5. */
export default function Scene(props: SceneProps) {
  return <Placeholder {...props} color="#8a7a66" shape="plane" />;
}
