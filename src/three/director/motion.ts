/**
 * Motion primitives for the cinematic home (PM: no linear or constant-speed motion anywhere).
 *
 * - `Spring`: a critically damped spring (implicit integration, stable at any frame time). Every
 *   scroll-driven value follows its target through one of these, so motion starts slowly, speeds
 *   up and settles — and lags the scroll slightly, which reads as weight.
 * - `seg` / easings: keyframes are eased curves of the (already smoothed) act progress.
 */

export class Spring {
  x: number;
  v = 0;
  /** Angular frequency (rad/s): higher is snappier. ~6–8 feels heavy but responsive. */
  omega: number;
  constructor(initial: number, omega = 7) {
    this.x = initial;
    this.omega = omega;
  }

  step(target: number, dt: number): number {
    const h = Math.min(dt, 0.1);
    const w = this.omega;
    const f = 1 + 2 * h * w;
    const hww = h * w * w;
    const det = 1 / (f + h * hww);
    const x = (f * this.x + h * this.v + h * hww * target) * det;
    this.v = (this.v + hww * (target - this.x)) * det;
    this.x = x;
    // At rest: land exactly on the target (an asymptote never quite arrives).
    if (Math.abs(target - x) < 1e-4 && Math.abs(this.v) < 1e-3) this.snap(target);
    return this.x;
  }

  /** Still moving toward `target`. */
  moving(target: number): boolean {
    return this.x !== target || this.v !== 0;
  }

  snap(value: number): void {
    this.x = value;
    this.v = 0;
  }
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Eased 0→1 progress of `t` through [a, b]. */
export function seg(t: number, a: number, b: number, ease: (x: number) => number = easeInOutCubic): number {
  return ease(clamp01((t - a) / (b - a)));
}
