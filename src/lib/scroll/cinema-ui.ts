/**
 * The HTML side of the cinematic home (docs/STORYBOARD.md v2.1 §1, §3, §8.6–8.7). Loaded with the
 * effects bundle, only when the 3D runs (never for reduced motion or the static tier, where every
 * link is a plain anchor and every number is simply shown).
 *
 * - Flights: a link to an act (the index, the navigator, the header's summary) jumps to the act's
 *   first frame — the same hub framing the index is in — and glides to the end of its entry, so the
 *   camera flies into the band's cut face. Focus then moves to the act's headline.
 * - The index: hovering or focusing a band's link tells the director which band to bring forward;
 *   clicking a band in 3D (the director's raycast) follows that band's link.
 * - Count-up (§3): an act's numbers count up when its result appears. The real value stays in the
 *   DOM; the counting copy is an aria-hidden overlay (`data-ticker`), and it ends on the exact text.
 * - Ripples (§8.6) on everything pressed, and the cursor that follows (§8.7, fine pointers only).
 */
import type Lenis from 'lenis';
import { ACTS } from '@/content/acts';
import { LAYER_IDS } from '@/content/layer-ids';
import { scrollLive } from './store';
import type { FrameListener } from './effects';

/**
 * After the browser has painted its response to the current interaction (the ripple): the flight
 * (layout, Lenis, ScrollTrigger) then never delays that paint, which is what INP measures.
 */
