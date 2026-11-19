/** Per-frame values the director hands to the post-processing chunk (no React state, no re-render). */
export const postLive = {
  /** 0–1 depth-of-field strength (high tier). */
  dof: 0,
  /** Distance from the camera to the hero core (world units). */
  focus: 10,
  /** 0–1 chromatic aberration pulse as a world is entered or left (STORYBOARD v2.1 §3). */
  aberration: 0,
  /** 0–1 the film grain rises for a moment with the same pulse. */
  grain: 0,
};
