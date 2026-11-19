/**
 * The director of the cinematic home (docs/STORYBOARD.md v2.1): one camera, one scene for every act.
 *
 * In the root of the single canvas: the wall (full-screen shader, acts 0–1), the core (11 band
 * meshes, one shader program; split, it is the index of the site), floating dust, the particles
 * of the entry and return, and the section worlds — each its own lazy chunk (./worlds.ts). Every
 * frame: scroll progress → one story position → shots → uniforms, transforms, a few attributes on
 * the act's HTML (./run.ts).
 * Post-processing (bloom, depth of field, grain, vignette, aberration) is a separate lazy chunk for
 * the high and medium tiers; the low tier renders directly.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three';
import { FLUCT_GLSL } from '../worlds/kit';
import { createDissolve } from './dissolve';
import { createWorldHost } from './worlds';
import { layer as layerColor, type LayerColorId } from '@/styles/tokens';
import { createBandMaterial } from '../materials/band';
import type { Quality } from '@/lib/scroll/store';
import { createDirectorRun } from './run';
import { frameWall } from '../materials/wall';
import { createWall, whenIdle } from '../world/wall';
import { BANDS, CORE_RADIUS } from './shots';
import { LAYER_IDS } from '@/content/layer-ids';

const Post = lazy(() => import('./Post'));

type LiveQuality = Exclude<Quality, 'static'>;
type Props = { ids: string[]; quality: LiveQuality };

const DUST: Record<LiveQuality, number> = { high: 420, medium: 240, low: 110 };

export type Dust = ReturnType<typeof createDust>;

function createDust(count: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  let s = 7;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rand() - 0.5) * 14;
    positions[i * 3 + 1] = (rand() - 0.5) * 8;
    positions[i * 3 + 2] = -4 + rand() * 7;
    seeds[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uPixelRatio: { value: 1 }, uCyan: { value: new Vector3() } },
    vertexShader: /* glsl */ `
      ${FLUCT_GLSL}
      attribute float seed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vSeed;
      varying float vFlick;
      void main() {
        vSeed = seed;
        // Natural flicker, like fireflies (STORYBOARD v2.1 §8.5): never a fixed blink.
        vFlick = 0.25 + 0.75 * pow(fluct(uTime * 1.1, seed), 1.6);
        vec3 p = position;
        // Each mote drifts on its own slow, uneven path (no constant speed).
        p.x += sin(uTime * (0.07 + seed * 0.05) + seed * 31.0) * 0.6;
        p.y += mod(uTime * (0.03 + seed * 0.04) + seed * 8.0, 8.0) - 4.0 - position.y * 0.0;
        p.z += cos(uTime * (0.05 + seed * 0.03) + seed * 17.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.2 + 3.5 * seed * seed) * uPixelRatio * (9.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      uniform vec3 uCyan;
      varying float vSeed;
      varying float vFlick;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 c = mix(vec3(1.0, 0.86, 0.68), uCyan, step(0.72, vSeed));
        gl_FragColor = vec4(c * a * uAmount * (0.25 + 0.55 * vSeed) * vFlick, 1.0);
      }
    `,
  });
  (material.uniforms.uCyan as { value: Vector3 }).value.set(0.56, 0.8, 0.82);
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, material, dispose: () => (geometry.dispose(), material.dispose()) };
}

export type Sparks = ReturnType<typeof createSparks>;

