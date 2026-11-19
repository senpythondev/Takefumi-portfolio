/**
 * The shots of acts 1–2 (docs/STORYBOARD.md v2.1): from the smoothed progress of each act to wall,
 * core and text. Pure functions — no three.js objects, no DOM — so every beat can be read on its own.
 *
 * Act 2 ends on the **hub shot**: the split core floating in the middle of the screen. Every world
 * act starts and ends on that same framing (run.ts), so a flight from the index to any act, or
 * the plain scroll from one act to the next, never cuts.
 *
 * Units: screen uv is 0–1 with y up (the wall shader's convention); "vh" is a viewport height.
 */
import { WALL_HORIZON } from '../materials/wall';
import { easeInOutCubic, easeInOutSine, mix, seg } from './motion';

export const BANDS = 11;
/** Core proportions (PM_REVIEW_08 §1: diameter : length ≈ 1 : 6). One band is 1 unit long. */
export const CORE_RADIUS = BANDS / 12;
/** The camera of the core shots: the core is framed in a plane HUB_Z in front of it. */
export const HUB_Z = 10;
export const HUB_FOV = 30;
/** Space between the bands once the core is split (band units). */
export const HUB_GAP = 0.55;

export type Progress = { surface: number; explode: number };

export type Frame = {
  /** Landscape (core lies on its side) or portrait (core stays upright). */
  wide: boolean;
  /** Viewport width / height. */
  aspect: number;
  shaftX: number;
};

export type Shot = {
  wall: { zoom: number; panX: number; panY: number; dim: number; geoPulse: number; rig: number; beam: number };
  core: {
    visible: boolean;
    u: number; // screen position of the core centre (uv)
    v: number;
    z: number; // toward the camera (world units)
    lengthVh: number; // on-screen length in viewport heights (sets the scale)
    roll: number; // 0 upright … π/2 lying on its side
    yaw: number;
    tilt: number;
    gap: number; // space between bands (band units)
    leak: number;
    rim: number;
    clipV: number; // screen v of the ground: nothing of the core below it is drawn (< 0: off)
    sparks: number; // 0…1 sparks and dust at the borehole rim (act 1)
    trace: number; // 0…1 a cyan light traces along the core (act 1)
  };
  dof: number; // 0…1 depth of field strength
  dust: number;
  headline: number; // act 1 headline lit
  labels: number; // band labels (act 2)
  hub: number; // 0…1 the split core floats and can be chosen from (act 2)
  front: number; // 0…1 band 1 (current work) turns its cut face to the camera at the end of act 2
};

/** World uv of the borehole mouth (y up). */
function mouth(frame: Frame) {
  return { x: frame.shaftX, y: 1 - WALL_HORIZON };
}

/** Pan that puts the world point `w` at screen point `s` for zoom `z`. */
function panFor(w: { x: number; y: number }, s: { x: number; y: number }, z: number) {
  return { x: w.x - (s.x - 0.5) / z - 0.5, y: w.y - (s.y - 0.5) / z - 0.5 };
}

