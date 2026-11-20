/**
 * A line of text whose characters form a little after they are typed (STORYBOARD v2.3 §11.3):
 * each one gathers from motes of light, 150–300 ms behind the keystroke, and settles like ink
 * soaking into paper; a deleted character turns back into motes and scatters. The input box itself
 * is never delayed — this only draws the watermark.
 *
 * Canvas 2D, no dependencies. Used for the 3D document's texture (the patent world) and for the
 * full-page viewer. The text never leaves this module: it is only drawn.
 */
type Glyph = { ch: string; born: number; died: number; seed: number; x: number; w: number };

const FORM = 420; // ms: motes gather, the glyph bleeds in
const FADE = 380; // ms: a deleted glyph scatters
const MOTES = 9;

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function createInkLine() {
  let glyphs: Glyph[] = [];
  let ghosts: Glyph[] = [];
  let count = 0;

  return {
    /** The text now. Kept characters stay; new ones start forming 150–300 ms from `now` (ms). */
    set(text: string, now: number): void {
      const next = Array.from(text);
      let keep = 0;
      while (keep < next.length && keep < glyphs.length && (glyphs[keep] as Glyph).ch === next[keep]) keep += 1;
      for (const g of glyphs.slice(keep)) ghosts.push({ ...g, died: now });
      glyphs = glyphs.slice(0, keep);
      for (let i = keep; i < next.length; i += 1) {
        count += 1;
        // A pasted name still arrives one character after another.
        glyphs.push({ ch: next[i] as string, born: now + 150 + 150 * hash(count) + (i - keep) * 45, died: 0, seed: count, x: 0, w: 0 });
      }
    },
    /** Nothing left to animate at `now`. */
    settled(now: number): boolean {
      return ghosts.length === 0 && glyphs.every((g) => now - g.born >= FORM);
    },
    get length() {
      return glyphs.length;
    },
    /**
     * Draw the line centred on (cx, cy) with the context's current font and fill colour, followed by
     * `tail` (the time stamp: plain text, shown once there is a name). Returns the line's width.
     */
    draw(ctx: CanvasRenderingContext2D, now: number, cx: number, cy: number, tail: string, size: number): number {
      let width = 0;
      for (const g of glyphs) {
        g.w = ctx.measureText(g.ch).width;
        width += g.w;
      }
      const tailText = glyphs.length ? `  ${tail}` : '';
      const tailWidth = tailText ? ctx.measureText(tailText).width : 0;
      let x = cx - (width + tailWidth) / 2;
      const base = ctx.globalAlpha;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const one = (g: Glyph, t: number, gone: boolean) => {
        // t: 0 = motes far apart, 1 = the settled glyph.
        const e = easeOut(Math.min(1, Math.max(0, t)));
        if (e < 1) {
          ctx.globalAlpha = base * (gone ? e : Math.sin(Math.PI * Math.min(1, t * 1.15))) * 0.9;
          for (let m = 0; m < MOTES; m += 1) {
            const a = hash(g.seed * 7.3 + m) * Math.PI * 2;
            const far = (0.9 + 1.6 * hash(g.seed * 3.1 + m * 1.7)) * size * (1 - e);
            const hx = g.x + g.w * hash(g.seed + m * 0.37);
            const hy = cy + (hash(g.seed * 1.9 + m * 0.61) - 0.5) * size * 0.8;
            const r = Math.max(0.6, size * 0.055 * (0.6 + hash(m + g.seed)));
            ctx.beginPath();
            ctx.arc(hx + Math.cos(a) * far, hy + Math.sin(a) * far, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Ink: it bleeds wide while it is wet, then draws in to the glyph's edge.
        ctx.globalAlpha = base * e * e;
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.shadowBlur = size * 0.5 * (1 - e);
        ctx.fillText(g.ch, g.x, cy);
        ctx.shadowBlur = 0;
      };
      for (const g of glyphs) {
        g.x = x;
        x += g.w;
        if (now >= g.born) one(g, (now - g.born) / FORM, false);
      }
      ghosts = ghosts.filter((g) => now - g.died < FADE && now >= g.born);
      for (const g of ghosts) one(g, 1 - (now - g.died) / FADE, true);
      if (tailText) {
        const first = glyphs[0] as Glyph;
        ctx.globalAlpha = base * easeOut(Math.min(1, Math.max(0, (now - first.born) / FORM)));
        ctx.fillText(tailText, x, cy);
      }
      ctx.globalAlpha = base;
      return width + tailWidth;
    },
  };
}

export type InkLine = ReturnType<typeof createInkLine>;

/** The watermark: the line repeated on the diagonal across a page of `w` × `h`. */
/** `scale`: size of the text against the page width (larger on the small 3D document, so it can be read). */
export function drawWatermark(ctx: CanvasRenderingContext2D, line: InkLine, now: number, w: number, h: number, stamp: string, color: string, scale = 0.042): void {
  const size = Math.round(w * scale);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px system-ui, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  const rows = Math.ceil(Math.hypot(w, h) / (size * 4.2) / 2);
  for (let row = -rows; row <= rows; row += 1) {
    const width = Math.max(size * 8, line.draw(ctx, now, 0, row * size * 4.2, stamp, size));
    // Long pages: the line again to the left and right, half a step down.
    if (width < w * 0.55) {
      line.draw(ctx, now, -(width + size * 3), row * size * 4.2 + size * 2.1, stamp, size);
      line.draw(ctx, now, width + size * 3, row * size * 4.2 + size * 2.1, stamp, size);
    }
  }
  ctx.restore();
}

/** YYYY-MM-DD HH:mm in the visitor's own time (never sent anywhere). */
export function stampOf(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
