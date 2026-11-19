/**
 * The director of the cinematic home (docs/STORYBOARD.md, M1: acts 0–2 and the join).
 *
 * One camera, one scene in the root of the single canvas: the wall (full-screen shader), the hero
 * core (11 band meshes, one shader program), floating dust. Every frame:
 *   scroll progress per act (src/lib/scroll/effects.ts) → critically damped springs (weight; no
 *   linear motion) → `shotAt` (src/three/director/shots.ts) → uniforms, transforms and a few CSS
 *   variables on the act HTML (hero fade, headline reveal, band label positions).
 * Post-processing (bloom, depth of field, grain, vignette) is a separate lazy chunk for the high
 * and medium tiers; the low tier renders directly.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three';
import { layer as layerColor, type LayerColorId } from '@/styles/tokens';
import { createBandMaterial } from '../materials/band';
import type { Quality } from '@/lib/scroll/store';
import { createDirectorRun } from './run';
import { frameWall } from '../materials/wall';
import { createWall, whenIdle } from '../world/wall';
import { BANDS, CORE_RADIUS } from './shots';

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
      attribute float seed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vSeed;
      void main() {
        vSeed = seed;
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
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 c = mix(vec3(1.0, 0.86, 0.68), uCyan, step(0.72, vSeed));
        gl_FragColor = vec4(c * a * uAmount * (0.25 + 0.55 * vSeed), 1.0);
      }
    `,
  });
  (material.uniforms.uCyan as { value: Vector3 }).value.set(0.56, 0.8, 0.82);
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

export default function Director({ ids, quality }: Props) {
  const gl = useThree((s) => s.gl);
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
  const [postReady, setPostReady] = useState(false);

  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const bandMeshes = useRef<(Mesh | null)[]>([]);

  // Everything per frame lives in one closure outside React (plain mutation of three.js objects and
  // the DOM), created after mount.
  const run = useRef<ReturnType<typeof createDirectorRun> | null>(null);

  useEffect(() => {
    const r = createDirectorRun({ wall, wallMaterial, ids, bands, dust, camera, outer, inner, bandMeshes });
    run.current = r;
    return () => {
      r.dispose();
      run.current = null;
    };
  }, [wall, wallMaterial, ids, bands, dust, camera]);

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
  useEffect(() => frameWall(wallMaterial, size.width, size.height), [wallMaterial, size.width, size.height]);

  useFrame((state, delta) => run.current?.frame(state.clock.elapsedTime, delta, state.size.width, state.size.height, state.viewport.dpr));

  const usePost = quality !== 'low';
  return (
    <>
      <mesh material={wallMaterial} frustumCulled={false} renderOrder={-1}>
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

