/**
 * Time for the 3D stage to go live after the first interaction. CI runners render WebGL in
 * software and run tests in parallel; 15 s was occasionally not enough there (CI run 7).
 */
export const STAGE_LIVE_TIMEOUT = 45_000;
