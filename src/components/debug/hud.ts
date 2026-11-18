/**
 * ?debug=1 measurement HUD (PM_REVIEW_01 D10, PM_REVIEW_03 §8-4: kept for the pre-launch iPhone check).
 * Plain DOM, no React, loaded only when ?debug is present — normal visitors never download it.
 * "10秒間計測" records 10 s of frames and copies the result as JSON (falls back to a selectable box).
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
  try {
    new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    // Safari has no longtask entries; the count stays 0 there.
  }

  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    rolling.push(dt);
    if (rolling.length > 120) rolling.shift();
    recording?.push(dt);
    requestAnimationFrame(loop);
  };
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
      `long tasks ${longTasks}  dpr ${window.devicePixelRatio}`,
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
