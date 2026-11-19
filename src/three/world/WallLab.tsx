'use client';

/**
 * Development-only harness for the wall shader (/lab/wall): a plain three.js renderer, so the look
 * can be judged and the poster captured without the rest of the page.
 *   ?depth=0.6      scroll position in viewport heights
 *   ?q=high         tier (high | medium | low)
 *   ?beam=0.62,0.5  lantern position (uv); omit for no beam
 *   ?t=3            freeze time (seconds) for repeatable captures
 *   ?norock         procedural rock only (as before the textures load)
 *   ?shaft=-1       borehole length below the surface (-1: none — the act-0 poster, drilled in CSS)
 * window.__wall.webp(quality) returns the frame as a WebP data URL (scripts/build-poster.ts).
 */
import { useEffect, useRef } from 'react';
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { LAYER_IDS } from '@/content/layer-ids';
import { createWallMaterial, frameWall, type WallQuality } from '../materials/wall';
import { loadRock, type Rock } from './rock';

export function WallLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const q = new URLSearchParams(window.location.search);
    const quality = (q.get('q') ?? 'high') as WallQuality;
    const frozen = q.get('t');
    const beam = q.get('beam')?.split(',').map(Number);
    const renderer = new WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Number(q.get('dpr') ?? 1));
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = createWallMaterial(quality, LAYER_IDS);
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);
    material.uniforms.uDepth.value = Number(q.get('depth') ?? 0);
    if (q.has('dim')) material.uniforms.uDim.value = Number(q.get('dim'));
    if (q.has('shaft')) material.uniforms.uShaftLen.value = Number(q.get('shaft'));
    if (beam && beam.length === 2) {
      material.uniforms.uPointer.value.set(beam[0] as number, beam[1] as number);
      material.uniforms.uBeam.value = 1;
    }
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      frameWall(material, window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0;
    let frames = 0;
    const draw = (ms: number) => {
      material.uniforms.uTime.value = frozen !== null ? Number(frozen) : ms / 1000;
      renderer.render(scene, camera);
      frames += 1;
      document.documentElement.dataset.wall = String(frames);
      if (frozen === null) raf = requestAnimationFrame(draw);
    };
    // Same order as the site: textures first (medium/high), so captures match the live wall.
    let rock: Rock | null = null;
    void (quality === 'low' || q.has('norock') ? Promise.resolve(null) : loadRock(renderer)).then((loaded) => {
      rock = loaded;
      if (loaded) {
        material.uniforms.uRock0.value = loaded.textures[0] ?? null;
        material.uniforms.uRock1.value = loaded.textures[1] ?? null;
        material.uniforms.uRock2.value = loaded.textures[2] ?? null;
        material.uniforms.uRockMix.value = 1;
      }
      raf = requestAnimationFrame(draw);
    });
    (window as unknown as { __wall: unknown }).__wall = {
      webp: (quality_ = 0.8) => canvas.toDataURL('image/webp', quality_),
      calls: () => renderer.info.render.calls,
    };
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      rock?.dispose();
      material.dispose();
      quad.geometry.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' }} />;
}
