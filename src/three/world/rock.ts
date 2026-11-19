/**
 * Rock textures for the wall (docs/concept/ART_DIRECTION.md, "Textures"; built by
 * scripts/textures/build.py). Loaded only after the wall is live — never with the initial page.
 *
 * The file is one grayscale atlas (three seamless height tiles stacked). Here each tile is baked,
 * on the GPU, into its own repeating, mipmapped texture: RG = normal derived from the height
 * (central differences, wrapping), B = height. No normal maps are downloaded.
 * Returns null when the image cannot be decoded (no AVIF support): the wall stays procedural.
 */
import { LinearFilter, LinearMipmapLinearFilter, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial, Texture, WebGLRenderTarget, type WebGLRenderer } from 'three';

const TILES = 3;

const bakeFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTile;     // 0 = top tile of the image
uniform float uTexel;
varying vec2 vUv;
float h(vec2 uv) {
  vec2 w = fract(uv);
  return texture2D(uAtlas, vec2(w.x, (float(${TILES}) - 1.0 - uTile + w.y) / float(${TILES}))).r;
}
void main() {
  float c = h(vUv);
  float dx = h(vUv + vec2(uTexel, 0.0)) - h(vUv - vec2(uTexel, 0.0));
  float dy = h(vUv + vec2(0.0, uTexel)) - h(vUv - vec2(0.0, uTexel));
  vec2 n = clamp(vec2(-dx, -dy) * 2.2, -1.0, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, c, 1.0);
}
`;

export type Rock = { textures: Texture[]; dispose: () => void };

export async function loadRock(gl: WebGLRenderer, url = '/media/rock.avif'): Promise<Rock | null> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode(); // off the main thread
  } catch {
    return null;
  }
  const size = image.naturalWidth;
  const atlas = new Texture(image);
  atlas.minFilter = NearestFilter;
  atlas.magFilter = NearestFilter;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;

  const material = new ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: bakeFragment,
    uniforms: { uAtlas: { value: atlas }, uTile: { value: 0 }, uTexel: { value: 1 / size } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const targets = Array.from({ length: TILES }, () => {
    const t = new WebGLRenderTarget(size, size, { depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
    t.texture.wrapS = RepeatWrapping;
    t.texture.wrapT = RepeatWrapping;
    t.texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    return t;
  });
  const previous = gl.getRenderTarget();
  targets.forEach((target, i) => {
    (material.uniforms.uTile as { value: number }).value = i;
    gl.setRenderTarget(target);
    gl.render(scene, camera);
  });
  gl.setRenderTarget(previous);
  atlas.dispose();
  material.dispose();
  quad.geometry.dispose();

  return { textures: targets.map((t) => t.texture), dispose: () => targets.forEach((t) => t.dispose()) };
}
