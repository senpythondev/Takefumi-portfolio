/**
 * The director's per-frame work, outside React (docs/STORYBOARD.md v2.1):
 *
 *   scroll progress of every act → one story position G = act index + progress, followed by a
 *   critically damped spring (weight; no linear motion) → the act and its progress → core, camera,
 *   the entry/return particles, the world of the act, the band labels and holograms, and a few
 *   attributes on the act's own section (never on <html> for per-frame state).
 *
 * The core is framed for a fixed camera (HUB_Z, HUB_FOV) in acts 1–2 and at the hub; the camera
 * itself moves only to close on a cut face and inside the worlds (each world's `pose`).
 */
import { Color, Matrix4, Raycaster, Vector2, Vector3, type Group, type Mesh, type PerspectiveCamera, type Scene } from 'three';
import { ACTS, beatsOf, cuesOf } from '@/content/acts';
import { scrollLive } from '@/lib/scroll/store';
import { omegaFor, tune } from '@/lib/scroll/tune';
import { base, layer as layerColor, type LayerColorId } from '@/styles/tokens';
import type { BandMaterial } from '../materials/band';
import { WALL_HORIZON, type WallMaterial } from '../materials/wall';
import { createWallController } from '../world/controller';
import type { createWall } from '../world/wall';
import { ATTRACT, blendPose, fluct, setPose, type Pose, type WorldInput } from '../worlds/kit';
import type { Holograms } from '../holo';
import type { Dust, Sparks } from './Director';
import type { Dissolve } from './dissolve';
import { Spring, clamp01, easeOutCubic, mix, seg } from './motion';
import { Playhead } from './playhead';
import { postLive } from './post-live';
import { BANDS, CORE_RADIUS, HUB_FOV, HUB_GAP, HUB_Z, shotAt, type Frame } from './shots';
import type { createWorldHost, WorldId } from './worlds';

type Ref<T> = { current: T };

const LAST = ACTS.length - 1;
const lin = (x: number) => x;
const DECODE_GLYPHS = '▖▘▝▗▚▞░▒/\\|+*#<>=_01';

