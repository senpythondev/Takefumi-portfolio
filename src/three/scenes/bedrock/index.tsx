import { Placeholder } from '../Placeholder';
import type { SceneProps } from '../index';

/** Phase 3 placeholder for the "bedrock" layer. Replaced by the real scene in Phase 5. */
export default function Scene(props: SceneProps) {
  return <Placeholder {...props} color="#6f665c" shape="plane" />;
}