function afterNextPaint(fn: () => void): void {
  requestAnimationFrame(() => setTimeout(fn, 0));
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

export function startCinemaUi({ lenis, addFrameListener }: { lenis: Lenis; addFrameListener: (fn: FrameListener) => () => void }) {
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    window.addEventListener(type, fn as EventListener, opts);
    cleanups.push(() => window.removeEventListener(type, fn as EventListener, opts));
  };
  const main = document.querySelector<HTMLElement>('main');

  // ── Flights ──
  const topOf = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
  const flyTo = (layer: string, then?: Element | null) => {
    if (layer === 'surface') {
      lenis.scrollTo(0, { duration: 1.6, easing: easeInOutCubic, force: true });
      return;
    }
    const index = ACTS.findIndex((a) => a.layer === layer);
    const act = ACTS[index];
    const section = act ? document.querySelector<HTMLElement>(`[data-act="${act.id}"]`) : null;
    if (!act || !section) return;
    const top = topOf(section);
    const length = (act.len / 100) * window.innerHeight;
    scrollLive.jumpTo = index;
    lenis.scrollTo(top, { immediate: true, force: true });
    const target = then ? topOf(then) - 0.1 * window.innerHeight : top + (act.id === 'next' ? 0.4 : 0.16) * length;
    lenis.scrollTo(target, {
      duration: then ? 2.2 : 1.6,
      easing: easeInOutCubic,
      force: true,
      onComplete: () => {
        const focusTarget = then instanceof HTMLElement ? then : section.querySelector<HTMLElement>('.act-headline');
        if (focusTarget && !focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
        focusTarget?.focus({ preventScroll: true });
      },
    });
    history.replaceState(null, '', then?.id ? `#${then.id}` : `#layer-${layer}`);
  };

  on(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      const hash = link?.getAttribute('href') ?? '';
      const layer = /^#layer-([a-z-]+)$/.exec(hash)?.[1];
      if (link && layer && (LAYER_IDS as readonly string[]).includes(layer)) {
        // Stopped here so Lenis's own anchor scrolling does not take the flight over.
        e.preventDefault();
        e.stopPropagation();
        afterNextPaint(() => flyTo(layer));
        // The navigator's list on phones closes as its own click handler would have done.
        const toggle = document.querySelector<HTMLButtonElement>('.core-toggle[aria-expanded="true"]');
        if (link.closest('.core-nav')) toggle?.click();
        return;
      }
      if (link && (hash === '#summary' || hash === '#finale-drawer')) {
        e.preventDefault();
        e.stopPropagation();
        afterNextPaint(() => flyTo('next', document.querySelector(hash)));
        return;
      }
      // A band chosen in 3D (the director's raycast over the split core).
      if (!link && scrollLive.hub && scrollLive.pointerBand >= 0 && !(e.target as Element | null)?.closest?.('a, button, input, label, summary')) {
        const layer = LAYER_IDS[scrollLive.pointerBand];
        if (layer === 'next' && document.querySelector('[data-act="next"][data-on]')) afterNextPaint(() => flyTo('next', document.querySelector('#finale-drawer')));
        else if (layer) afterNextPaint(() => flyTo(layer));
      }
    },
    { capture: true },
  );

  // ── The index: links tell the director which band to bring forward ──
  const bandOf = (el: Element | null): number => {
    const a = el?.closest?.('[data-band-link], .core-ring') as HTMLAnchorElement | null;
    if (!a) return -1;
    const id = a.dataset.bandLink ?? /#layer-([a-z-]+)/.exec(a.getAttribute('href') ?? '')?.[1] ?? '';
    return (LAYER_IDS as readonly string[]).indexOf(id);
  };
  on('pointerover', (e) => {
    scrollLive.linkBand = bandOf(e.target as Element);
  });
  on('focusin', (e) => {
    scrollLive.linkBand = bandOf(e.target as Element);
  });
  on('focusout', () => {
    scrollLive.linkBand = -1;
  });

  // ── Count-up when the result appears ──
  const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
  const counting = new Map<HTMLElement, { from: number; to: number; start: number; format: (v: number) => string }>();
  const startCount = (value: HTMLElement, id: string) => {
    const text = value.textContent ?? '';
    const numbers = text.match(NUMBER) ?? [];
    let format: ((v: number) => string) | null = null;
    let from = 0;
    let to = 0;
    if (id === 'pegasus-downtime') {
      // The stopwatch runs down from 20:00 and stops on the real figure (STORYBOARD act 3-3).
      to = Number(numbers[0] ?? 0);
      from = to;
      const minutes = to;
      format = (v) => `${String(Math.floor(minutes - v)).padStart(2, '0')}:${String(Math.floor(((minutes - v) % 1) * 60)).padStart(2, '0')}`;
      from = 0;
    } else if (numbers.length === 1 && Number((numbers[0] as string).replace(/,/g, '')) > 0) {
      const raw = numbers[0] as string;
      to = Number(raw.replace(/,/g, ''));
      const decimals = raw.includes('.') ? (raw.split('.')[1] ?? '').length : 0;
      const grouped = raw.includes(',');
      format = (v) => {
        const n = decimals ? v.toFixed(decimals) : String(Math.round(v));
        return text.replace(raw, grouped ? Number(n).toLocaleString('en-US') : n);
      };
    }
    if (!format) return;
    counting.set(value, { from, to, start: performance.now(), format });
  };
  const sections = [...document.querySelectorAll<HTMLElement>('section[data-act]')];
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const section = r.target as HTMLElement;
      const now = section.hasAttribute(r.attributeName ?? '');
      if (!now) continue;
      if (r.attributeName === 'data-result') {
        for (const li of section.querySelectorAll<HTMLElement>('.act-metrics:not(.act-metrics-then) .act-metric')) {
          const v = li.querySelector<HTMLElement>('.metric-value');
          if (v && section.dataset.act !== 'catchup') startCount(v, li.dataset.count ?? '');
        }
      }
    }
  });
  for (const s of sections) mo.observe(s, { attributes: true, attributeFilter: ['data-result'] });
  cleanups.push(() => mo.disconnect());

  // ── Ripples (§8.6): a soft ring of light from whatever was pressed ──
  const ripples = Array.from({ length: 3 }, () => {
    const el = document.createElement('span');
    el.className = 'ripple';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  });
  let nextRipple = 0;
  on(
    'pointerdown',
    (e) => {
      const target = e.target as Element | null;
      const pressable = target?.closest?.('a, button, .gate, input[type="range"], [data-band-link]') || (scrollLive.hub && scrollLive.pointerBand >= 0);
      if (!pressable) return;
      const el = ripples[nextRipple % ripples.length] as HTMLElement;
      nextRipple += 1;
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      el.classList.remove('ripple-on');
      void el.offsetWidth; // restart the animation
      el.classList.add('ripple-on');
    },
    { passive: true },
  );
  cleanups.push(() => ripples.forEach((r) => r.remove()));

  // ── The cursor that follows (§8.7): fine pointers only; gone on touch and keyboard ──
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let cursor: HTMLElement | null = null;
  const pos = { x: -100, y: -100, tx: -100, ty: -100, s: 1, ts: 1 };
  let hidden = true;
  let label = '';
  if (fine.matches) {
    cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<span class="cursor-ring"></span><span class="cursor-dot"></span><span class="cursor-label"></span>';
    document.body.appendChild(cursor);
    cleanups.push(() => cursor?.remove());
  }
  const enterText = main?.dataset.cursorEnter ?? '';
  const readText = main?.dataset.cursorRead ?? '';
  let overLink: Element | null = null;
  on(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') {
        hidden = true;
        return;
      }
      pos.tx = e.clientX;
      pos.ty = e.clientY;
      if (hidden) {
        pos.x = pos.tx;
        pos.y = pos.ty;
      }
      hidden = false;
      overLink = (e.target as Element | null)?.closest?.('a[href], button:not([disabled]), .gate') ?? null;
    },
    { passive: true },
  );
  on('keydown', () => {
    hidden = true;
  });
  on('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') hidden = true;
  });
  document.documentElement.addEventListener('pointerleave', () => (hidden = true));
  const bedrock = document.querySelector<HTMLElement>('[data-act="bedrock"]');
  let pointerShown = false;

  const removeFrame = addFrameListener(() => {
    // Count-up: 1.2 s, eased out long (§8.1), ending on the real text.
    const now = performance.now();
    for (const [el, c] of counting) {
      const t = Math.min(1, (now - c.start) / 1200);
      if (t >= 1) {
        counting.delete(el);
        el.removeAttribute('data-ticker');
        continue;
      }
      el.setAttribute('data-ticker', c.format(c.from + (c.to - c.from) * easeOutQuint(t)));
    }
    if (!cursor) return;
    const k = 0.2; // a little behind the pointer: the ring has weight
    pos.x += (pos.tx - pos.x) * k;
    pos.y += (pos.ty - pos.y) * k;
    const band = scrollLive.hub && scrollLive.pointerBand >= 0;
    const overBand = band || (overLink?.matches?.('[data-band-link]') ?? false);
    const next = overBand ? enterText : overLink ? readText : '';
    pos.ts = next ? 2.6 : 1;
    pos.s += (pos.ts - pos.s) * 0.18;
    if (next !== label) {
      label = next;
      (cursor.querySelector('.cursor-label') as HTMLElement).textContent = label;
    }
    const lantern = window.scrollY < window.innerHeight * 0.8 || (bedrock?.hasAttribute('data-main') ?? false);
    if (cursor.hasAttribute('data-hidden') !== hidden) cursor.toggleAttribute('data-hidden', hidden);
    if (cursor.hasAttribute('data-lantern') !== lantern) cursor.toggleAttribute('data-lantern', lantern);
    if (cursor.hasAttribute('data-label') !== !!label) cursor.toggleAttribute('data-label', !!label);
    if (band !== pointerShown) {
      pointerShown = band;
      document.body.style.cursor = band ? 'pointer' : '';
    }
    cursor.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    cursor.style.setProperty('--s', pos.s.toFixed(3));
  });
  cleanups.push(removeFrame);

  return () => cleanups.forEach((f) => f());
}