/** Act 1: sparks and dust thrown up at the rim of the borehole while the core is pulled out. */
function createSparks(count: number) {
  const seeds = new Float32Array(count * 3);
  let s = 11;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = rand();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uOrigin: { value: new Vector3() }, uScale: { value: 1 }, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform vec3 uOrigin;
      uniform float uScale;
      uniform float uPx;
      varying float vA;
      varying float vWarm;
      void main() {
        float t = fract(uTime * (0.45 + aSeed.x * 0.5) + aSeed.y);
        vec3 p = uOrigin + vec3((aSeed.z - 0.5) * 1.4 * t, (0.9 + aSeed.x) * t - 1.6 * t * t, (aSeed.y - 0.5) * 0.4 * t) * uScale;
        vA = (1.0 - t) * step(0.0, p.y - uOrigin.y + 0.02 * uScale);
        vWarm = step(0.35, aSeed.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.0 + 2.0 * aSeed.x) * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      varying float vA;
      varying float vWarm;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        vec3 c = mix(vec3(0.56, 0.8, 0.82), vec3(1.0, 0.78, 0.5), vWarm);
        gl_FragColor = vec4(c * a * vA * uAmount * 1.6, 1.0);
      }`,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, material, dispose: () => (geometry.dispose(), material.dispose()) };
}

/**
 * The navigator core is a drei View (a portal) drawn after this scene. It leaves the renderer's
 * viewport and scissor on its own small rectangle, and its portal can set the shared camera's
 * aspect to that rectangle's (R3F only corrects it on a window resize). Restore both before the
 * full-screen render.
 */
function FullViewport() {
  useFrame(({ gl, size, camera }) => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    const aspect = size.width / size.height;
    if (camera instanceof PerspectiveCamera && Math.abs(camera.aspect - aspect) > 1e-4) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }, 0.5);
  return null;
}

/** Low tier (or until the post-processing chunk is ready): render the root scene directly. */
function DirectRender() {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
  }, 1);
  return null;
}

const DISSOLVE: Record<LiveQuality, number> = { high: 9000, medium: 4500, low: 2000 };

export default function Director({ ids, quality }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const wall = useMemo(() => createWall(ids), [ids]);
  const wallMaterial = useMemo(() => wall.get(quality), [wall, quality]);
  const bandGeometry = useMemo(() => new CylinderGeometry(CORE_RADIUS, CORE_RADIUS, 1, quality === 'low' ? 56 : 64, 1), [quality]);
  const bands = useMemo(
    () => Array.from({ length: BANDS }, (_, i) => createBandMaterial(layerColor[(ids[i] ?? 'next') as LayerColorId] ?? layerColor.next, i, 1, CORE_RADIUS)),
    [ids],
  );
  const dust = useMemo(() => createDust(DUST[quality]), [quality]);
  const dissolve = useMemo(() => createDissolve(DISSOLVE[quality]), [quality]);
  const sparks = useMemo(() => createSparks(quality === 'low' ? 120 : 320), [quality]);
  const [postReady, setPostReady] = useState(false);

  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const wallMesh = useRef<Mesh>(null);
  const bandMeshes = useRef<(Mesh | null)[]>([]);

  // The section worlds (lazy chunks), mounted around the current act.
  const worlds = useMemo(() => {
    const tints = Object.fromEntries(LAYER_IDS.map((id) => [id, layerColor[id as LayerColorId]]));
    // A small upright core for worlds that show one (the deep layer): the same band shader.
    const coreModel = (count: number) => {
      const g = new Group();
      for (let i = 0; i < count; i += 1) {
        const m = createBandMaterial(layerColor[(LAYER_IDS[(i % (LAYER_IDS.length - 1)) + 1] ?? 'deep') as LayerColorId], i + 20, 1, CORE_RADIUS);
        m.uniforms.uRim.value = 0.6;
        const mesh = new Mesh(bandGeometry, m);
        mesh.position.y = (count / 2 - i - 0.5) * 1.02;
        g.add(mesh);
      }
      return g;
    };
    return createWorldHost({ scene, gl, camera, tier: quality, tints, coreModel });
  }, [scene, gl, camera, quality, bandGeometry]);

  // Everything per frame lives in one closure outside React (plain mutation of three.js objects and
  // the DOM), created after mount.
  const run = useRef<ReturnType<typeof createDirectorRun> | null>(null);

  useEffect(() => {
    const r = createDirectorRun({ wall, wallMaterial, wallMesh, ids, bands, dust, sparks, camera, outer, inner, bandMeshes, dissolve, worlds, scene });
    run.current = r;
    return () => {
      r.dispose();
      run.current = null;
    };
  }, [wall, wallMaterial, ids, bands, dust, sparks, camera, dissolve, worlds, scene]);

  useEffect(() => {
    // After the first frames: textures (medium/high), then the lower tiers' shaders.
    const cancel = whenIdle(() => {
      void (async () => {
        if (quality !== 'low') await wall.loadRock(gl);
        await wall.precompileBelow(quality, gl);
        performance.mark('world:ready');
        const debug = (window as unknown as { __world?: { tiers?: string[] } }).__world;
        if (debug) debug.tiers = wall.compiled();
      })();
    });
    return cancel;
  }, [wall, gl, quality]);
  useEffect(() => () => wall.dispose(), [wall]);
  useEffect(() => () => bandGeometry.dispose(), [bandGeometry]);
  useEffect(() => () => bands.forEach((m) => m.dispose()), [bands]);
  useEffect(() => () => dust.dispose(), [dust]);
  useEffect(() => () => dissolve.dispose(), [dissolve]);
  useEffect(() => () => sparks.dispose(), [sparks]);
  useEffect(() => () => worlds.dispose(), [worlds]);
  useEffect(() => frameWall(wallMaterial, size.width, size.height), [wallMaterial, size.width, size.height]);


  useFrame((state, delta) => run.current?.frame(state.clock.elapsedTime, delta, state.size.width, state.size.height, state.viewport.dpr));

  const usePost = quality !== 'low';
  return (
    <>
      <mesh ref={wallMesh} material={wallMaterial} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <group ref={outer} visible={false}>
        <group ref={inner}>
          {bands.map((m, i) => (
            <mesh
              key={i}
              ref={(el) => {
                bandMeshes.current[i] = el;
              }}
              geometry={bandGeometry}
              material={m}
            />
          ))}
        </group>
      </group>
      <primitive object={dust.points} />
      <primitive object={dissolve.points} />
      <primitive object={sparks.points} />
      <FullViewport />
      {usePost ? (
        <Suspense fallback={null}>
          <Post quality={quality} onReady={() => setPostReady(true)} />
        </Suspense>
      ) : null}
      {!usePost || !postReady ? <DirectRender /> : null}
    </>
  );
}
