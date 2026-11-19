/**
 * The shots of acts 0–2 and the join (docs/STORYBOARD.md): from the smoothed progress of each act
 * to camera, wall, core and text. Pure functions — no three.js objects, no DOM — so every beat can
 * be read (and tested) on its own.
 *
 * Units: screen uv is 0–1 with y up (the wall shader's convention); "vh" is a viewport height.
 */
import { WALL_HORIZON } from '../materials/wall';
import { easeInOutCubic, easeInOutSine, mix, seg } from './motion';

export const BANDS = 11;
/** Core proportions (PM_REVIEW_08 §1: diameter : length ≈ 1 : 6). One band is 1 unit long. */
export const CORE_RADIUS = BANDS / 12;
/** The band that comes forward at the end of act 2 (the auction world follows in M1). */
export const FRONT_BAND = 5;

export type Progress = { surface: number; explode: number; join: number };

export type Frame = {
  /** Landscape (core lies on its side) or portrait (core stays upright). */
  wide: boolean;
  /** Viewport width / height. */
  aspect: number;
  shaftX: number;
  /** Screen position of the navigator core's centre (uv) and its height in vh. */
  nav: { u: number; v: number; h: number };
  /** Page depth (viewport heights scrolled): where the wall must be once the acts hand over. */
  pageDepth: number;
};

