"""Rock textures for the wall (docs/concept/ART_DIRECTION.md, "Textures").

  python3 scripts/textures/build.py      (npm run textures; needs Pillow and numpy)

Input:  docs/concept/textures/rock-{a,b,c}.png — grayscale rock from image AI (kept out of git).
Output: public/media/rock.avif — one grayscale atlas, the three tiles stacked (a, b, c).
        AVIF: 134–265 KB at this size against 405–481 KB for WebP at similar quality. Browsers
        without AVIF keep the procedural rock (the texture is an enhancement).

Per tile:
  1. grayscale, resized to SIZE (power of two, for mipmaps and repeat wrapping);
  2. flattened: the low frequencies (lighting gradients, blotches) are divided out, so no patch
     is recognisably brighter when the tile repeats;
  3. made to tile exactly: cross-faded with a copy of itself shifted by half a tile, weighted by
     the distance to the edge, then contrast is restored (the blend lowers it);
  4. checked: the wrap-around seam must not differ more than neighbouring pixels do.
Only the height is shipped. Normal maps are derived from it on the GPU when the 3D loads
(src/three/world/rock.ts): no extra bytes, and both always match.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs/concept/textures"
OUT = ROOT / "public/media/rock.avif"
SIZE = 768
QUALITY = 42
NAMES = ["rock-a", "rock-b", "rock-c"]


def flatten(g: np.ndarray) -> np.ndarray:
    """Divide out the low frequencies (Gaussian low-pass in the frequency domain, so it wraps)."""
    fy = np.fft.fftfreq(SIZE)[:, None]
    fx = np.fft.fftfreq(SIZE)[None, :]
    sigma = SIZE / 10
    kernel = np.exp(-2.0 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    low = np.real(np.fft.ifft2(np.fft.fft2(g) * kernel))
    return g / np.maximum(low, 1e-3) * g.mean()


def seamless(g: np.ndarray) -> np.ndarray:
    """Cross-fade with a half-shifted copy; the weight falls to zero at the tile's edges."""
    t = np.linspace(0.0, 1.0, SIZE, endpoint=False) + 0.5 / SIZE
    edge = np.minimum(t, 1.0 - t) * 2.0                     # 0 at the edges, 1 in the middle
    ramp = np.clip(edge / 0.5, 0.0, 1.0)
    ramp = ramp * ramp * (3.0 - 2.0 * ramp)
    w = np.minimum.outer(ramp, ramp)
    shifted = np.roll(g, (SIZE // 2, SIZE // 2), axis=(0, 1))
    mean = g.mean()
    # Variance-preserving blend: a plain average would wash the detail out where both are mixed.
    out = (w * (g - mean) + (1.0 - w) * (shifted - mean)) / np.sqrt(w * w + (1.0 - w) ** 2) + mean
    return out


def seam_ratio(g: np.ndarray) -> tuple[float, float]:
    lr = np.abs(g[:, 0] - g[:, -1]).mean() / np.abs(np.diff(g, axis=1)).mean()
    tb = np.abs(g[0, :] - g[-1, :]).mean() / np.abs(np.diff(g, axis=0)).mean()
    return float(lr), float(tb)


def main() -> None:
    tiles = []
    for name in NAMES:
        path = SRC / f"{name}.png"
        if not path.exists():
            sys.exit(f"missing {path.relative_to(ROOT)} (source textures are not in git)")
        g = np.asarray(Image.open(path).convert("L").resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float64)
        before = seam_ratio(g)
        g = seamless(flatten(g))
        # Normalise: mid-grey mean, the same contrast for every tile, so the shader's tint decides the colour.
        g = (g - g.mean()) / g.std() * 34.0 + 128.0
        g = np.clip(g, 0, 255)
        after = seam_ratio(g)
        print(f"{name}: seam/interior before LR {before[0]:.2f} TB {before[1]:.2f} → after LR {after[0]:.2f} TB {after[1]:.2f}")
        if max(after) > 1.15:
            sys.exit(f"{name} does not tile: {after}")
        tiles.append(g.astype(np.uint8))
    atlas = Image.fromarray(np.vstack(tiles), mode="L")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT, "AVIF", quality=QUALITY)
    print(f"{OUT.relative_to(ROOT)}: {atlas.size[0]}×{atlas.size[1]}, {OUT.stat().st_size / 1024:.1f} KB (AVIF q{QUALITY})")


main()