export function shotAt(p: Progress, frame: Frame): Shot {
  const { wide } = frame;
  const a = p.surface;
  const b = p.explode;
  const m = mouth(frame);

  // ── Act 1, 0–30 %: the camera eases toward the borehole; the geodes pulse ──
  const a1 = seg(a, 0.0, 0.3);
  const a2 = seg(a, 0.3, 0.7);
  const a3 = seg(a, 0.7, 1.0);
  const z1 = mix(1, wide ? 2.4 : 2.2, a1);
  const z2 = mix(z1, wide ? 4.2 : 3.6, a2);
  const zoom = mix(z2, wide ? 5.0 : 4.2, a3);
  const s1 = wide ? { x: mix(frame.shaftX, 0.62, a1), y: mix(m.y, 0.45, a1) } : { x: 0.5, y: mix(m.y, 0.5, a1) };
  // …30–70 %: it tilts up a little: the ground sinks toward the lower third.
  const s2 = { x: wide ? mix(s1.x, 0.56, a2) : 0.5, y: mix(s1.y, wide ? 0.3 : 0.32, a2) };
  const sActs = { x: s2.x, y: mix(s2.y, s2.y - 0.05, a3) };
  const pan = panFor(m, sActs, zoom);

  // ── The core: pulled out of the borehole (30–70 %), then turned and brought to the centre ──
  const diamVh = 0.0125 * zoom; // as wide as the borehole at this zoom
  const emergeLength = BANDS * (diamVh / (2 * CORE_RADIUS)); // on-screen length while rising
  const ground = { u: sActs.x, v: sActs.y };
  const rise = easeInOutSine(a2);
  const emerged = { u: ground.u, v: ground.v + mix(-emergeLength / 2 - 0.01, emergeLength / 2 + 0.02, rise) };
  // Landscape: the core spans 76 % of the width, a little right of centre (the vertical headline of
  // act 1 stands at the left); portrait: 70 % of the height.
  const fitLength = wide ? Math.min(0.76 * frame.aspect, 1.5) : 0.7;
  const centre = { u: wide ? 0.54 : 0.5, v: wide ? 0.55 : 0.54 };
  const lift = easeInOutCubic(a3);
  let u = mix(emerged.u, centre.u, lift);
  const v = mix(emerged.v, centre.v, lift) + 0.06 * Math.sin(Math.PI * lift); // an arc, not a straight line
  let lengthVh = mix(emergeLength, fitLength, easeInOutCubic(a3));
  const roll = wide ? mix(0, Math.PI / 2, seg(a, 0.74, 1.0)) : 0;
  let yaw = mix(0, wide ? -0.32 : 0.28, seg(a, 0.72, 1.0));
  let tilt = mix(0, 0.16, seg(a, 0.75, 1.0));
  const z = mix(0, 0.6, Math.sin(Math.PI * lift) * 0.6 + lift * 0.4);

  // ── Act 2: the bands come apart (0–50 %), float as the index (50–100 %) ──
  const spread = seg(b, 0.0, 0.5);
  const gap = HUB_GAP * spread;
  lengthVh = lengthVh * (BANDS / (BANDS + (BANDS - 1) * gap)) * mix(1, 1.04, spread); // keep it framed
  yaw = mix(yaw, wide ? -0.12 : 0.12, spread);
  tilt = mix(tilt, 0.08, spread);
  // Portrait: the labels sit to the right of the bands, so the core eases left to make room.
  if (!wide) u = mix(u, 0.3, spread);

  const actDim = mix(1, wide ? 0.62 : 0.5, a2) * mix(1, 0.14 / 0.62, a3);
  return {
    wall: {
      zoom,
      panX: pan.x,
      panY: pan.y,
      // The wall goes dark as the core splits: the index floats on a black stage.
      dim: Math.min(1, actDim) * (1 - seg(b, 0.1, 0.5)),
      geoPulse: seg(a, 0.05, 0.3) * (1 - a3),
      rig: Math.sin(Math.PI * a2),
      beam: 1 - seg(a, 0.05, 0.25),
    },
    core: {
      visible: a > 0.28,
      u,
      v,
      z,
      lengthVh,
      roll,
      yaw,
      tilt,
      gap,
      leak: spread,
      rim: mix(0.2, 0.75, a3),
      clipV: a < 0.72 ? ground.v : -1,
      sparks: Math.sin(Math.PI * seg(a, 0.32, 0.72, (x) => x)),
      trace: seg(a, 0.8, 1.0) * (1 - seg(b, 0.0, 0.25)),
    },
    dof: seg(a, 0.45, 0.85) * (1 - seg(b, 0.3, 0.6)),
    dust: seg(a, 0.25, 0.6) * 0.9,
    headline: seg(a, 0.8, 0.98) * (1 - seg(b, 0.02, 0.16)),
    labels: seg(b, 0.2, 0.5) * (1 - seg(b, 0.9, 1.0)),
    hub: seg(b, 0.45, 0.55),
    front: seg(b, 0.85, 1.0),
  };
}