export function createDirectorRun({
  wall,
  wallMaterial,
  wallMesh,
  ids,
  bands,
  dust,
  sparks,
  camera,
  outer,
  inner,
  bandMeshes,
  dissolve,
  worlds,
  scene,
}: {
  wall: ReturnType<typeof createWall>;
  wallMaterial: WallMaterial;
  wallMesh: Ref<Mesh | null>;
  ids: string[];
  bands: BandMaterial[];
  dust: Dust;
  sparks: Sparks;
  camera: PerspectiveCamera;
  outer: Ref<Group | null>;
  inner: Ref<Group | null>;
  bandMeshes: Ref<(Mesh | null)[]>;
  dissolve: Dissolve;
  worlds: ReturnType<typeof createWorldHost>;
  scene: Scene;
}) {
  const controller = createWallController(wall.get('low'));
  // The story position: follows the scroll softly, plays the key moments at a fixed tempo (§9).
  const story = new Playhead(
    ACTS.flatMap((act, index) =>
      cuesOf(act).map((c) => ({ g0: index + c.from, g1: index + c.to, dur: c.dur })),
    ),
  );
  const nav = new Spring(1, 5);
  const hover = Array.from({ length: BANDS }, () => new Spring(0, 9));
  // The band turned to the camera, smoothed: after a flight the new band turns forward instead of snapping.
  const frontS = Array.from({ length: BANDS }, () => new Spring(0, 8));
  const shaft = new Spring(0, 3.2);
  let shaftTarget = 0;
  let rockMix = 0;
  camera.far = 400;
  camera.updateProjectionMatrix();
  // The page's ground behind every world: additive light then never makes a hole in the canvas
  // (a dark additive pixel would otherwise be written as opaque black over the page).
  scene.background = new Color(base.ground);

  const root = document.documentElement;
  const hero = document.querySelector<HTMLElement>('[data-hero-content]');
  const sections = new Map(ACTS.map((a) => [a.id, document.querySelector<HTMLElement>(`[data-act="${a.id}"]`)]));
  const labels = [...document.querySelectorAll<HTMLElement>('.band-labels li[data-band]')];
  const drawer = document.querySelector<HTMLElement>('[data-act-drawer]');

  // The hero text scrolls in the normal flow; it fades while its bottom edge passes from 85 % to
  // 35 % of the viewport height (so a hero taller than a phone screen is read before it goes).
  let heroBottom = 0;
  const measure = () => {
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

  // ── DOM writes, cached: only changes reach the DOM ──
  const cache = new Map<HTMLElement, Map<string, string | null>>();
  const write = (el: HTMLElement | null | undefined, key: string, value: string | null, apply: (el: HTMLElement) => void) => {
    if (!el) return;
    let c = cache.get(el);
    if (!c) cache.set(el, (c = new Map()));
    if (c.get(key) === value) return;
    c.set(key, value);
    apply(el);
  };
  const setVar = (el: HTMLElement | null | undefined, name: string, value: string) => write(el, name, value, (e) => e.style.setProperty(name, value));
  const setFlag = (el: HTMLElement | null | undefined, name: string, on: boolean) => write(el, name, on ? '' : null, (e) => e.toggleAttribute(name, on));
  const setAttr = (el: HTMLElement | null | undefined, name: string, value: string | null) =>
    write(el, name, value, (e) => (value === null ? e.removeAttribute(name) : e.setAttribute(name, value)));

  // ── Labels decode from symbols as they appear (Active Theory): an aria-hidden overlay in CSS
  //    (`data-scramble`), the real text stays in the DOM. ──
  const decoding = new Map<HTMLElement, { text: string; start: number }>();
  const decode = (el: HTMLElement | null, now: number) => {
    if (!el || decoding.has(el)) return;
    decoding.set(el, { text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(), start: now });
  };
  const runDecode = (now: number) => {
    for (const [el, d] of decoding) {
      const t = (now - d.start) / 0.55;
      if (t >= 1) {
        decoding.delete(el);
        el.removeAttribute('data-decoding');
        el.removeAttribute('data-scramble');
        continue;
      }
      const settled = Math.floor(easeOutCubic(t) * d.text.length);
      let s = '';
      for (let i = 0; i < d.text.length; i += 1) {
        const ch = d.text[i] as string;
        s += i < settled || ch === ' ' ? ch : (DECODE_GLYPHS[Math.floor(Math.random() * DECODE_GLYPHS.length)] as string);
      }
      el.setAttribute('data-decoding', '');
      el.setAttribute('data-scramble', s);
    }
    return decoding.size > 0;
  };

  // ── Pointer (the worlds' lights, the index) ──
  const pointer = { x: 0, y: 0, on: false, moved: false, last: -1e9, mouse: false };
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    pointer.moved = true;
    pointer.mouse = e.pointerType === 'mouse';
    if (e.pointerType === 'mouse' || e.buttons > 0 || e.type === 'pointerdown') {
      pointer.on = true;
      pointer.last = performance.now();
    }
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  // §11.1: motes and stars drift toward the pointer through slow springs (a quicker and a slower
  // follower; each mote mixes the two), and back once it has left. A finger's drag makes them flow.
  const onLeave = () => {
    pointer.mouse = false;
  };
  root.addEventListener('pointerleave', onLeave);
  const attract = { fx: new Spring(0, 3.0), fy: new Spring(0, 3.0), sx: new Spring(0, 1.3), sy: new Spring(0, 1.3), k: new Spring(0, 1.5), dx: new Spring(0, 2.4), dy: new Spring(0, 2.4) };
  const drag = { x: 0, y: 0, lastX: 0, lastY: 0, on: false };
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    drag.lastX = t.clientX;
    drag.lastY = t.clientY;
    drag.on = true;
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || !drag.on) return;
    drag.x = Math.max(-0.3, Math.min(0.3, drag.x + ((t.clientX - drag.lastX) / window.innerWidth) * 0.9));
    drag.y = Math.max(-0.3, Math.min(0.3, drag.y - ((t.clientY - drag.lastY) / window.innerHeight) * 0.9));
    drag.lastX = t.clientX;
    drag.lastY = t.clientY;
  };
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });

  // ── Controls in the acts' HTML ──
  const controls = new Map<string, HTMLInputElement | null>();
  const control = (section: HTMLElement | null) => (name: string) => {
    const key = `${section?.dataset.act}:${name}`;
    if (!controls.has(key)) controls.set(key, section?.querySelector<HTMLInputElement>(`[data-control="${name}"]`) ?? null);
    const el = controls.get(key);
    if (!el) return null;
    if (el.type === 'range') return (Number(el.value) - Number(el.min || 0)) / ((Number(el.max || 100) - Number(el.min || 0)) || 1);
    return el.value;
  };

  // ── Holograms: their own small chunk, fetched as act 2 approaches ──
  let holo: Holograms | null = null;
  let holoLoading = false;
  const loadHolo = () => {
    if (holoLoading) return;
    holoLoading = true;
    void import('../holo').then(({ createHolograms }) => {
      holo = createHolograms();
      scene.add(holo.group);
    });
  };

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const world = new Vector3();
  const up = new Vector3();
  const v3 = new Vector3();
  const faceA = new Vector3();
  const faceN = new Vector3();
  const camPos = new Vector3(0, 0, HUB_Z);
  const hubPose: Pose = { pos: [0, 0, HUB_Z], look: [0, 0, 0], fov: HUB_FOV };
  const facePose: Pose = { pos: [0, 0, HUB_Z], look: [0, 0, 0], fov: HUB_FOV };
  const worldPose: Pose = { pos: [0, 0, HUB_Z], look: [0, 0, 0], fov: HUB_FOV };
  const tmpPose: Pose = { pos: [0, 0, HUB_Z], look: [0, 0, 0], fov: HUB_FOV };
  const pose: Pose = { pos: [0, 0, HUB_Z], look: [0, 0, 0], fov: HUB_FOV };
  const coreMatrix = new Matrix4();
  const front = new Float32Array(BANDS);
  const shapes = new Map<string, Float32Array>();
  let elapsedShaft = 0;
  let current: string | null = null;
  let lastHover = -1;
  const shown = new Set<HTMLElement>();
  const worldMarks = new Map<HTMLElement, Set<string>>();
  const mark = (section: HTMLElement | null, name: string) => {
    if (!section) return;
    let set = worldMarks.get(section);
    if (!set) worldMarks.set(section, (set = new Set()));
    set.add(name);
  };
  const worldActs = ACTS.filter((a) => a.layer && a.layer !== 'surface').map((a) => a.id as WorldId);

  const debugOn = new URLSearchParams(window.location.search).has('debug');

  return {
    frame(elapsed: number, delta: number, width: number, height: number, dpr: number) {
      const wide = width / height > 1.15;
      const aspect = width / height;
      const acts = scrollLive.acts;

      // ── 1. Where we are in the story ──
      let raw = 0;
      for (let j = 0; j < ACTS.length; j += 1) {
        const pj = acts[(ACTS[j] as (typeof ACTS)[number]).id] ?? 0;
        if (pj > 0) raw = j + Math.min(1, pj);
      }
      if (scrollLive.jumpTo >= 0) {
        // A flight from the index: snap to the target act's first frame (the same hub framing).
        story.snap(scrollLive.jumpTo);
        scrollLive.jumpTo = -1;
      }
      const follow = omegaFor(tune.smooth);
      const G = Math.max(0, story.step(raw, delta, follow, tune.tempo));
      const i = Math.min(LAST, Math.floor(G));
      const p = i === LAST ? clamp01(G - i) : G - i;
      const act = ACTS[i] as (typeof ACTS)[number];
      const a = i > 0 ? 1 : p;
      const b = i > 1 ? 1 : i === 1 ? p : 0;
      const frameInfo: Frame = { wide, aspect, shaftX: wallMaterial.uniforms.uShaftX.value };
      const shot = shotAt({ surface: a, explode: b }, frameInfo);

      const isFinale = act.id === 'next';
      const isWorld = i >= 2 && !isFinale;
      const k = act.layer ? ids.indexOf(act.layer) : -1;
      const beats = beatsOf(act);
      const e = isWorld ? clamp01(p / 0.15) : 0;
      const r = isWorld ? clamp01((p - 0.85) / 0.15) : 0;
      const phase: 'core' | 'entry' | 'story' | 'return' = !isWorld ? 'core' : p < 0.15 ? 'entry' : p > 0.85 ? 'return' : 'story';
      const w = isWorld || isFinale ? worlds.get(act.id) : null;
      const inWorld = !!w && isWorld && ((phase === 'entry' && e >= 0.55) || phase === 'story' || (phase === 'return' && r < 0.45));

      // ── 2. Worlds: mounted around the current act, fetched two ahead ──
      const wi = worldActs.indexOf(act.id as WorldId);
      const keep: WorldId[] = [];
      if (wi >= 0) {
        for (const d of [-1, 0, 1]) {
          const id = worldActs[wi + d];
          if (id) keep.push(id);
        }
        for (const d of [2, 3]) {
          const id = worldActs[wi + d];
          if (id) worlds.prefetch(id);
        }
      } else if (G > 1.3) {
        keep.push(worldActs[0] as WorldId);
        if (worldActs[1]) worlds.prefetch(worldActs[1]);
      }
      if (G > 0.6) loadHolo();

      // ── Motes and stars toward the pointer (§11.1) ──
      const there = pointer.mouse ? 1 : 0;
      const decay = Math.exp(-delta * 1.1);
      drag.x *= decay;
      drag.y *= decay;
      if (Math.abs(drag.x) < 1e-4) drag.x = 0;
      if (Math.abs(drag.y) < 1e-4) drag.y = 0;
      ATTRACT.uAttract.value.set(attract.fx.step(pointer.x, delta), attract.fy.step(pointer.y, delta), attract.sx.step(pointer.x, delta), attract.sy.step(pointer.y, delta));
      ATTRACT.uAttractK.value = attract.k.step(there, delta);
      ATTRACT.uDrag.value.set(attract.dx.step(drag.x, delta), attract.dy.step(drag.y, delta));
      const attracting =
        attract.k.moving(there) || attract.sx.moving(pointer.x) || attract.sy.moving(pointer.y) || attract.fx.moving(pointer.x) || attract.fy.moving(pointer.y) || attract.dx.moving(drag.x) || attract.dy.moving(drag.y);

      // ── 3. Wall (acts 0–1) ──
      const lantern = i === 0 ? clamp01(1 - (window.scrollY / window.innerHeight - 0.35) / 0.9) : 0;
      controller.frame(elapsed, delta, width, height, lantern);
      const u = wallMaterial.uniforms;
      u.uZoom.value = shot.wall.zoom;
      u.uPan.value.set(shot.wall.panX, shot.wall.panY);
      u.uDepth.value = 0;
      const wallDim = i <= 1 ? shot.wall.dim : 0;
      u.uDim.value = wallDim;
      u.uGeoPulse.value = shot.wall.geoPulse;
      u.uRig.value = shot.wall.rig;
      u.uBeam.value *= shot.wall.beam;
      u.uStar.value.set(attract.sx.x * 0.5 + 0.5, attract.sy.x * 0.5 + 0.5, attract.k.x);
      u.uStarDrag.value.set(attract.dx.x * 0.06, -attract.dy.x * 0.06);
      if (wallMesh.current) wallMesh.current.visible = wallDim > 0.002;
      elapsedShaft += delta;
      const len = shaft.step(shaftTarget, delta);
      u.uShaftLen.value = len >= 1.1 && elapsedShaft > 2 ? 1000 : len;

      // ── 4. The core ──
      // From act 2 on, the core sits in the hub framing (the end of act 2).
      const c = i >= 2 ? shotAt({ surface: 1, explode: 1 }, frameInfo).core : shot.core;
      front.fill(0);
      if (i === 1) front[1] = shot.front;
      if (isWorld && k >= 0) {
        front[k] = 1 - seg(r, 0.6, 1.0);
        if (k + 1 < BANDS) front[k + 1] = seg(r, 0.6, 1.0);
      }
      if (isFinale) front[BANDS - 1] = 1 - seg(p, 0.0, 0.15);
      for (let j = 0; j < BANDS; j += 1) front[j] = (frontS[j] as Spring).step(front[j] as number, delta);
      const maxFront = Math.max(...front);
      const finaleGap = isFinale ? 1 - seg(p, 0.1, 0.4) : 1;
      const gap = (i >= 2 ? HUB_GAP : c.gap) * finaleGap;

      // The index: which band is pointed at, hovered or focused.
      const hub = (i === 1 && shot.hub > 0.5) || (isFinale && p > 0.45);
      scrollLive.hub = hub;
      let hoverBand = hub ? (scrollLive.pointerBand >= 0 ? scrollLive.pointerBand : scrollLive.linkBand) : -1;
      if (hub && hoverBand < 0 && coarse && i === 1) hoverBand = Math.min(BANDS - 1, Math.floor(seg(b, 0.55, 0.85, lin) * BANDS));
      if (isFinale && hoverBand !== BANDS - 1) hoverBand = -1;
      if (hoverBand !== lastHover) {
        if (lastHover >= 0) setFlag(labels[lastHover], 'data-hover', false);
        if (hoverBand >= 0) {
          const li = labels[hoverBand];
          setFlag(li, 'data-hover', true);
          decode(li?.querySelector<HTMLElement>('.band-label-head') ?? null, elapsed);
          const layer = ids[hoverBand];
          if (layer) worlds.prefetch(layer);
        }
        lastHover = hoverBand;
      }

      const drawerP = clamp01(acts.drawer ?? 0);
      const o = outer.current;
      const n = inner.current;
      const coreVisible = (i <= 1 && c.visible) || (isWorld && !inWorld) || isFinale;
      let scale = 1;
      if (o && n) {
        const halfH = Math.tan(((HUB_FOV / 2) * Math.PI) / 180) * HUB_Z;
        const halfW = halfH * aspect;
        o.visible = coreVisible;
        o.position.set((c.u - 0.5) * 2 * halfW, (c.v - 0.5) * 2 * halfH, c.z);
        o.rotation.set(c.tilt, c.yaw, 0);
        const lengthVh = i >= 2 ? c.lengthVh * (isFinale ? mix(1, (BANDS + (BANDS - 1) * HUB_GAP) / BANDS / 1.04, seg(p, 0.1, 0.4)) : 1) : c.lengthVh;
        scale = (lengthVh * 2 * halfH) / BANDS;
        o.scale.setScalar(scale);
        n.rotation.z = c.roll;
        const clipY = i === 0 && c.clipV >= 0 ? c.clipV * height * dpr : -1;
        for (let j = 0; j < BANDS; j += 1) {
          const mesh = bandMeshes.current[j];
          const m = bands[j] as BandMaterial;
          if (!mesh) continue;
          const f = front[j] as number;
          const h = (hover[j] as Spring).step(j === hoverBand ? 1 : 0, delta);
          const out = isFinale && j === BANDS - 1 ? easeOutCubic(drawerP) * 0.9 : 0;
          mesh.position.set(0.7 * f, ((BANDS - 1) / 2 - j) * (1 + gap) - out, 1.5 * f + 0.45 * h);
          mesh.rotation.set((Math.PI / 2) * f, 0.6 * f, 0);
          mesh.scale.setScalar(1 + 0.3 * f + 0.05 * h);
          const mu = m.uniforms;
          mu.uLeak.value = c.leak * finaleGap * (1 - 0.75 * f);
          mu.uRim.value = c.rim;
          mu.uDim.value = f > 0.01 ? 1 : mix(1, 0.32, maxFront);
          mu.uOpacity.value = 1;
          mu.uClipY.value = clipY;
          mu.uTime.value = elapsed;
          mu.uRockMix.value = rockMix;
          // The empty band of the finale breathes (§8.5); a hovered band glows in its colour.
          const empty = isFinale && j === BANDS - 1 ? (0.25 + 0.35 * fluct(elapsed * 1.4, 0.3)) * seg(p, 0.3, 0.6) + 0.6 * drawerP : 0;
          mu.uGlow.value = Math.max(h * 0.85, empty);
          m.depthWrite = true;
        }
        o.updateMatrixWorld(true);
        coreMatrix.copy(n.matrixWorld);

        // Act 1: sparks at the rim of the borehole while the core comes up; a cyan light traces it.
        const su = sparks.material.uniforms;
        su.uAmount!.value = i === 0 ? c.sparks : 0;
        sparks.points.visible = i === 0 && c.sparks > 0.01;
        (su.uOrigin!.value as Vector3).set((c.u - 0.5) * 2 * halfW, (c.clipV - 0.5) * 2 * halfH, 0);
        su.uScale!.value = CORE_RADIUS * scale * 2.2;
        su.uTime!.value = elapsed;
        su.uPx!.value = dpr;
        if (i <= 1 && c.trace > 0) for (const m of bands) m.uniforms.uRim.value = c.rim + 0.9 * c.trace * (0.5 + 0.5 * Math.sin(elapsed * 1.7 - m.uniforms.uIndex.value * 0.6));

        // ── Band labels (act 2): projected over their bands ──
        const labelsOn = i === 1 ? shot.labels : 0;
        if (labelsOn > 0.001 && o.visible) {
          up.set(wide ? 0 : 1, wide ? 1 : 0, 0);
          for (const li of labels) {
            const j = Number(li.dataset.band);
            const mesh = bandMeshes.current[j];
            if (!mesh) continue;
            mesh.getWorldPosition(world);
            // Landscape: labels alternate above and below the core (room for each); portrait: right.
            const side = wide && j % 2 === 1 ? -1 : 1;
            v3.copy(world)
              .addScaledVector(up, side * CORE_RADIUS * scale * 1.2)
              .project(camera);
            const x = (v3.x * 0.5 + 0.5) * width;
            const y = (0.5 - v3.y * 0.5) * height;
            const stagger = clamp01(labelsOn * 1.6 - (j / BANDS) * 0.6);
            const on = stagger * (j === 1 ? 1 : 1 - shot.front);
            setVar(li, '--x', `${x.toFixed(1)}px`);
            setVar(li, '--y', `${y.toFixed(1)}px`);
            setVar(li, '--on', on.toFixed(3));
            setFlag(li, 'data-on', on > 0.02);
            if (on > 0.02 && !shown.has(li)) {
              shown.add(li);
              decode(li.querySelector<HTMLElement>('.band-label-head'), elapsed);
            } else if (on <= 0.02) shown.delete(li);
          }
        } else {
          for (const li of labels) {
            setFlag(li, 'data-on', false);
            setVar(li, '--on', '0');
            shown.delete(li);
          }
        }

        // ── The camera's way into a cut face: the front band's face, filling the screen ──
        if (k >= 0 && (isWorld || isFinale)) {
          const mesh = bandMeshes.current[k];
          if (mesh) {
            // The cap that looks toward the hub camera.
            faceA.set(0, 0.5, 0).applyMatrix4(mesh.matrixWorld);
            faceN.set(0, 1, 0).transformDirection(mesh.matrixWorld);
            if (faceN.dot(v3.copy(camPos).sub(faceA)) < 0) {
              faceA.set(0, -0.5, 0).applyMatrix4(mesh.matrixWorld);
              faceN.multiplyScalar(-1);
            }
            const radius = CORE_RADIUS * scale * mesh.scale.x;
            const d = (radius / (Math.tan(((HUB_FOV / 2) * Math.PI) / 180) * Math.sqrt(1 + aspect * aspect))) * 0.92;
            setPose(facePose, [faceA.x + faceN.x * d, faceA.y + faceN.y * d, faceA.z + faceN.z * d], [faceA.x, faceA.y, faceA.z], HUB_FOV);
          }
        }
      }

      // ── 5. Camera ──
      let worldFade = 0;
      setPose(pose, hubPose.pos, hubPose.look, HUB_FOV);
      if (isWorld) {
        if (w) {
          if (phase === 'entry') {
            if (inWorld) {
              w.pose(0.15, wide, worldPose);
              setPose(pose, worldPose.pos, worldPose.look, mix(HUB_FOV, worldPose.fov, seg(e, 0.4, 1.0)));
            } else blendPose(pose, hubPose, facePose, seg(e, 0.0, 0.45));
            worldFade = seg(e, 0.7, 1.0);
          } else if (phase === 'story') {
            w.pose(p, wide, pose);
            worldFade = 1;
          } else {
            if (inWorld) {
              w.pose(0.85, wide, worldPose);
              setPose(pose, worldPose.pos, worldPose.look, mix(worldPose.fov, HUB_FOV, seg(r, 0.0, 0.6)));
            } else blendPose(pose, facePose, hubPose, seg(r, 0.55, 0.85));
            worldFade = 1 - seg(r, 0.0, 0.32);
          }
        }
      } else if (isFinale && w) {
        w.pose(p, wide, worldPose);
        blendPose(pose, hubPose, worldPose, seg(p, 0.12, 0.5));
        worldFade = seg(p, 0.05, 0.3);
      }
      camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      camera.lookAt(pose.look[0], pose.look[1], pose.look[2]);
      if (Math.abs(camera.fov - pose.fov) > 1e-3) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();

      // ── 6. Entry / return particles ──
      let morph = 0;
      let alpha = 0;
      if (isWorld && w) {
        if (phase === 'entry') {
          morph = seg(e, 0.4, 1.0, lin);
          alpha = seg(e, 0.38, 0.5) * (1 - seg(e, 0.85, 1.0));
        } else if (phase === 'return') {
          morph = 1 - seg(r, 0.0, 0.6, lin);
          alpha = seg(r, 0.0, 0.12) * (1 - seg(r, 0.5, 0.62));
        }
        if (alpha > 0.001) {
          const at = phase === 'entry' ? 0.15 : 0.85;
          w.pose(at, wide, tmpPose);
          let shape = shapes.get(act.id);
          if (!shape) shapes.set(act.id, (shape = w.shape(dissolve.count)));
          dissolve.setTarget(`${act.id}:${at}:${wide}`, shape, tmpPose);
          (dissolve.material.uniforms.uTint!.value as { set: (c: string) => void }).set(layerColor[(act.layer ?? 'next') as LayerColorId]);
        }
      }
      dissolve.points.visible = alpha > 0.001;
      dissolve.material.uniforms.uMorph!.value = morph;
      dissolve.material.uniforms.uAlpha!.value = alpha;
      dissolve.frame(camera.fov, aspect, elapsed, dpr);

      // ── 7. The world of the act ──
      worlds.keep(keep);
      worlds.hideAll();
      const section = sections.get(act.id) ?? null;
      if (w && (inWorld || isFinale) && worldFade > 0.001) {
        w.group.visible = true;
        const input: WorldInput & { core?: Matrix4; drawer?: number } = {
          time: elapsed,
          dt: delta,
          p,
          q: clamp01((p - 0.15) / Math.max(0.05, beats.result - 0.15)),
          fade: worldFade,
          pointer: { x: pointer.x, y: pointer.y },
          pointerOn: pointer.on && performance.now() - pointer.last < (coarse ? 3000 : 1e9),
          wide,
          aspect,
          px: dpr,
          camera,
          control: control(section),
          flag: (name, on) => {
            mark(section, name);
            setFlag(section, name, on);
          },
          attr: (name, value) => {
            mark(section, name);
            setAttr(section, name, value);
          },
          cssVar: (name, value) => setVar(section, name, value),
          core: coreMatrix,
          drawer: drawerP,
        };
        w.update(input);
      }

      // ── 8. Holograms: the hovered band's in the index; every band's in the finale ──
      if (holo && o) {
        holo.update(elapsed);
        const rise = isFinale ? seg(p, 0.4, 0.75) : 0;
        for (let j = 0; j < BANDS; j += 1) {
          const mesh = bandMeshes.current[j];
          const h = (hover[j] as Spring).x;
          const amount = coreVisible ? Math.max(i === 1 ? h * shot.labels : 0, rise * clamp01(rise * 1.6 - (j / BANDS) * 0.6)) : 0;
          if (!mesh || amount < 0.003) {
            holo.set(j, 0, 0, 0, 0, 1);
            continue;
          }
          mesh.getWorldPosition(world);
          const lift = CORE_RADIUS * scale * (isFinale ? 1.9 : 3.2);
          holo.set(j, amount, world.x, world.y + lift * (wide ? 1 : 0), world.z + (wide ? 0.2 : lift), scale * (isFinale ? 0.55 : 1.1), elapsed * 0.15);
        }
      }

      // ── 9. Dust, post-processing ──
      dust.material.uniforms.uTime!.value = elapsed;
      dust.material.uniforms.uAmount!.value = i === 0 ? shot.dust : isWorld && inWorld ? 0.25 : 0.55;
      dust.material.uniforms.uPixelRatio!.value = dpr;
      dust.points.visible = !(isWorld && inWorld);
      postLive.dof = i <= 1 ? shot.dof : 0;
      postLive.focus = camera.position.z - (outer.current?.position.z ?? 0);
      const pulse = isWorld ? (phase === 'entry' ? Math.sin(Math.PI * seg(e, 0.35, 0.85, lin)) : phase === 'return' ? Math.sin(Math.PI * seg(r, 0.05, 0.55, lin)) : 0) : 0;
      postLive.aberration = pulse * 0.9;
      postLive.grain = pulse;

      // ── 10. The acts' HTML ──
      if (current !== act.id) {
        const prev = current ? sections.get(current as (typeof ACTS)[number]['id']) : null;
        for (const name of ['data-on', 'data-entered', 'data-main', 'data-lit', 'data-result', 'data-hub']) setFlag(prev, name, false);
        // …and whatever the previous act's world marked on it (beats inside the act).
        for (const name of worldMarks.get(prev as HTMLElement) ?? []) setAttr(prev, name, null);
        worldMarks.delete(prev as HTMLElement);
        current = act.id;
      }
      const surface = sections.get('surface');
      setFlag(surface, 'data-entered', i === 0 && a > 0.32);
      setFlag(surface, 'data-on', shot.headline > 0.01 && i <= 1);
      setFlag(surface, 'data-lit', shot.headline > 0.01 && i <= 1);
      setFlag(sections.get('explode'), 'data-hub', i === 1 && shot.hub > 0.5 && shot.front < 0.5);
      if (isWorld || isFinale) {
        const on = p > 0.02 && p < 0.98;
        setFlag(section, 'data-on', on);
        if (on && !shown.has(section as HTMLElement)) {
          shown.add(section as HTMLElement);
          decode(section?.querySelector<HTMLElement>('[data-decode]') ?? null, elapsed);
        } else if (!on) shown.delete(section as HTMLElement);
        setFlag(section, 'data-entered', p > 0.04 && p < 0.95);
        setFlag(section, 'data-main', isFinale ? p > 0.3 : p >= 0.15 && p <= 0.85);
        setFlag(section, 'data-lit', isFinale ? p > 0.35 : p > 0.13 && p < 0.9);
        setFlag(section, 'data-result', !isFinale && p > beats.result - 0.1 && p < 0.9);
      }
      const vh = window.innerHeight;
      const heroTarget = clamp01((window.scrollY + 0.85 * vh - heroBottom) / (0.5 * vh));
      heroFade.omega = follow;
      const fade = clamp01(heroFade.step(heroTarget, delta));
      setVar(hero, '--hero-fade', easeOutCubic(fade).toFixed(3));
      setFlag(hero, 'data-gone', fade > 0.985);
      // The navigator steps back while the core or a cut face owns the screen; it is there inside the worlds.
      const actOn = (i === 0 && a > 0.25) || i === 1 || (isWorld && (p < 0.15 || p > 0.85)) || isFinale;
      setFlag(root, 'data-act-on', actOn);
      scrollLive.navOpacity = clamp01(nav.step(actOn ? 0 : 1, delta));
      setFlag(drawer, 'data-open', drawerP > 0.3);

      const decodingNow = runDecode(elapsed);
      scrollLive.settling =
        story.moving() ||
        attracting ||
        nav.moving(actOn ? 0 : 1) ||
        heroFade.moving(heroTarget) ||
        hover.some((s, j) => s.moving(j === hoverBand ? 1 : 0)) ||
        frontS.some((s) => Math.abs(s.v) > 1e-3) ||
        decodingNow ||
        shaft.moving(shaftTarget) ||
        (rockMix < 1 && wall.rock() !== null);

      // ── 11. The index: which band is under the pointer (raycast on the 11 bands only) ──
      if (hub && pointer.moved && o) {
        pointer.moved = false;
        ndc.set(pointer.x, pointer.y);
        raycaster.setFromCamera(ndc, camera);
        const meshes = (isFinale ? [bandMeshes.current[BANDS - 1]] : bandMeshes.current).filter((m): m is Mesh => !!m);
        const hit = raycaster.intersectObjects(meshes, false)[0];
        scrollLive.pointerBand = hit ? bandMeshes.current.indexOf(hit.object as Mesh) : -1;
      } else if (!hub) scrollLive.pointerBand = -1;
      const pointed = scrollLive.pointerBand >= 0 ? bandMeshes.current[scrollLive.pointerBand] : null;
      if (pointed) {
        pointed.getWorldPosition(v3).project(camera);
        scrollLive.pointerBandAt = [(v3.x * 0.5 + 0.5) * width, (0.5 - v3.y * 0.5) * height];
      } else scrollLive.pointerBandAt = null;

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

      if (debugOn) {
        const debug = (window as unknown as { __world?: Record<string, unknown> }).__world;
        if (debug) {
          debug.depth = 0;
          debug.beam = wallMaterial.uniforms.uBeam.value;
          debug.story = G;
          debug.act = act.id;
          debug.p = p;
          debug.phase = phase;
          debug.inWorld = inWorld;
          debug.worlds = worlds.mounted();
          debug.acts = { surface: a, explode: b };
          debug.hover = hoverBand;
          debug.hub = hub;
          debug.cam = [camera.position.x, camera.position.y, camera.position.z, camera.fov].map((x) => Math.round(x * 100) / 100);
          debug.look = pose.look.map((x) => Math.round(x * 100) / 100);
          // Screen centres of the bands (tests click a band in 3D).
          debug.bands = bandMeshes.current.map((mesh) => {
            if (!mesh || !o?.visible) return null;
            mesh.getWorldPosition(v3).project(camera);
            return [Math.round((v3.x * 0.5 + 0.5) * width), Math.round((0.5 - v3.y * 0.5) * height)];
          });
        }
      }
    },
    dispose() {
      scene.background = null;
      controller.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('pointerleave', onLeave);
      ATTRACT.uAttractK.value = 0;
      setFlag(root, 'data-act-on', false);
      scrollLive.navOpacity = 1;
      scrollLive.settling = false;
      scrollLive.hub = false;
      scrollLive.pointerBand = -1;
      if (holo) {
        scene.remove(holo.group);
        holo.dispose();
      }
    },
  };
}
