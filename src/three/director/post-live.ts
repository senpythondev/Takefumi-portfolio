/** Per-frame values the director hands to the post-processing chunk (no React state, no re-render). */
export const postLive = {
  /** 0–1 depth-of-field strength (high tier). */
  dof: 0,
  /** Distance from the camera to the hero core (world units). */
  focus: 10,
  /** 0–1 chromatic aberration pulse at the hand-over to the layers. */
  aberration: 0,
};
