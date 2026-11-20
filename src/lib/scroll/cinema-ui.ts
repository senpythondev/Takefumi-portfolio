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
import { tune } from './tune';
import { KANJI_STROKES } from '@/content/kanji-strokes';
import { Spring } from '@/three/director/motion';

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
    const length = (act.len / 100) * tune.length * window.innerHeight;
    scrollLive.jumpTo = index;
    lenis.scrollTo(top, { immediate: true, force: true });
    const target = then ? topOf(then) - 0.1 * window.innerHeight : top + (act.id === 'next' ? 0.4 : 0.155) * length;
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

  // ── 3-6: 確認 opens the sample document as a full page, watermarked in this browser (the viewer
  //    is its own chunk, fetched when the name field is first used) ──
  const nameInput = document.querySelector<HTMLInputElement>('[data-control="watermark"]');
  const confirm = document.querySelector<HTMLButtonElement>('[data-watermark-confirm]');
  const viewer = document.querySelector<HTMLDialogElement>('[data-doc-viewer]');
  if (nameInput && confirm && viewer) {
    const patent = nameInput.closest<HTMLElement>('section[data-act]');
    const sync = () => {
      confirm.disabled = nameInput.value.trim() === '';
    };
    const open = () => {
      const name = nameInput.value.trim().slice(0, 40);
      if (!name) return;
      void import('@/lib/watermark/viewer').then(({ openDocViewer }) => {
        patent?.setAttribute('data-viewing', '');
        lenis.stop();
        openDocViewer(viewer, name, () => {
          patent?.removeAttribute('data-viewing');
          lenis.start();
          confirm.focus({ preventScroll: true });
        });
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.isComposing) open();
    };
    nameInput.addEventListener('input', sync);
    nameInput.addEventListener('keydown', onKey);
    confirm.addEventListener('click', open);
    sync();
    cleanups.push(() => {
      nameInput.removeEventListener('input', sync);
      nameInput.removeEventListener('keydown', onKey);
      confirm.removeEventListener('click', open);
    });
  }

  // ── §10-G: today's date on the newest bed (the visitor's own clock; nothing is sent) ──
  const today = document.querySelector<HTMLElement>('[data-today]');
  if (today) {
    const d = new Date();
    today.textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}　${today.dataset.label ?? ''}`;
  }

  // ── §10-C: the thread of evidence. A big number under the pointer (or focused) sends a thread of
  //    light into the rock (the director draws it); clicked with a pointer, the camera follows the
  //    thread for a moment and then the evidence opens as it always does. From the keyboard, and
  //    for every number that is not one of an act's big numbers, the evidence opens at once. ──
  const BIG = '.act-metric a.metric[data-metric]';
  const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 7);
  const aim = (el: Element | null) => {
    const link = el?.closest?.(BIG) as HTMLElement | null;
    if (!link) {
      scrollLive.thread = null;
      return null;
    }
    const r = link.getBoundingClientRect();
    scrollLive.thread = { x: r.left + r.width / 2, y: r.top + r.height / 2, seed: seedOf(link.dataset.metric ?? '') };
    return link;
  };
  on('pointerover', (e) => {
    if (e.pointerType === 'mouse') aim(e.target as Element);
  });
  on('focusin', (e) => {
    aim(e.target as Element);
  });
  on('focusout', () => {
    scrollLive.thread = null;
  });
  let following = false;
  on(
    'click',
    (e) => {
      if (following || e.defaultPrevented || e.detail === 0 || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = aim(e.target as Element);
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      scrollLive.threadFollow = performance.now();
      window.setTimeout(() => {
        following = true;
        link.click(); // now the evidence opens (EvidenceController), exactly as without the thread
        following = false;
        if (!link.matches(':hover')) scrollLive.thread = null;
      }, 900);
    },
    { capture: true },
  );

  // ── §10-H: sound, optional and off by default. Its code is fetched on the first switch-on. ──
  const soundToggle = document.querySelector<HTMLButtonElement>('[data-sound-toggle]');
  let sound: { stop: () => void } | null = null;
  const onSound = () => {
    if (!soundToggle) return;
    const turnOn = soundToggle.getAttribute('aria-pressed') !== 'true';
    soundToggle.setAttribute('aria-pressed', String(turnOn));
    if (turnOn) {
      void import('@/lib/sound').then(({ startSound }) => {
        if (soundToggle.getAttribute('aria-pressed') === 'true' && !sound) sound = startSound(addFrameListener);
      });
    } else {
      sound?.stop();
      sound = null;
    }
  };
  soundToggle?.addEventListener('click', onSound);
  cleanups.push(() => {
    soundToggle?.removeEventListener('click', onSound);
    sound?.stop();
  });

  // ── Keyboard: a section's overlay is fixed to the screen and follows the story (v2.4), so focusing
  //    one of its links no longer scrolls the page there by itself: fly to that section. ──
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    const section = target?.closest<HTMLElement>('.act-world:not(.act-next)');
    if (!section || !target?.closest('.act-frame') || !target.matches('a, button, input, select, textarea')) return;
    if (!target.matches(':focus-visible')) return;
    const here = scrollLive.acts[section.dataset.act ?? ''] ?? 0;
    if (here > 0 && here < 1) return;
    // Straight there (no flight, and the focus stays where the keyboard put it).
    const index = ACTS.findIndex((x) => x.id === section.dataset.act);
    const act = ACTS[index];
    if (!act) return;
    scrollLive.jumpTo = index;
    lenis.scrollTo(topOf(section) + 0.5 * (act.len / 100) * tune.length * window.innerHeight, { immediate: true, force: true });
  };
  document.addEventListener('focusin', onFocusIn);
  cleanups.push(() => document.removeEventListener('focusin', onFocusIn));

  // ── The brush of light (§10-B): the strokes of each act's mark, added here because only the cinema draws them. ──
  for (const mark of document.querySelectorAll<HTMLElement>('.act-kanji[data-kanji]')) {
    const strokes = KANJI_STROKES[mark.dataset.kanji ?? ''] ?? [];
    if (strokes.length === 0 || mark.querySelector('svg')) continue;
    mark.style.setProperty('--n', String(strokes.length));
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'kanji-strokes');
    svg.setAttribute('viewBox', '0 0 109 109');
    svg.setAttribute('focusable', 'false');
    strokes.forEach((d, i) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('pathLength', '1');
      path.style.setProperty('--i', String(i));
      svg.append(path);
    });
    mark.append(svg);
  }
  cleanups.push(() => {
    for (const svg of document.querySelectorAll('.kanji-strokes')) svg.remove();
  });

  // ── Count-up when the result appears ──
  const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
  const counting = new Map<HTMLElement, { from: number; to: number; act: string; format: (v: number) => string }>();
  const startCount = (value: HTMLElement, id: string, act: string) => {
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
    counting.set(value, { from, to, act, format });
  };
  const sections = [...document.querySelectorAll<HTMLElement>('section[data-act]')];
  let recordHook: ((section: HTMLElement) => void) | null = null;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const section = r.target as HTMLElement;
      const now = section.hasAttribute(r.attributeName ?? '');
      if (!now) {
        // The result has gone (scrolled on or back): its numbers show their real text again.
        if (r.attributeName === 'data-result') {
          for (const [el, c] of counting) {
            if (c.act !== section.dataset.act) continue;
            counting.delete(el);
            el.removeAttribute('data-ticker');
          }
        }
        continue;
      }
      if (r.attributeName === 'data-recorded') recordHook?.(section);
      if (r.attributeName === 'data-result') {
        for (const li of section.querySelectorAll<HTMLElement>('.act-metrics:not(.act-metrics-then) .act-metric')) {
          const v = li.querySelector<HTMLElement>('.metric-value');
          if (v && section.dataset.act !== 'catchup') startCount(v, li.dataset.count ?? '', section.dataset.act ?? '');
        }
      }
    }
  });
  for (const s of sections) mo.observe(s, { attributes: true, attributeFilter: ['data-result', 'data-recorded'] });
  cleanups.push(() => mo.disconnect());

  // ── §13.3 The results ledger: leaving an act, its result flies as a small light into the act's
  //    band of the navigator and stays recorded there (the band then shows it on hover and focus). ──
  const recordedActs = new Set<string>();
  const record = (section: HTMLElement) => {
    const id = section.dataset.layer ?? '';
    const band = document.querySelector<HTMLElement>(`[data-nav-band="${id}"]`);
    if (!band || recordedActs.has(id) || !band.querySelector('.core-result')) return;
    recordedActs.add(id);
    const from = (section.querySelector('.act-result [data-win] .metric-value') ?? section.querySelector('.act-result .metric-value') ?? section.querySelector('.act-result .compare'))?.getBoundingClientRect();
    const to = band.getBoundingClientRect();
    if (!from || from.width === 0 || to.width === 0) {
      band.setAttribute('data-recorded', '');
      return;
    }
    const spark = document.createElement('span');
    spark.className = 'ledger-spark';
    spark.setAttribute('aria-hidden', 'true');
    document.body.append(spark);
    const x0 = from.left + from.width / 2;
    const y0 = from.top + from.height / 2;
    const x1 = to.left + to.width / 2;
    const y1 = to.top + to.height / 2;
    // A soft arc: it lifts a little before it goes to the band.
    const flight = spark.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.2)`, opacity: 0 },
        { transform: `translate(${x0 + (x1 - x0) * 0.12}px, ${y0 - 36}px) scale(1.3)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.45)`, opacity: 1 },
      ],
      { duration: 950, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' },
    );
    const done = () => {
      spark.remove();
      band.setAttribute('data-recorded', '');
      band.querySelector('.core-ring')?.animate([{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], { duration: 900, easing: 'ease-out' });
    };
    flight.finished.then(done, done);
  };
  recordHook = record;
  cleanups.push(() => {
    for (const el of document.querySelectorAll('.ledger-spark')) el.remove();
  });

  // ── §12.3 The first hint: once, right after the hero has appeared; gone with the first scroll. ──
  const ICON_WHEEL = '<svg viewBox="0 0 16 24" width="12" height="18" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="21" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path class="nav-hint-wheel" d="M8 6v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_BANDS = '<svg viewBox="0 0 18 24" width="13" height="18" aria-hidden="true"><path d="M3 3h12M3 9h12M3 15h12M3 21h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" opacity="0.45"/><path d="M3 9h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  let hintEl: HTMLElement | null = null;
  if (main?.dataset.hintScroll && main.dataset.hintBand) {
    const hint = document.createElement('p');
    hint.className = 'nav-hint';
    hint.setAttribute('data-nav-hint', '');
    hint.setAttribute('aria-hidden', 'true');
    const item = (icon: string, text: string) => {
      const span = document.createElement('span');
      span.className = 'nav-hint-item';
      span.innerHTML = icon;
      span.append(text);
      return span;
    };
    const sep = document.createElement('span');
    sep.className = 'nav-hint-sep';
    sep.textContent = '／';
    hint.append(item(ICON_WHEEL, main.dataset.hintScroll), sep, item(ICON_BANDS, main.dataset.hintBand));
    main.before(hint);
    cleanups.push(() => hint.remove());
    hintEl = hint;
  }
  if (hintEl) {
    const hint = hintEl;
    const HINT_KEY = 'gt-hint';
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(HINT_KEY) === '1';
    } catch {
      // No storage: the hint simply shows.
    }
    if (seen || window.scrollY > 40) hint.remove();
    else {
      const onFirstScroll = () => {
        if (window.scrollY < 40) return;
        window.removeEventListener('scroll', onFirstScroll);
        hint.setAttribute('data-gone', '');
        window.setTimeout(() => hint.remove(), 600);
        try {
          window.sessionStorage.setItem(HINT_KEY, '1');
        } catch {
          // Nothing to remember it in: it shows again next time.
        }
      };
      window.addEventListener('scroll', onFirstScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onFirstScroll));
    }
  }

  // ── Ripples (§8.6): a soft ring of light from whatever was pressed. It starts when the press is
  //    let go, where the cursor's ring opens again (§11.2), so the two read as one motion. ──
  const ripples = Array.from({ length: 3 }, () => {
    const el = document.createElement('span');
    el.className = 'ripple';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  });
  let nextRipple = 0;
  const PRESSABLE = 'a, button, .gate, input[type="range"], [data-band-link]';
  const pressableAt = (target: Element | null) => !!target?.closest?.(PRESSABLE) || (scrollLive.hub && scrollLive.pointerBand >= 0);
  let pressed = false;
  let pressedOn = false;
  on(
    'pointerdown',
    (e) => {
      pressed = true;
      pressedOn = pressableAt(e.target as Element | null);
    },
    { passive: true },
  );
  on(
    'pointerup',
    (e) => {
      pressed = false;
      if (!pressedOn) return;
      pressedOn = false;
      const el = ripples[nextRipple % ripples.length] as HTMLElement;
      nextRipple += 1;
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      window.dispatchEvent(new Event('gt:ripple')); // the optional sound answers with one small note
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(
        [
          { opacity: 0.85, transform: 'scale(0.08)' },
          { opacity: 0, transform: 'scale(1)' },
        ],
        { duration: 1400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    },
    { passive: true },
  );
  on('pointercancel', () => {
    pressed = false;
    pressedOn = false;
  });
  cleanups.push(() => ripples.forEach((r) => r.remove()));

  // ── The cursor that follows (§8.7, §11.2): fine pointers only; gone on touch and keyboard.
  //    A ring a little behind the pointer; a short tail of light when it moves fast; near a band, a
  //    card or a button it is drawn toward it and takes a little of its shape; pressed, it closes,
  //    and opens again into the ripple. Soft and slow before anything else. ──
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let cursor: HTMLElement | null = null;
  let ring: HTMLElement | null = null;
  let labelEl: HTMLElement | null = null;
  const sparks: HTMLElement[] = [];
  const ptr = { x: -100, y: -100 };
  const cx = new Spring(-100, 13);
  const cy = new Spring(-100, 13);
  const size = new Spring(1, 9);
  const press = new Spring(1, 16);
  const pull = new Spring(0, 7);
  const sx = new Spring(1, 7);
  const sy = new Spring(1, 7);
  let hidden = true;
  let label = '';
  if (fine.matches) {
    cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<span class="cursor-ring"></span><span class="cursor-dot"></span><span class="cursor-label"></span>';
    document.body.appendChild(cursor);
    ring = cursor.querySelector<HTMLElement>('.cursor-ring');
    labelEl = cursor.querySelector<HTMLElement>('.cursor-label');
    for (let i = 0; i < 14; i += 1) {
      const el = document.createElement('span');
      el.className = 'cursor-spark';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      sparks.push(el);
    }
    cleanups.push(() => {
      cursor?.remove();
      sparks.forEach((el) => el.remove());
    });
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
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      if (hidden) {
        cx.snap(ptr.x);
        cy.snap(ptr.y);
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
  const onDocLeave = () => (hidden = true);
  document.documentElement.addEventListener('pointerleave', onDocLeave);
  cleanups.push(() => document.documentElement.removeEventListener('pointerleave', onDocLeave));
  const bedrock = document.querySelector<HTMLElement>('[data-act="bedrock"]');
  let pointerShown = false;

  // What the ring is drawn toward: the things that can be pressed and are on screen now. Their
  // boxes are read at most a few times a second, and only while the mouse is in use.
  const MAGNET = 'main a[href], main button:not([disabled]), .gate, .site-header a, .site-header button, .core-nav a, .core-nav button';
  type Box = { x: number; y: number; w: number; h: number };
  let boxes: Box[] = [];
  let boxesAt = -1e9;
  const readBoxes = (now: number) => {
    boxesAt = now;
    boxes = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>(MAGNET)) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      if (r.width > 0.6 * vw || r.height > 0.5 * vh) continue;
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      boxes.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
    }
  };
  let lastScrollY = -1;
  let sparkAt = 0;
  let nextSpark = 0;
  let lastX = -100;
  let lastY = -100;
  let lastFrame = 0;
  const written = new Map<string, string>();
  const put = (key: string, value: string, apply: () => void) => {
    if (written.get(key) === value) return;
    written.set(key, value);
    apply();
  };

  const removeFrame = addFrameListener((timeMs) => {
    // Count-up: 1.2 s, eased out long (§8.1), ending on the real text.
    const now = performance.now();
    // §9-3: the numbers count with the scroll (and back), not with a clock.
    for (const [el, c] of counting) {
      const t = scrollLive.revealAct === c.act ? scrollLive.reveal : 1;
      if (t >= 0.999) el.removeAttribute('data-ticker');
      else el.setAttribute('data-ticker', c.format(c.from + (c.to - c.from) * easeOutQuint(t)));
    }
    if (!cursor || !ring) return;
    const dt = Math.min(0.1, lastFrame ? (timeMs - lastFrame) / 1000 : 0.016);
    lastFrame = timeMs;

    // The nearest thing to press, and how strongly it draws the ring (within ~44 px of its edge).
    let near: Box | null = null;
    let amount = 0;
    const band = scrollLive.hub && scrollLive.pointerBand >= 0;
    if (!hidden) {
      if (now - boxesAt > 350 || window.scrollY !== lastScrollY) {
        if (now - boxesAt > 120) readBoxes(now);
        lastScrollY = window.scrollY;
      }
      let best = 44;
      for (const b of boxes) {
        const dx = Math.max(0, Math.abs(ptr.x - b.x) - b.w / 2);
        const dy = Math.max(0, Math.abs(ptr.y - b.y) - b.h / 2);
        const d = Math.hypot(dx, dy);
        if (d < best) {
          best = d;
          near = b;
        }
      }
      if (near) amount = 1 - best / 44;
      if (band && scrollLive.pointerBandAt) {
        near = { x: scrollLive.pointerBandAt[0], y: scrollLive.pointerBandAt[1], w: 60, h: 60 };
        amount = 1;
      }
    }
    const k = pull.step(near ? amount * amount * (3 - 2 * amount) : 0, dt);
    // Drawn toward it, never onto it: the ring stays nearer the pointer than the target.
    const tx = near ? ptr.x + (near.x - ptr.x) * 0.38 * k : ptr.x;
    const ty = near ? ptr.y + (near.y - ptr.y) * 0.38 * k : ptr.y;
    const x = cx.step(tx, dt);
    const y = cy.step(ty, dt);
    const overBand = band || (overLink?.matches?.('[data-band-link]') ?? false);
    const next = overBand ? enterText : overLink ? readText : '';
    const s = size.step(next ? 2.6 : 1, dt) * press.step(pressed ? 0.72 : 1, dt);
    // A little of the target's shape: wider over a wide link, taller over a tall one.
    const aspect = near && !next ? Math.min(2.2, Math.max(0.45, near.w / near.h)) : 1;
    const wx = sx.step(1 + 0.22 * k * (aspect > 1 ? Math.min(1, aspect - 1) : -Math.min(1, 1 / aspect - 1) * 0.5), dt);
    const wy = sy.step(1 + 0.22 * k * (aspect < 1 ? Math.min(1, 1 / aspect - 1) : -Math.min(1, aspect - 1) * 0.5), dt);
    if (next !== label) {
      label = next;
      if (labelEl) labelEl.textContent = label;
    }
    const lantern = window.scrollY < window.innerHeight * 0.8 || (bedrock?.hasAttribute('data-main') ?? false);
    put('hidden', String(hidden), () => cursor?.toggleAttribute('data-hidden', hidden));
    put('lantern', String(lantern), () => cursor?.toggleAttribute('data-lantern', lantern));
    put('label', String(!!label), () => cursor?.toggleAttribute('data-label', !!label));
    if (band !== pointerShown) {
      pointerShown = band;
      document.body.style.cursor = band ? 'pointer' : '';
    }
    const c = cursor;
    const r = ring;
    put('pos', `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`, () => (c.style.transform = written.get('pos') as string));
    put('ring', `scale(${(s * wx).toFixed(3)}, ${(s * wy).toFixed(3)})`, () => (r.style.transform = written.get('ring') as string));

    // The tail: a few motes of light left behind, only while the ring moves; faster, a little longer.
    const speed = Math.hypot(x - lastX, y - lastY) / Math.max(dt, 1e-3); // px per second
    lastX = x;
    lastY = y;
    if (!hidden && speed > 260 && now - sparkAt > Math.max(22, 70 - speed / 40)) {
      sparkAt = now;
      const el = sparks[nextSpark % sparks.length] as HTMLElement;
      nextSpark += 1;
      const jx = (Math.random() - 0.5) * 7;
      const jy = (Math.random() - 0.5) * 7;
      const scale = 0.6 + Math.random() * 0.8;
      el.style.left = `${(x + jx).toFixed(1)}px`;
      el.style.top = `${(y + jy).toFixed(1)}px`;
      el.animate(
        [
          { opacity: 0.75, transform: `scale(${scale.toFixed(2)})` },
          { opacity: 0, transform: `translate(${(jx * 1.5).toFixed(1)}px, ${(jy * 1.5 + 5).toFixed(1)}px) scale(0.2)` },
        ],
        { duration: 380 + Math.min(320, speed / 9), easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  });
  cleanups.push(removeFrame);

  // §11.4: a click on bare rock drills it (its own small chunk, fetched once the page is idle).
  let stopDrill: (() => void) | null = null;
  let live = true;
  const loadDrill = () => {
    void import('./drill').then(({ startDrill }) => {
      if (live) stopDrill = startDrill(addFrameListener);
    });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadDrill, { timeout: 4000 });
  else setTimeout(loadDrill, 2000);
  cleanups.push(() => {
    live = false;
    stopDrill?.();
  });

  return () => cleanups.forEach((f) => f());
}
