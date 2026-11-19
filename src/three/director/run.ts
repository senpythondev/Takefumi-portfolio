/**
 * The director's per-frame work, outside React: scroll progress → springs → shot → uniforms,
 * transforms and CSS variables (see ./Director.tsx and ./shots.ts).
 */
import { Vector3, type Group, type Mesh, type PerspectiveCamera } from 'three';
import { scrollLive } from '@/lib/scroll/store';
import type { BandMaterial } from '../materials/band';
import { WALL_HORIZON, type WallMaterial } from '../materials/wall';
import { createWallController } from '../world/controller';
import type { createWall } from '../world/wall';
import type { Dust } from './Director';
import { Spring, clamp01, easeOutCubic } from './motion';
import { postLive } from './post-live';
import { BANDS, CORE_RADIUS, FRONT_BAND, shotAt, type Frame } from './shots';

type Ref<T> = { current: T };

export function createDirectorRun({
  wall,
  wallMaterial,
  ids,
  bands,
  dust,
  camera,
  outer,
  inner,
  bandMeshes,
}: {
  wall: ReturnType<typeof createWall>;
  wallMaterial: WallMaterial;
  ids: string[];
  bands: BandMaterial[];
  dust: Dust;
  camera: PerspectiveCamera;
  outer: Ref<Group | null>;
  inner: Ref<Group | null>;
  bandMeshes: Ref<(Mesh | null)[]>;
}) {
  const controller = createWallController(wall.get('low'), ids);
  const springs = { surface: new Spring(0, 6.5), explode: new Spring(0, 6.5), join: new Spring(0, 6.5), nav: new Spring(1, 5) };
  const shaft = new Spring(0, 3.2);
  let shaftTarget = 0;
  let rockMix = 0;
  const root = document.documentElement;
  const hero = document.querySelector<HTMLElement>('[data-hero-content]');
  const headline = document.querySelector<HTMLElement>('[data-act-headline]');
  const labels = [...document.querySelectorAll<HTMLElement>('.band-labels li[data-band]')];
  const navSlot = document.querySelector<HTMLElement>('[data-core-slot]');
  let navRect = { u: 0.97, v: 0.5, h: 0.4 };
  const measureNav = () => {
    if (!navSlot) return;
    const r = navSlot.getBoundingClientRect();
    navRect = { u: (r.left + r.width / 2) / window.innerWidth, v: 1 - (r.top + r.height / 2) / window.innerHeight, h: r.height / window.innerHeight };
  };
  // The hero text scrolls in the normal flow; it fades while its bottom edge passes from 85 % to
  // 35 % of the viewport height (so a hero taller than a phone screen is read before it goes).
  let heroBottom = 0;
  const measure = () => {
    measureNav();
    if (hero) heroBottom = hero.getBoundingClientRect().bottom + window.scrollY;
  };
  measure();
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(document.body);
  window.addEventListener('resize', measure);
  const heroFade = new Spring(0, 6.5);
  // The CSS borehole (act 0) shows how far loading got: continue from there.
  const backdrop = document.querySelector<HTMLElement>('.world');
  const drill = backdrop ? Number(getComputedStyle(backdrop).getPropertyValue('--drill')) || 0 : 0;
  shaft.snap(drill * (1 - WALL_HORIZON));
  shaftTarget = 1.15;

  const css = new Map<HTMLElement | null, Record<string, string>>();
  const setVar = (el: HTMLElement | null, name: string, value: string) => {
    if (!el) return;
    let cache = css.get(el);
    if (!cache) css.set(el, (cache = {}));
    if (cache[name] === value) return;
    cache[name] = value;
    el.style.setProperty(name, value);
  };
  const setFlag = (el: HTMLElement | null, name: string, on: boolean) => {
    if (!el) return;
    if (on !== el.hasAttribute(name)) el.toggleAttribute(name, on);
  };

  // Act 2 labels: when one appears, its digits roll for a moment before they settle (Active Theory
  // note in docs/WORKLOG.md). Only ASCII letters and digits change; the real text stays in the DOM
  // (the rolling copy is aria-hidden).
  const SCRAMBLE_S = 0.5;
  const GLYPHS = '0123456789';
  const scramble = labels.map((li) => ({
    li,
    text: li.querySelector('.layer-index-depth-text')?.textContent ?? '',
    out: li.querySelector<HTMLElement>('.layer-index-scramble'),
    shown: false,
    start: -1,
  }));
  const runScramble = (elapsed: number) => {
    let active = false;
    for (const s of scramble) {
      if (s.start < 0 || !s.out) continue;
      const p = (elapsed - s.start) / SCRAMBLE_S;
      if (p >= 1) {
        s.start = -1;
        s.li.removeAttribute('data-scrambling');
        continue;
      }
      active = true;
      const settled = Math.floor(p * p * s.text.length); // slow start, then quicker: eased, not linear
      let str = '';
      for (let k = 0; k < s.text.length; k += 1) {
        const ch = s.text[k] as string;
        str += k < settled || !/[0-9A-Za-z]/.test(ch) ? ch : (GLYPHS[Math.floor(Math.random() * GLYPHS.length)] as string);
      }
      s.out.textContent = str;
    }
    return active;
  };

  const world = new Vector3();
  const up = new Vector3();
  const v3 = new Vector3();
  let elapsedShaft = 0;
  let scrambling = false;

  return {
    frame(elapsed: number, delta: number, width: number, height: number, dpr: number) {
      const wide = width / height > 1.15;
      const acts = scrollLive.acts;
      const progress = {
        surface: clamp01(springs.surface.step(acts.surface ?? 0, delta)),
        explode: clamp01(springs.explode.step(acts.explode ?? 0, delta)),
        join: clamp01(springs.join.step(acts.join ?? 0, delta)),
      };
      const frameInfo: Frame = {
        wide,
        aspect: width / height,
        shaftX: wallMaterial.uniforms.uShaftX.value,
        nav: navRect,
        pageDepth: window.scrollY / window.innerHeight,
      };
      const shot = shotAt(progress, frameInfo);

      // ── Wall ──
      controller.frame(elapsed, delta, width, height);
      const debug = (window as unknown as { __world?: { depth: number; acts?: typeof progress } }).__world;
      if (debug) {
        debug.depth = shot.wall.depth; // the director owns the wall's depth (the controller's is the plain scroll)
        debug.acts = progress;
      }
      const u = wallMaterial.uniforms;
      u.uZoom.value = shot.wall.zoom;
      u.uPan.value.set(shot.wall.panX, shot.wall.panY);
      u.uDepth.value = shot.wall.depth;
      u.uDim.value = shot.wall.dim;
      u.uGeoPulse.value = shot.wall.geoPulse;
      u.uRig.value = shot.wall.rig;
      u.uBeam.value *= shot.wall.beam;
      elapsedShaft += delta;
      const len = shaft.step(shaftTarget, delta);
      u.uShaftLen.value = len >= 1.1 && elapsedShaft > 2 ? 1000 : len;

      // ── Core ──
      const halfH = Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.position.z;
      const halfW = halfH * camera.aspect;
      const c = shot.core;
      const o = outer.current;
      const n = inner.current;
      if (o && n) {
        o.visible = c.visible;
        o.position.set((c.u - 0.5) * 2 * halfW, (c.v - 0.5) * 2 * halfH, c.z);
        o.rotation.set(c.tilt, c.yaw, 0);
        const scale = (c.lengthVh * 2 * halfH) / BANDS;
        o.scale.setScalar(scale);
        n.rotation.z = c.roll;
        const clipY = c.clipV < 0 ? -1 : c.clipV * height * dpr;
        for (let i = 0; i < BANDS; i += 1) {
          const mesh = bandMeshes.current[i];
          const m = bands[i] as BandMaterial;
          if (!mesh) continue;
          const isFront = i === FRONT_BAND;
          const f = isFront ? c.front : 0;
          mesh.position.set(0.7 * f, ((BANDS - 1) / 2 - i) * (1 + c.gap), 1.5 * f);
          mesh.rotation.set((Math.PI / 2) * f, 0.6 * f, 0);
          mesh.scale.setScalar(1 + 0.3 * f);
          const mu = m.uniforms;
          mu.uLeak.value = isFront ? c.leak * (1 - 0.75 * c.front) : c.leak; // the front face must read as rock
          mu.uRim.value = c.rim;
          mu.uDim.value = isFront ? 1 : c.dimOthers;
          mu.uOpacity.value = c.opacity;
          mu.uClipY.value = clipY;
          mu.uTime.value = elapsed;
          mu.uRockMix.value = rockMix;
          m.depthWrite = c.opacity > 0.99;
        }

        // ── Band labels: projected over their bands ──
        if (shot.labels > 0.001 && c.visible) {
          o.updateMatrixWorld();
          up.set(wide ? 0 : 1, wide ? 1 : 0, 0);
          for (const li of labels) {
            const i = Number(li.dataset.band);
            const mesh = bandMeshes.current[i];
            if (!mesh) continue;
            mesh.getWorldPosition(world);
            // Landscape: labels alternate above and below the core (room for each); portrait: right.
            const side = wide && i % 2 === 1 ? -1 : 1;
            v3.copy(world).addScaledVector(up, side * CORE_RADIUS * scale * (1 + 0.3 * (i === FRONT_BAND ? c.front : 0)) * 1.2).project(camera);
            const x = (v3.x * 0.5 + 0.5) * width;
            const y = (0.5 - v3.y * 0.5) * height;
            const stagger = clamp01(shot.labels * 1.6 - (i / BANDS) * 0.6);
            const on = stagger * (i === FRONT_BAND ? 1 : 1 - shot.labelsFront);
            setVar(li, '--x', `${x.toFixed(1)}px`);
            setVar(li, '--y', `${y.toFixed(1)}px`);
            setVar(li, '--on', on.toFixed(3));
            setFlag(li, 'data-on', on > 0.02);
            const s = scramble[labels.indexOf(li)];
            if (s && on > 0.02 && !s.shown) {
              s.shown = true;
              s.start = elapsed;
              li.setAttribute('data-scrambling', '');
            } else if (s && on <= 0.02) s.shown = false;
          }
        } else {
          for (const li of labels) setFlag(li, 'data-on', false);
          for (const s of scramble) s.shown = false;
        }
        scrambling = runScramble(elapsed);
      }

      // ── Dust, post-processing ──
      dust.material.uniforms.uTime!.value = elapsed;
      dust.material.uniforms.uAmount!.value = shot.dust;
      dust.material.uniforms.uPixelRatio!.value = dpr;
      postLive.dof = shot.dof;
      postLive.focus = camera.position.z - (outer.current?.position.z ?? 0);
      postLive.aberration = shot.aberration;

      // ── HTML of the acts ──
      const vh = window.innerHeight;
      const heroTarget = clamp01((window.scrollY + 0.85 * vh - heroBottom) / (0.5 * vh));
      const fade = clamp01(heroFade.step(heroTarget, delta));
      setVar(hero, '--hero-fade', easeOutCubic(fade).toFixed(3));
      setFlag(hero, 'data-gone', fade > 0.985);
      setVar(headline, '--reveal', shot.headline.toFixed(3));
      setFlag(headline, 'data-on', shot.headline > 0.01);
      setFlag(root, 'data-act-on', shot.actOn);
      const navTarget = shot.actOn ? shot.navOpacity : 1;
      scrollLive.navOpacity = clamp01(springs.nav.step(navTarget, delta));
      scrollLive.settling =
        springs.surface.moving(acts.surface ?? 0) ||
        springs.explode.moving(acts.explode ?? 0) ||
        springs.join.moving(acts.join ?? 0) ||
        springs.nav.moving(navTarget) ||
        heroFade.moving(heroTarget) ||
        scrambling ||
        shaft.moving(shaftTarget) ||
        (rockMix < 1 && wall.rock() !== null);

      // Rock textures fade in on the bands once the wall has them.
      if (rockMix < 1 && wall.rock()) {
        rockMix = Math.min(1, rockMix + delta / 0.8);
        const rock = wall.rock();
        if (rock) {
          for (const m of bands) {
            m.uniforms.uRock0.value = rock.textures[0] ?? null;
            m.uniforms.uRock1.value = rock.textures[2] ?? null;
          }
        }
      }
    },
    dispose() {
      controller.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      setFlag(root, 'data-act-on', false);
      scrollLive.navOpacity = 1;
      scrollLive.settling = false;
    },
  };
}
