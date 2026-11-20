/**
 * Clicking bare rock drills it (STORYBOARD v2.3 §11.4). A small bit spins into the rock where the
 * visitor clicked: sparks and dust fly, chips fall, the hole glows cyan and thin cracks run out from
 * it; a few seconds later sand settles into the hole and the rock is whole again.
 *
 * Digging brings up evidence: one real number rises from the hole as a small label and opens its
 * evidence when clicked. The label is a copy of a number that is already in the page's HTML
 * (a `MetricLink` of the layer on screen first, then of any layer) — nothing is made up here, and
 * every number stays readable in the case studies and evidence pages without this.
 *
 * At most three holes at a time. Mouse: a click on rock; touch: only a still tap (a scroll never
 * digs); never from the keyboard; not loaded at all for reduced motion or without the 3D. No gold
 * (§8.4). Each hole is a small 2D canvas — nothing is added to the 3D scene.
 */
import { scrollLive } from './store';
import type { FrameListener } from './effects';

const SIZE = 240; // CSS px of a hole's canvas
const LIFE = 6.8; // seconds
const REFILL = 4.9;
const MAX = 3;
const NOT_ROCK = 'a, button, input, label, select, textarea, summary, dialog, header, nav, form, [class^="debug-"], .hero-content, .act-headline, .act-metrics, .drill-label, p, li, h1, h2, h3';

type Hole = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; label: HTMLElement | null; start: number; seed: number; scrollY: number; done: boolean };

const hash = (n: number) => {
  const s = Math.sin(n * 91.345) * 47453.5453;
  return s - Math.floor(s);
};
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