export type Shot = {
  wall: { zoom: number; panX: number; panY: number; depth: number; dim: number; geoPulse: number; rig: number; beam: number };
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
    front: number; // 0…1 the front band turns its cut face to the camera
    leak: number;
    rim: number;
    clipV: number; // screen v of the ground: nothing of the core below it is drawn (< 0: off)
    opacity: number;
    dimOthers: number;
  };
  dof: number; // 0…1 depth of field strength
  dust: number;
  aberration: number;
  headline: number; // HTML: act headline lights up phrase by phrase
  labels: number; // HTML: band labels (act 2)
  labelsFront: number; // HTML: all labels but the front band's fade out
  navOpacity: number; // the navigator core at the edge
  actOn: boolean; // the hero core owns the screen (the navigator steps back)
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
  const j = p.join;
  const m = mouth(frame);

  // ── Act 1, 0–30 %: the camera eases toward the borehole; the geodes pulse ──
  const a1 = seg(a, 0.0, 0.3);
  const a2 = seg(a, 0.3, 0.7);
  const a3 = seg(a, 0.7, 1.0);
  const z1 = mix(1, wide ? 2.4 : 2.2, a1);
  const z2 = mix(z1, wide ? 4.2 : 3.6, a2);
  const zoomActs = mix(z2, wide ? 5.0 : 4.2, a3);
  const s1 = wide ? { x: mix(frame.shaftX, 0.62, a1), y: mix(m.y, 0.45, a1) } : { x: 0.5, y: mix(m.y, 0.5, a1) };
  // …30–70 %: it tilts up a little: the ground sinks toward the lower third.
  const s2 = { x: wide ? mix(s1.x, 0.56, a2) : 0.5, y: mix(s1.y, wide ? 0.3 : 0.32, a2) };
  const sActs = { x: s2.x, y: mix(s2.y, s2.y - 0.05, a3) };
  const panActs = panFor(m, sActs, zoomActs);

  // ── The core: pulled out of the borehole (30–70 %), then turned and brought to the centre ──
  const diamVh = 0.0125 * zoomActs; // as wide as the borehole at this zoom
  const emergeLength = BANDS * (diamVh / (2 * CORE_RADIUS)); // on-screen length while rising
  const ground = { u: sActs.x, v: sActs.y };
  const rise = easeInOutSine(a2);
  const emerged = { u: ground.u, v: ground.v + mix(-emergeLength / 2 - 0.01, emergeLength / 2 + 0.02, rise) };
  // Landscape: the core spans 82 % of the width; portrait: 70 % of the height.
  const fitLength = wide ? Math.min(0.82 * frame.aspect, 1.6) : 0.7;
  const centre = { u: 0.5, v: wide ? 0.55 : 0.54 };
  const lift = easeInOutCubic(a3);
  let u = mix(emerged.u, centre.u, lift);
  let v = mix(emerged.v, centre.v, lift) + 0.06 * Math.sin(Math.PI * lift); // an arc, not a straight line
  let lengthVh = mix(emergeLength, fitLength, easeInOutCubic(a3));
  let roll = wide ? mix(0, Math.PI / 2, seg(a, 0.74, 1.0)) : 0;
  let yaw = mix(0, wide ? -0.32 : 0.28, seg(a, 0.72, 1.0));
  let tilt = mix(0, 0.16, seg(a, 0.75, 1.0));
  let z = mix(0, 0.6, Math.sin(Math.PI * lift) * 0.6 + lift * 0.4);

  // ── Act 2: the bands come apart (0–60 %), the front band turns to the camera (60–100 %) ──
  const spread = seg(b, 0.0, 0.6);
  const front = seg(b, 0.6, 1.0);
  let gap = 0.55 * spread;
  lengthVh = lengthVh * (BANDS / (BANDS + (BANDS - 1) * gap)) * mix(1, 1.04, spread); // keep it framed
  yaw = mix(yaw, wide ? -0.12 : 0.12, spread);
  tilt = mix(tilt, 0.08, spread);
  // Portrait: the labels sit to the right of the bands, so the core eases left to make room.
  if (!wide) u = mix(u, 0.3, spread);

  // ── Join: close up, fly to the navigator, descend to the first layer ──
  const jFront = 1 - seg(j, 0.0, 0.25);
  const jClose = seg(j, 0.05, 0.4);
  const jFly = seg(j, 0.3, 0.95);
  const jFade = seg(j, 0.85, 1.0);
  const frontNow = front * jFront;
  gap = gap * (1 - jClose);
  const navLength = frame.nav.h;
  u = mix(u, frame.nav.u, jFly);
  v = mix(v, frame.nav.v, jFly);
  lengthVh = mix(lengthVh, navLength, easeInOutCubic(jFly));
  roll = mix(roll, 0, jFly);
  yaw = mix(yaw, 0, jFly);
  tilt = mix(tilt, 0.2, jFly);
  z = mix(z, 0, jFly);

  // ── Wall ──
  const jWall = seg(j, 0.15, 0.95);
  const zoom = mix(zoomActs, 1, jWall);
  const depth = mix(0, frame.pageDepth, seg(j, 0.2, 0.9, easeInOutSine));
  const actDim = mix(1, wide ? 0.62 : 0.5, a2) * mix(1, 0.14 / 0.62, a3);
  const deepDim = wide ? 0.55 : 0.26;
  const dim = mix(Math.min(1, actDim), deepDim, jWall);

  const coreOn = a > 0.28 && jFade < 0.999;
  return {
    wall: {
      zoom,
      panX: mix(panActs.x, 0, jWall),
      panY: mix(panActs.y, 0, jWall),
      depth,
      dim,
      geoPulse: seg(a, 0.05, 0.3) * (1 - a3),
      rig: Math.sin(Math.PI * a2),
      beam: 1 - seg(a, 0.05, 0.25),
    },
    core: {
      visible: coreOn,
      u,
      v,
      z: z + 1.6 * frontNow * 0.4,
      lengthVh,
      roll,
      yaw,
      tilt,
      gap,
      front: frontNow,
      leak: spread * (1 - jClose),
      rim: mix(0.2, 0.75, a3) * (1 - jFly * 0.7),
      clipV: a < 0.72 ? ground.v : -1,
      opacity: 1 - jFade,
      dimOthers: mix(1, 0.32, frontNow),
    },
    dof: seg(a, 0.45, 0.85) * (1 - jWall),
    dust: mix(seg(a, 0.25, 0.6) * 0.9, 0.25, jWall),
    aberration: Math.sin(Math.PI * seg(j, 0.0, 0.35)) * 0.6,
    headline: seg(a, 0.8, 0.98) * (1 - seg(b, 0.02, 0.16)),
    labels: seg(b, 0.22, 0.55) * (1 - seg(j, 0.0, 0.2)),
    labelsFront: front,
    navOpacity: jFade,
    actOn: a > 0.25 && jFade < 0.999,
  };
}
