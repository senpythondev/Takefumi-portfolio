/**
 * Inside the core (STORYBOARD v2.3 §10-E): scrolling from one section to the next, the camera does
 * not pull out to the split core — it travels through the translucent core itself, like a tunnel.
 * The strata around it shift from the colour of the band it leaves to the colour of the next, and
 * light streams backward. (A flight from the index still enters a cut face from outside.)
 *
 * One open tube carried with the camera, looking down its axis; everything is in the fragment
 * shader. `uTravel` is the story position through the passage, so playing back runs it in reverse.
 */
import { AdditiveBlending, BackSide, Color, Mesh, Quaternion, ShaderMaterial, Vector3, type BufferGeometry, type PerspectiveCamera } from 'three';
import { FLUCT_GLSL } from '../worlds/kit';

export function createTunnel(tube: BufferGeometry, radius: number) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: BackSide,
    blending: AdditiveBlending,
    uniforms: { uAmount: { value: 0 }, uTravel: { value: 0 }, uTime: { value: 0 }, uFrom: { value: new Color() }, uTo: { value: new Color() }, uSpeed: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      void main() {
        vP = position;
        vN = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${FLUCT_GLSL}
      uniform float uAmount;
      uniform float uTravel;
      uniform float uTime;
      uniform float uSpeed;
      uniform vec3 uFrom;
      uniform vec3 uTo;
      varying vec3 vP;
      varying vec3 vN;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        if (abs(vN.y) > 0.5) discard;                       // the tube is open at both ends
        float ang = atan(vP.z, vP.x);
        float ahead = vP.y + 0.5;                           // 0 behind the camera … 1 far ahead (the tube's +Y is the view direction)
        float depth = clamp((ahead - 0.5) * 2.0, 0.0, 1.0); // 0 at the camera … 1 at the far end
        // Beds of rock as rings along the axis, sliding toward the camera as the story advances.
        float along = ahead * 60.0 - uTravel * 46.0 - uTime * 0.25;
        // Around the tube the noise is sampled on a circle, so it has no seam where the angle wraps.
        vec2 round = vec2(cos(ang), sin(ang));
        float warp = noise(round * 1.7 + vec2(along * 0.12, 3.0)) * 1.6;
        float bed = along * 0.42 + warp;
        float band = fract(bed);
        float ring = smoothstep(0.0, 0.08, band) * (1.0 - 0.75 * smoothstep(0.2, 1.0, band));
        // The colour of the band left behind, then of the band ahead: the far end is already the next.
        vec3 tint = mix(uFrom, uTo, clamp(uTravel * 1.4 - 0.2 + depth * 0.5, 0.0, 1.0));
        vec3 col = tint * (0.16 + 0.7 * ring) * (0.6 + 0.4 * noise(round * 6.0 + vec2(0.0, along * 1.7)));
        // Seams of light between beds, and thin streams of light running back along the wall.
        col += vec3(0.56, 0.8, 0.82) * smoothstep(0.06, 0.0, band) * 0.5 * hash(vec2(floor(bed), 3.0));
        float lane = floor(ang * 14.0);
        float dash = fract(along * (0.05 + 0.04 * hash(vec2(lane, 1.0))) + hash(vec2(lane, 7.0)));
        col += vec3(0.56, 0.8, 0.82) * step(0.82, hash(vec2(lane, 5.0))) * smoothstep(0.5, 0.0, abs(fract(ang * 14.0) - 0.5)) * smoothstep(0.0, 0.25 + 0.5 * uSpeed, dash) * smoothstep(1.0, 0.9, dash) * 0.55;
        // The far end glows faintly; near the camera the wall thins to nothing (translucent core).
        float fog = smoothstep(0.0, 0.25, depth) * (1.0 - smoothstep(0.5, 0.98, depth));
        col += tint * 0.35 * smoothstep(0.55, 0.9, depth);
        gl_FragColor = vec4(col * fog * uAmount * (0.85 + 0.15 * fluct(uTime * 0.9, 0.3)), 1.0);
      }`,
  });
  const mesh = new Mesh(tube, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  const width = 2.4 / radius;
  mesh.scale.set(width, 60, width);
  const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

  return {
    mesh,
    material,
    /** Carry the tube with the camera, its axis along the view. */
    frame(camera: PerspectiveCamera, amount: number, travel: number, time: number, speed: number) {
      mesh.visible = amount > 0.002;
      if (!mesh.visible) return;
      mesh.position.copy(camera.position);
      mesh.quaternion.copy(camera.quaternion).multiply(turn);
      material.uniforms.uAmount!.value = amount;
      material.uniforms.uTravel!.value = travel;
      material.uniforms.uTime!.value = time;
      material.uniforms.uSpeed!.value = speed;
    },
    dispose() {
      material.dispose();
    },
  };
}

export type Tunnel = ReturnType<typeof createTunnel>;
