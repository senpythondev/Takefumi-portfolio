import { Placeholder } from '../Placeholder';
import type { SceneProps } from '../index';

/** Phase 3 placeholder for the "pegasus" layer. Replaced by the real scene in Phase 5. */
export default function Scene(props: SceneProps) {
  return <Placeholder {...props} color="#7f8fa6" shape="box" />;
}
