/**
 * Optional sound (STORYBOARD v2.3 §10-H). Off by default; this module — and with it every sound —
 * is fetched only when the visitor switches the sound on.
 *
 * Nothing is downloaded as audio: the four sounds are made here with the Web Audio API (a few
 * oscillators and filtered noise), so switching on costs this small script and no audio files.
 * - the ground: a low rumble, always there, barely moving;
 * - the borehole: a faint hum while the surface and the borehole are on screen;
 * - a ripple: one small clear note when something pressed is let go;
 * - a sealing in gold: a thin bell, once, as the seams turn gold (3-4 and the finale).
 * Quiet on purpose: the master level is low and every sound fades in and out.
 */
import { scrollLive } from '@/lib/scroll/store';

export type Sound = { stop: () => void };

export function startSound(addFrameListener: (fn: (timeMs: number) => void) => () => void): Sound {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);

  // The ground: brown noise through a low-pass, breathing slowly.
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  // The loop's two ends meet: fade the last quarter second into the first.
  const lap = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < lap; i += 1) {
    const k = i / lap;
    data[data.length - lap + i] = (data[data.length - lap + i] as number) * (1 - k) + (data[i] as number) * k;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 95;
  const ground = ctx.createGain();
  ground.gain.value = 0.5;
  noise.connect(low).connect(ground).connect(master);
  noise.start();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.14;
  lfo.connect(lfoDepth).connect(ground.gain);
  lfo.start();

  // The borehole: two soft partials, heard only near the surface.
  const hum = ctx.createGain();
  hum.gain.value = 0;
  hum.connect(master);
  const humOscillators = [55, 110.4].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i ? 0.18 : 0.5;
    o.connect(g).connect(hum);
    o.start();
    return o;
  });

  /** A struck note: partials with their own decays. */
  const strike = (partials: [freq: number, level: number, decay: number][], level: number) => {
    const t = ctx.currentTime;
    for (const [freq, gainLevel, decay] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level * gainLevel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  };
  const onRipple = () => strike([[1318.5, 1, 0.9], [2637, 0.3, 0.5]], 0.07);
  window.addEventListener('gt:ripple', onRipple);

  let gold = false;
  const removeFrame = addFrameListener(() => {
    hum.gain.setTargetAtTime(scrollLive.layer === 'surface' ? 0.11 : 0, ctx.currentTime, 0.8);
    if (scrollLive.gold && !gold) strike([[2093, 1, 2.8], [3136, 0.45, 2.2], [5274, 0.16, 1.4]], 0.05);
    gold = scrollLive.gold;
  });

  return {
    stop() {
      removeFrame();
      window.removeEventListener('gt:ripple', onRipple);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      window.setTimeout(() => {
        noise.stop();
        lfo.stop();
        humOscillators.forEach((o) => o.stop());
        void ctx.close();
      }, 700);
    },
  };
}
