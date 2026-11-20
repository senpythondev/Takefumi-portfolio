/**
 * ?debug=scroll — the owner's tuning panel for the feel of the home (docs/STORYBOARD.md v2.3 §9-4).
 * Sliders for the acts' length, the distance of one wheel step, the short smoothing behind the
 * scroll, and the stardust (amount, brightness, pull) — STORYBOARD v2.5 §9-6. Values are kept in this browser's localStorage and are applied only
 * while `debug=scroll` is in the URL; the owner reports them and they become the defaults
 * (src/lib/scroll/tune.ts). Plain DOM, loaded only with the parameter.
 */
import { applyLength, loadTune, tune, TUNE_DEFAULTS, TUNE_KEY, TUNE_RANGES, type Tune } from '@/lib/scroll/tune';

const LABELS: Record<keyof Tune, [label: string, unit: string, hint: string]> = {
  length: ['全体の長さ', '倍', '各幕のスクロール量（元の長さに対する倍率）'],
  wheel: ['1回のホイールで進む距離', '倍', 'ブラウザの標準に対する倍率。小さいほど少しずつ進む（慣性なし）'],
  glide: ['ホイールのやわらかさ', '', '小さいほど、ページがゆっくり追いつく（1＝遅れなし）'],
  smooth: ['追従のなめらかさ', '秒', '絵がスクロールに追いつくまでの時間（0＝なし）'],
  stars: ['星屑の量', '倍', '粒の数（1＝既定）'],
  starLight: ['星屑の明るさ', '倍', '粒の明るさ（1＝既定）'],
  starPull: ['星屑の引き寄せ', '', 'マウスへ寄る距離（画面幅に対する割合）'],
};

export function mountScrollPanel(): void {
  if (document.querySelector('.scroll-panel')) return;
  // The panel can mount before the scroll effects start: read the saved values here too.
  loadTune();
  const panel = document.createElement('form');
  panel.className = 'scroll-panel';
  panel.setAttribute('aria-label', 'スクロールの調整');
  panel.addEventListener('submit', (e) => e.preventDefault());
  const style = document.createElement('style');
  style.textContent = `
    .scroll-panel{position:fixed;left:12px;bottom:12px;z-index:90;width:min(20rem,calc(100vw - 24px));padding:10px 12px;border:1px solid #6b6259;border-radius:6px;background:rgb(19 17 15 / .92);color:#ece6dd;font:12px/1.5 ui-monospace,monospace;pointer-events:auto}
    .scroll-panel[data-closed] .scroll-panel-body{display:none}
    .scroll-panel header{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .scroll-panel label{display:block;margin-top:8px}
    .scroll-panel label span{display:flex;justify-content:space-between}
    .scroll-panel small{display:block;color:#b8ada0}
    .scroll-panel input[type=range]{width:100%;min-height:24px}
    .scroll-panel button{min-height:28px;padding:2px 10px;border:1px solid #6b6259;border-radius:4px;background:#26221e;color:inherit;font:inherit;cursor:pointer}
    .scroll-panel output{display:block;margin-top:8px;padding:6px;border:1px dashed #6b6259;user-select:all;word-break:break-all}
    .scroll-panel-actions{display:flex;gap:8px;margin-top:8px}`;
  panel.appendChild(style);

  const header = document.createElement('header');
  header.innerHTML = '<strong>スクロールの調整</strong>';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '閉じる';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.addEventListener('click', () => {
    const closed = panel.toggleAttribute('data-closed');
    toggle.textContent = closed ? '開く' : '閉じる';
    toggle.setAttribute('aria-expanded', String(!closed));
  });
  header.appendChild(toggle);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'scroll-panel-body';
  panel.appendChild(body);
  const out = document.createElement('output');
  const inputs = new Map<keyof Tune, { input: HTMLInputElement; value: HTMLElement }>();
  const show = () => {
    for (const [key, { input, value }] of inputs) {
      input.value = String(tune[key]);
      value.textContent = `${tune[key]}${LABELS[key][1]}`;
    }
    out.textContent = JSON.stringify(tune);
  };
  const save = () => {
    try {
      window.localStorage.setItem(TUNE_KEY, JSON.stringify(tune));
    } catch {
      // No storage: the values still apply until the page is closed.
    }
  };
  for (const key of Object.keys(TUNE_DEFAULTS) as (keyof Tune)[]) {
    const [min, max, step] = TUNE_RANGES[key];
    const [text, , hint] = LABELS[key];
    const label = document.createElement('label');
    const head = document.createElement('span');
    const name = document.createElement('b');
    name.textContent = text;
    const value = document.createElement('i');
    head.append(name, value);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.tune = key;
    const small = document.createElement('small');
    small.textContent = hint;
    input.addEventListener('input', () => {
      tune[key] = Number(input.value);
      if (key === 'length') applyLength();
      show();
      save();
    });
    label.append(head, input, small);
    body.appendChild(label);
    inputs.set(key, { input, value });
  }
  body.appendChild(out);
  const actions = document.createElement('div');
  actions.className = 'scroll-panel-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '値をコピー';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(JSON.stringify(tune)).then(
      () => (copy.textContent = 'コピーしました'),
      () => (copy.textContent = '上の値を選択してコピー'),
    );
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = '既定に戻す';
  reset.addEventListener('click', () => {
    Object.assign(tune, TUNE_DEFAULTS);
    applyLength();
    show();
    save();
  });
  actions.append(copy, reset);
  body.appendChild(actions);
  document.body.appendChild(panel);
  show();
  // On a phone the panel would cover the scene: it starts closed there.
  if (window.innerWidth < 700) toggle.click();
}
