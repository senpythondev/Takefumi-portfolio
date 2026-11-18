'use client';

/**
 * Development-only harness for the city spike (/lab/city, Phase 3-9).
 * Plain three.js renderer so the spike is measured without the rest of the stage.
 *   ?n=45000        number of buildings
 *   ?lod=220        LOD switch distance (default 0.85 × city width)
 *   ?dpr=1.5        device-pixel-ratio cap
 *   ?loop=1         repeat the dive forever (for 60 s soak measurements)
 * Exposes window.__city for automated measurement.
 */
import { useEffect, useRef, useState } from 'react';
import { Color, CustomBlending, MeshBasicMaterial, OneFactor, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget, WebGLRenderer } from 'three';
import { CityField, sampleHeights } from './CityField';

type Stats = { fps: number; low1: number; jsMs: number; calls: number; triangles: number; detailed: number; blocks: number; phase: string };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function CityLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const diveRef = useRef<() => void>(() => {});
  const [stats, setStats] = useState<Stats | null>(null);
  const [info, setInfo] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const q = new URLSearchParams(window.location.search);
    const n = Number(q.get('n') ?? 45000);
    const lodParam = q.get('lod');
    const dprCap = Number(q.get('dpr') ?? 1.5);
    const loop = q.has('loop');

    const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    const scene = new Scene();
    scene.background = new Color('#13110f');
    const camera = new PerspectiveCamera(45, 1, 0.5, 600);

    const t0 = performance.now();
    const city = new CityField({ heights: sampleHeights(n, 7) });
    // Default: buildings out to ~0.85 × the city width (the fogged far side becomes blocks).
    const lod = lodParam ? Number(lodParam) : Math.round(city.size * 0.85);
    city.setLodDistance(lod);
    scene.add(city.group);
    const buildMs = performance.now() - t0;

    const overviewPos = new Vector3(0, city.size * 0.42, city.size * 0.62);
    const overviewLook = new Vector3(0, 0, 0);
    const targetIndex = Math.floor(city.districts.length * 0.37);
    const target = city.setPulse(targetIndex, 6).clone();
    const divePos = target.clone().add(new Vector3(5, 5.5, 9));
    const look = new Vector3();

    // Dive timeline (seconds): overview hold → dive → hold on the pulsing lot → pull back.
    const T = { hold: 1.5, dive: 3.5, stay: 2.5, back: 2.5 };
    const total = T.hold + T.dive + T.stay + T.back;
    let diveStart: number | null = loop ? 0 : null;
    let manualK: number | null = null; // __city.at(k): fixed camera position along the dive
    diveRef.current = () => {
      diveStart = performance.now() / 1000;
    };

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    setInfo(`${city.count.toLocaleString('en-US')} buildings · ${city.districts.length} districts · built in ${buildMs.toFixed(0)} ms · lod ${lod} · dpr ${renderer.getPixelRatio()}`);

    const frames: number[] = [];
    const jsCost: number[] = []; // main-thread time of LOD update + draw submission (not GPU time)
    let last = performance.now();
    let raf = 0;
    let lastUi = 0;
    let latest: Stats = { fps: 0, low1: 0, jsMs: 0, calls: 0, triangles: 0, detailed: 0, blocks: 0, phase: 'overview' };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      frames.push(dt);
      if (frames.length > 600) frames.shift();
      const time = now / 1000;

      let k = 0;
      let phase = 'overview';
      if (diveStart !== null) {
        let t = time - diveStart;
        if (loop) t %= total;
        if (t < T.hold) k = 0;
        else if (t < T.hold + T.dive) {
          k = ease((t - T.hold) / T.dive);
          phase = 'dive';
        } else if (t < T.hold + T.dive + T.stay) {
          k = 1;
          phase = 'close';
        } else if (t < total) {
          k = 1 - ease((t - T.hold - T.dive - T.stay) / T.back);
          phase = 'back';
        } else diveStart = null;
      }
      if (manualK !== null) {
        k = manualK;
        phase = `at ${manualK}`;
      }
      camera.position.lerpVectors(overviewPos, divePos, k);
      look.lerpVectors(overviewLook, target, k);
      camera.lookAt(look);

      const js0 = performance.now();
      const lodState = city.update(camera, time);
      renderer.render(scene, camera);
      jsCost.push(performance.now() - js0);
      if (jsCost.length > 300) jsCost.shift();

      const sorted = [...frames].sort((a, b) => a - b);
      const avg = frames.reduce((s, f) => s + f, 0) / frames.length;
      latest = {
        fps: Math.round(10000 / avg) / 10,
        low1: Math.round(10000 / (sorted[Math.floor(sorted.length * 0.99)] ?? avg)) / 10,
        jsMs: Math.round((jsCost.reduce((s, f) => s + f, 0) / Math.max(1, jsCost.length)) * 100) / 100,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        ...lodState,
        phase,
      };
      if (now - lastUi > 400) {
        lastUi = now;
        setStats(latest);
      }
    };
    raf = requestAnimationFrame(tick);

    (window as unknown as { __city: unknown }).__city = {
      stats: () => latest,
      memory: () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0 }),
      dive: () => diveRef.current(),
      at: (k: number | null) => {
        manualK = k;
      },
      /**
       * GPU-load estimate (PM_REVIEW_06 §2-2): renders the current view once with an additive
       * "count" material (+1/255 per shaded fragment, depth test on, normal draw order) and reads
       * it back. coverage = share of pixels showing buildings; mean/p95/max = fragment-shader
       * invocations per covered pixel (≈ overdraw with early depth rejection).
       */
      overdraw: () => {
        const w = Math.max(1, Math.floor(window.innerWidth / 2));
        const h = Math.max(1, Math.floor(window.innerHeight / 2));
        const target = new WebGLRenderTarget(w, h);
        const counter = new MeshBasicMaterial({ color: new Color(1 / 255, 0, 0), blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor });
        const background = scene.background;
        scene.background = null;
        scene.overrideMaterial = counter;
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(scene, camera);
        const px = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
        renderer.setRenderTarget(null);
        scene.overrideMaterial = null;
        scene.background = background;
        counter.dispose();
        target.dispose();
        const counts: number[] = [];
        for (let i = 0; i < px.length; i += 4) if ((px[i] as number) > 0) counts.push(px[i] as number);
        counts.sort((a, b) => a - b);
        const mean = counts.reduce((s, c) => s + c, 0) / Math.max(1, counts.length);
        return {
          coverage: Math.round((counts.length / (w * h)) * 1000) / 10,
          mean: Math.round(mean * 100) / 100,
          p95: counts[Math.floor(counts.length * 0.95)] ?? 0,
          max: counts[counts.length - 1] ?? 0,
        };
      },
      resetFrames: () => {
        frames.splice(0, frames.length);
        jsCost.splice(0, jsCost.length);
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      city.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' }} />
      <div style={{ position: 'fixed', left: 8, top: 8, padding: 8, background: 'rgb(0 0 0 / 0.7)', fontSize: 12, lineHeight: 1.5 }}>
        <div>{info}</div>
        {stats ? (
          <div>
            fps {stats.fps} (1% low {stats.low1}) · js {stats.jsMs} ms · calls {stats.calls} · tris {stats.triangles.toLocaleString('en-US')} · detailed {stats.detailed} / blocks {stats.blocks} · {stats.phase}
          </div>
        ) : null}
        <button type="button" onClick={() => diveRef.current()} style={{ marginTop: 6, font: 'inherit' }}>
          dive
        </button>
      </div>
    </>
  );
}
