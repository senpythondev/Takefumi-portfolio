/**
 * The story position the picture is at (docs/STORYBOARD.md v2.3 §9).
 *
 * The scroll position is only a target. The playhead goes toward it in two ways:
 *
 * - **Following** (camera moves, slow changes): through a critically damped spring, so the picture
 *   lags the scroll, keeps gliding after the scroll stops and comes to rest softly.
 * - **Key moments** (`Cue`s: the core's extraction, the split, the entry and return through a cut
 *   face, the sealing in gold…): once the scroll crosses a cue's threshold, the playhead crosses the cue's
 *   range at a fixed tempo, whatever the scroll speed; scrolling back over the threshold plays it
 *   back at the same tempo. Inside a cue's range the playhead never follows the scroll.
 *
 * Everything on screen stays a function of this one number, so playing back is always the exact
 * reverse. Pure: no three.js, no DOM.
 */
import { Spring } from './motion';

/**
 * A key moment, in story units (act index + progress): its range, and how long it plays (seconds).
 * It starts when the scroll, coming from before it, is `START` of the way into the range; it plays
 * back when the scroll, coming from after it, is that far in from the other end. Between the two
 * points nothing changes its mind, so a hand resting on the wheel never makes it flip.
 */
/** `hold`: seconds the playhead rests at the end of the moment before it goes further (reading time). */
/** `maxBoost`: the most a fast scroll may hurry this moment (a beat's sentence must stay readable). */
export type Cue = { g0: number; g1: number; dur: number; hold?: number; maxBoost?: number };
const START = 0.25;

/** Further than this from the scroll (in acts), the playhead cuts instead of playing every act between. */
const CUT = 1.5;
/** Further than this from the scroll, the rests after key moments are skipped: nobody is reading there. */
const HURRY = 0.9;
/** Heading past a cue's edge, the spring aims this far beyond it, so it arrives still moving a little
    (aiming at the edge itself would crawl up to it) and the key moment starts without a wait. */
const LEAD = 0.03;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Playhead {
  x = 0;
  /** Where the playhead is heading (the scroll position, held at the edges of the key moments). */
  target = 0;
  /** In a key moment right now. */
  timed = false;
  private readonly spring = new Spring(0, 3);
  private readonly cues: Cue[];
  private readonly on: boolean[];
  private last = 0;
  /** Seconds left of the rest after a key moment (only going forward). */
  private rest = 0;

  constructor(cues: Cue[]) {
    this.cues = [...cues].sort((a, b) => a.g0 - b.g0);
    this.on = this.cues.map(() => false);
  }

  snap(g: number): void {
    this.x = g;
    this.target = g;
    this.spring.snap(g);
    this.last = g;
    this.rest = 0;
    for (let i = 0; i < this.cues.length; i += 1) {
      const c = this.cues[i] as Cue;
      this.on[i] = g > (c.g0 + c.g1) / 2;
    }
  }

  moving(): boolean {
    return this.x !== this.target || this.spring.v !== 0;
  }

  /** `raw`: the scroll's story position; `omega`: the follow spring; `tempo`: speed of the key moments. */
  step(raw: number, dt: number, omega: number, tempo: number): number {
    // 1. Thresholds: which side of every key moment the scroll asks for.
    let target = raw;
    for (let i = 0; i < this.cues.length; i += 1) {
      const c = this.cues[i] as Cue;
      if (raw >= c.g1) this.on[i] = true;
      else if (raw <= c.g0) this.on[i] = false;
      else {
        const up = c.g0 + START * (c.g1 - c.g0);
        const down = c.g1 - START * (c.g1 - c.g0);
        if (this.last < up && raw >= up) this.on[i] = true;
        else if (this.last > down && raw <= down) this.on[i] = false;
        target = this.on[i] ? c.g1 : c.g0;
      }
    }
    this.last = raw;
    this.target = target;
    const dist = Math.abs(target - this.x);
    if (dist > CUT) {
      this.snap(target);
      this.timed = false;
      return this.x;
    }
    // Far behind a fast scroll: catch up sooner (still eased), rather than fall acts behind.
    const boost = 1 + 3 * smooth(0.5, 2, dist);

    // 2. Advance: at a fixed tempo inside a key moment, with the spring between them.
    // A key moment keeps its tempo in wall-clock time even on a slow frame (the spring caps its own step).
    let t = Math.min(dt, 0.5);
    this.timed = false;
    // The rest after a key moment: time passes whether or not the scroll asks for more; going on waits for it.
    if (dist > HURRY) this.rest = 0;
    if (this.rest > 0) {
      const wait = Math.min(this.rest, t);
      this.rest -= wait;
      if (target > this.x) t -= wait;
      else if (target < this.x) this.rest = 0;
    }
    for (let pass = 0; pass < 4 && t > 1e-5; pass += 1) {
      const x = this.x;
      const dir = Math.sign(target - x);
      if (dir === 0) break;
      const c = this.cues.find((q) => (x > q.g0 && x < q.g1) || (x === q.g0 && dir > 0) || (x === q.g1 && dir < 0));
      if (c) {
        this.timed = true;
        const rate = ((c.g1 - c.g0) / c.dur) * tempo * Math.min(boost, c.maxBoost ?? Infinity);
        const edge = dir > 0 ? c.g1 : c.g0;
        const need = Math.abs(edge - x) / rate;
        if (need <= t) {
          this.x = edge;
          t -= need;
          if (dir > 0 && c.hold && dist <= HURRY) {
            this.rest = c.hold;
            this.spring.snap(this.x);
            break;
          }
        } else {
          this.x = x + dir * rate * t;
          t = 0;
        }
        this.spring.snap(this.x);
        continue;
      }
      let lo = -Infinity;
      let hi = Infinity;
      for (const q of this.cues) {
        if (q.g1 <= x) lo = Math.max(lo, q.g1);
        if (q.g0 >= x) hi = Math.min(hi, q.g0);
      }
      this.spring.omega = omega * boost;
      // The spring takes steps of at most 0.1 s: on a slow frame it takes several, so the picture
      // follows at the same pace in wall-clock time on a slow device.
      const aim = Math.min(hi + LEAD, Math.max(lo - LEAD, target));
      for (let left = t; left > 1e-5; left -= 0.1) this.x = this.spring.step(aim, Math.min(left, 0.1));
      if (this.x >= hi) this.spring.snap((this.x = hi));
      else if (this.x <= lo) this.spring.snap((this.x = lo));
      break;
    }
    return this.x;
  }
}
