/**
 * ?debug=1 measurement HUD (PM_REVIEW_01 D10, PM_REVIEW_03 §8-4: kept for the pre-launch iPhone check).
 * Plain DOM, no React, loaded only when ?debug is present — normal visitors never download it.
 * "10秒間計測" records 10 s of frames and copies the result as JSON (falls back to a selectable box).
 * Frames are also kept per act of the cinematic home (STORYBOARD M1: fps per act), so one scroll
 * through the page on a real device gives the numbers for each act.
 */
import { scrollStore } from '@/lib/scroll/store';

type StageDebug = { info: () => { geometries: number; textures: number; programs: number; calls: number }; quality: () => string };
type Win = Window & { __stage?: StageDebug; __qualityDecision?: unknown };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] as number;
}

function summarise(frames: number[]) {
  const sorted = [...frames].sort((a, b) => a - b);
  const avg = frames.reduce((s, f) => s + f, 0) / Math.max(1, frames.length);
  return {
    frames: frames.length,
    fpsAvg: avg ? Math.round((1000 / avg) * 10) / 10 : 0,
    fpsLow1: Math.round((1000 / Math.max(1, percentile(sorted, 0.99))) * 10) / 10,
    frameMsP50: Math.round(percentile(sorted, 0.5) * 10) / 10,
    frameMsP99: Math.round(percentile(sorted, 0.99) * 10) / 10,
  };
}

function device() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: nav.userAgent,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cores: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory ?? null,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/**
 * Where the page is: the act of the cinematic home (STORYBOARD v2.1 — the hero, acts 1–2, every
 * section, the finale), so fps and frame times can be read per act.
 */
type Act = string;
const ACTS: Act[] = ['hero', 'surface', 'explode', 'current', 'genten', 'pegasus', 'php-audit', 'auction', 'patent', 'deep', 'catchup', 'bedrock', 'next', 'drawer'];

function actLocator() {
  let ranges: { act: Act; from: number; to: number }[] = [];
  const measure = () => {
    const vh = window.innerHeight;
    ranges = [];
    const hero = document.querySelector<HTMLElement>('[data-hero-content]');
    if (hero) ranges.push({ act: 'hero', from: -Infinity, to: hero.getBoundingClientRect().bottom + window.scrollY - 0.5 * vh });
    for (const el of document.querySelectorAll<HTMLElement>('section[data-act]')) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const end = el.querySelector<HTMLElement>('[data-act-end]');
      const bottom = end ? end.getBoundingClientRect().bottom + window.scrollY : top + el.offsetHeight;
      ranges.push({ act: el.dataset.act as string, from: Math.max(top, ranges.at(-1)?.to ?? -Infinity), to: bottom - vh });
    }
  };
  measure();
  new ResizeObserver(measure).observe(document.body);
  return (): Act => {
    const y = window.scrollY;
    for (const r of ranges) if (y >= r.from && y < r.to) return r.act;
    return y < (ranges[0]?.to ?? 0) ? 'hero' : 'drawer';
  };
}

export function mountHud(): void {
  const w = window as Win;
  const panel = document.createElement('div');
  panel.className = 'debug-hud';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Debug HUD');
  panel.innerHTML = `<pre class="debug-hud-stats"></pre>
    <button type="button" class="debug-hud-measure">10秒間計測</button>
    <textarea class="debug-hud-out" rows="6" readonly hidden aria-label="Measurement JSON"></textarea>`;
  document.body.appendChild(panel);
  const stats = panel.querySelector('pre') as HTMLPreElement;
  const button = panel.querySelector('button') as HTMLButtonElement;
  const out = panel.querySelector('textarea') as HTMLTextAreaElement;

  // Rolling frame times (last ~2 s) for the live display.
  let last = performance.now();
  const rolling: number[] = [];
  let recording: number[] | null = null;
  let longTasks = 0;
  // INP on this device: the slowest interaction so far (input delay + processing + next paint).
  const interactions = new Map<number, number>();
  let inpWorst = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
        if (!e.interactionId) continue;
        const d = Math.max(interactions.get(e.interactionId) ?? 0, e.duration);
        interactions.set(e.interactionId, d);
        inpWorst = Math.max(inpWorst, d);
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  } catch {
    // no Event Timing (older Safari): INP stays unknown
  }
  try {
    new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    // Safari has no longtask entries; the count stays 0 there.
  }

  const whereNow = actLocator();
  const perAct = new Map<Act, number[]>(ACTS.map((a) => [a, []]));
  const bucketOf = (a: Act) => perAct.get(a) ?? [];
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    rolling.push(dt);
    if (rolling.length > 120) rolling.shift();
    recording?.push(dt);
    const bucket = bucketOf(whereNow());
    bucket.push(dt);
    if (bucket.length > 1200) bucket.shift();
    requestAnimationFrame(loop);
  };
  const actSummary = () => Object.fromEntries(ACTS.filter((a) => bucketOf(a).length > 0).map((a) => [a, summarise(bucketOf(a))]));
  requestAnimationFrame(loop);

  const snapshot = () => ({
    layer: scrollStore.get().layerId,
    quality: w.__stage?.quality() ?? scrollStore.get().quality,
    renderer: w.__stage?.info() ?? null,
    qualityDecision: w.__qualityDecision ?? null,
  });

  setInterval(() => {
    const s = summarise(rolling);
    const snap = snapshot();
    const r = snap.renderer;
    stats.textContent = [
      `fps ${s.fpsAvg} (1% low ${s.fpsLow1})`,
      `quality ${snap.quality}  layer ${snap.layer}`,
      r ? `calls ${r.calls}  geo ${r.geometries}  tex ${r.textures}  prog ${r.programs}` : 'renderer: not running (static)',
      `long tasks ${longTasks}  dpr ${window.devicePixelRatio}  INP ${interactions.size ? `${inpWorst} ms (${interactions.size} interactions)` : '— (tap or press a key)'}`,
      `per act (fps avg / 1% low): ${
        ACTS.filter((a) => bucketOf(a).length > 30)
          .map((a) => {
            const x = summarise(bucketOf(a));
            return `${a} ${x.fpsAvg}/${x.fpsLow1}`;
          })
          .join('  ') || 'scroll through the page'
      }`,
    ].join('\n');
  }, 500);

  button.addEventListener('click', () => {
    if (recording) return;
    recording = [];
    const startLong = longTasks;
    button.disabled = true;
    button.textContent = '計測中…';
    setTimeout(async () => {
      const frames = recording ?? [];
      recording = null;
      const result = {
        measuredAt: new Date().toISOString(),
        durationMs: 10_000,
        url: window.location.pathname + window.location.search,
        ...summarise(frames),
        longTasks: longTasks - startLong,
        perAct: actSummary(),
        inpWorstMs: interactions.size ? inpWorst : null,
        interactions: interactions.size,
        ...snapshot(),
        device: device(),
      };
      const json = JSON.stringify(result, null, 2);
      out.value = json;
      out.hidden = false;
      try {
        await navigator.clipboard.writeText(json);
        button.textContent = 'JSON をコピーしました';
      } catch {
        out.select();
        button.textContent = 'JSON を選択してコピーしてください';
      }
      button.disabled = false;
    }, 10_000);
  });
}