export function startDrill(addFrameListener: (fn: FrameListener) => () => void): () => void {
  const holes: Hole[] = [];
  let turn = 0;

  /** A number of the layer on screen (then of any layer), copied from the page's own HTML. */
  const pickMetric = (): HTMLElement | null => {
    const local = [...document.querySelectorAll<HTMLElement>(`section[data-layer="${scrollLive.layer}"] a.metric[data-metric]`)];
    const all = local.length ? local : [...document.querySelectorAll<HTMLElement>('main a.metric[data-metric]')];
    if (!all.length) return null;
    const source = all[turn % all.length] as HTMLElement;
    turn += 1;
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.querySelectorAll('[data-ticker]').forEach((el) => el.removeAttribute('data-ticker'));
    const label = document.createElement('span');
    label.className = 'drill-label';
    label.appendChild(copy);
    return label;
  };

  const dig = (x: number, y: number) => {
    if (holes.length >= MAX) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.className = 'drill-hole';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = SIZE * scale;
    canvas.height = SIZE * scale;
    canvas.style.left = `${x - SIZE / 2}px`;
    canvas.style.top = `${y - SIZE / 2}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    document.body.appendChild(canvas);
    const label = pickMetric();
    if (label) {
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      document.body.appendChild(label);
      // It rises out of the hole once the bit has gone (a fixed, calm tempo).
      label.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -20%) scale(0.6)' },
          { opacity: 1, transform: 'translate(-50%, -190%) scale(1)' },
        ],
        { duration: 900, delay: 1000, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
      );
      // It can be pressed once it is up (until then it must not cover the rock it comes out of).
      window.setTimeout(() => label.setAttribute('data-up', ''), 1500);
    }
    holes.push({ canvas, ctx, label, start: performance.now(), seed: Math.random() * 100, scrollY: window.scrollY, done: false });
  };

  const draw = (h: Hole, t: number) => {
    const c = h.ctx;
    const o = SIZE / 2;
    c.clearRect(0, 0, SIZE, SIZE);
    const bite = ease(t / 0.9); // the bit goes in
    const fill = ease((t - REFILL) / 1.6); // sand comes back
    const open = bite * (1 - fill);
    const R = 15;

    // Cracks: thin, jagged, running out from the hole.
    c.lineWidth = 1;
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2 + hash(h.seed + k) * 0.6;
      const len = (26 + 40 * hash(h.seed + k * 3.1)) * ease((t - 0.35) / 0.8);
      c.strokeStyle = `rgba(143, 203, 208, ${0.5 * (1 - fill)})`;
      c.beginPath();
      c.moveTo(o + Math.cos(a) * R * 0.9, o + Math.sin(a) * R * 0.55);
      for (let s = 1; s <= 4; s += 1) {
        const d = R + (len * s) / 4;
        const j = (hash(h.seed + k * 7 + s) - 0.5) * 0.35;
        c.lineTo(o + Math.cos(a + j) * d, o + Math.sin(a + j) * d * 0.62);
      }
      c.stroke();
    }

    // The hole: dark, with cyan light deep inside.
    if (open > 0.01) {
      c.save();
      c.translate(o, o);
      c.scale(1, 0.62);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R * open);
      g.addColorStop(0, `rgba(170, 235, 240, ${0.95 * open})`);
      g.addColorStop(0.45, 'rgba(40, 110, 120, 0.9)');
      g.addColorStop(1, 'rgba(8, 7, 6, 0.96)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R * open, 0, Math.PI * 2);
      c.fill();
      c.restore();
      const glow = c.createRadialGradient(o, o, 0, o, o, 60);
      glow.addColorStop(0, `rgba(143, 203, 208, ${0.3 * open})`);
      glow.addColorStop(1, 'rgba(143, 203, 208, 0)');
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = glow;
      c.fillRect(0, 0, SIZE, SIZE);
      c.globalCompositeOperation = 'source-over';
    }

    // Sand settling back into the hole.
    if (t > REFILL) {
      for (let k = 0; k < 26; k += 1) {
        const p = clamp((t - REFILL - hash(k + h.seed) * 0.8) / 0.8);
        if (p <= 0 || p >= 1) continue;
        c.fillStyle = `rgba(190, 160, 120, ${0.7 * (1 - p)})`;
        c.fillRect(o + (hash(k * 1.7 + h.seed) - 0.5) * R * 2.2, o - 26 * (1 - p) + (hash(k * 2.3) - 0.5) * 6, 1.6, 1.6);
      }
    }

    // The bit: a small spiral cone that shudders as it bites, then lifts away.
    const away = ease((t - 0.95) / 0.5);
    if (away < 1) {
      const lift = 46 * (1 - bite) + 70 * away;
      const shake = Math.sin(t * 90) * 1.2 * (1 - away) * bite;
      c.save();
      c.translate(o + shake, o - lift);
      c.globalAlpha = 1 - away;
      c.fillStyle = '#26221e';
      c.strokeStyle = 'rgba(200, 228, 232, 0.9)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-7, -44);
      c.lineTo(7, -44);
      c.lineTo(7, -16);
      c.lineTo(0, 2);
      c.lineTo(-7, -16);
      c.closePath();
      c.fill();
      c.stroke();
      // The flutes turn: slanted lines sliding down the bit.
      c.beginPath();
      for (let k = 0; k < 5; k += 1) {
        const yy = -44 + ((k * 9 + t * 140) % 44);
        const w = yy > -16 ? 7 * (1 - (yy + 16) / 18) : 7;
        c.moveTo(-w, yy);
        c.lineTo(w, yy + 5);
      }
      c.stroke();
      c.restore();
    }

    // Sparks, dust and chips while the bit is cutting.
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 22; k += 1) {
      const born = hash(k * 3.3 + h.seed) * 0.8;
      const p = (t - born) / 0.55;
      if (p <= 0 || p >= 1) continue;
      const a = -Math.PI / 2 + (hash(k + h.seed * 2) - 0.5) * 2.4;
      const v = 60 + 90 * hash(k * 5.1);
      const sx = o + Math.cos(a) * v * p;
      const sy = o + Math.sin(a) * v * p + 120 * p * p;
      c.strokeStyle = k % 3 ? `rgba(215, 245, 248, ${1 - p})` : `rgba(143, 203, 208, ${1 - p})`;
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx - Math.cos(a) * 5, sy - Math.sin(a) * 5 - 3 * p);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 9; k += 1) {
      const p = (t - 0.1 - hash(k * 2.9 + h.seed) * 0.7) / 1.3;
      if (p <= 0 || p >= 1) continue;
      const a = (hash(k * 4.1 + h.seed) - 0.5) * 2.6 - Math.PI / 2;
      c.fillStyle = `rgba(150, 130, 105, ${0.16 * (1 - p)})`;
      c.beginPath();
      c.arc(o + Math.cos(a) * 34 * p, o + Math.sin(a) * 22 * p - 8 * p, 5 + 14 * p, 0, Math.PI * 2);
      c.fill();
    }
    for (let k = 0; k < 12; k += 1) {
      const p = (t - 0.15 - hash(k * 6.7 + h.seed) * 0.7) / 1.1;
      if (p <= 0 || p >= 1) continue;
      const dx = (hash(k * 8.3 + h.seed) - 0.5) * 60;
      c.fillStyle = `rgba(95, 78, 62, ${1 - p * p})`;
      c.fillRect(o + dx * p, o - 14 * Math.sin(Math.PI * Math.min(1, p * 1.6)) + 100 * p * p, 2.2, 2.2);
    }
  };

  const removeFrame = addFrameListener(() => {
    const now = performance.now();
    for (let i = holes.length - 1; i >= 0; i -= 1) {
      const h = holes[i] as Hole;
      // Scrolled away: the hole closes at once (it belongs to that place in the rock).
      if (!h.done && Math.abs(window.scrollY - h.scrollY) > 80 && now - h.start < REFILL * 1000) {
        h.start = now - REFILL * 1000;
      }
      const t = (now - h.start) / 1000;
      if (t > REFILL && !h.done) {
        h.done = true;
        h.label?.removeAttribute('data-up');
        h.label?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: 'forwards' });
      }
      if (t >= LIFE) {
        h.canvas.remove();
        h.label?.remove();
        holes.splice(i, 1);
        continue;
      }
      draw(h, t);
    }
  });

  // A press that stays where it started and lets go soon: a click on a mouse, a still tap on touch.
  let down: { x: number; y: number; at: number; target: Element | null } | null = null;
  const onDown = (e: PointerEvent) => {
    down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, at: performance.now(), target: e.target as Element | null } : null;
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || !scrollLive.rock) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.at > 400) return;
    if (scrollLive.hub && scrollLive.pointerBand >= 0) return;
    if (d.target?.closest?.(NOT_ROCK)) return;
    if (String(window.getSelection() ?? '') !== '') return;
    dig(e.clientX, e.clientY);
  };
  const onCancel = () => {
    down = null;
  };
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onCancel, { passive: true });

  return () => {
    removeFrame();
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    for (const h of holes) {
      h.canvas.remove();
      h.label?.remove();
    }
  };
}
