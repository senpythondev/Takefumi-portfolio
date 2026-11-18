import { Placeholder } from '../Placeholder';
import type { SceneProps } from '../index';

/** Phase 3 placeholder for the "php-audit" layer. Replaced by the real scene in Phase 5. */
export default function Scene(props: SceneProps) {
  return <Placeholder {...props} color="#a6806f" shape="box" />;
}
