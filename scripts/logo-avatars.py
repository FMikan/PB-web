#!/usr/bin/env python3
"""Round avatars from docs/logos: each logo clipped on the outer edge of its white ring,
transparent outside. Run from the repo root: python3 scripts/logo-avatars.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

# The eight the slider uses, of what's in docs/logos: avatar name to source file.
SOURCES = {
    "bolt": "photo_2026-11-05_17-30-57.jpg",
    "cake": "photo_2026-11-05_17-31-01.jpg",
    "triangle": "photo_2026-11-05_17-31-04.jpg",
    "helmet": "photo_2026-11-05_17-31-08.jpg",
    "book": "photo_2026-11-05_17-31-11.jpg",
    "parrot": "photo_2026-11-05_17-31-16.jpg",
    "samurai": "samurai.png",
    "snake": "snake.png",
}
SIZE = 800  # the slider shows them at up to 26rem, on 2x screens
# The ring's outer edge, the same in all of them: centered, this far from the middle (a circle
# fitted to each edge, within 0.13px). A little inside it, past the JPEG's soft dark fringe.
RADIUS = 630.3 - 1.5


def round_mask():
    big = SIZE * 4
    yy, xx = np.ogrid[:big, :big]
    middle = (big - 1) / 2
    disc = np.hypot(xx - middle, yy - middle) <= big / 2
    return Image.fromarray((disc * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.BOX)


def check(path):
    """Fails if a corner isn't clear or the rim is anything but the white ring all the way round."""
    pixels = np.asarray(Image.open(path))
    assert pixels.shape == (SIZE, SIZE, 4), path
    assert pixels[0, 0, 3] == pixels[-1, -1, 3] == pixels[0, -1, 3] == pixels[-1, 0, 3] == 0, path
    angles = np.linspace(0, 2 * np.pi, 720, endpoint=False)
    r = SIZE / 2 - 3  # just past the outer edge's antialiasing
    x = np.round((SIZE - 1) / 2 + r * np.cos(angles)).astype(int)
    y = np.round((SIZE - 1) / 2 + r * np.sin(angles)).astype(int)
    rim = pixels[y, x]
    assert rim[:, :3].min() > 200, f"{path}: dark on the rim, min {rim[:, :3].min()}"
    assert rim[:, 3].min() == 255, f"{path}: rim not opaque"


def main():
    out = Path("public/logos")
    out.mkdir(exist_ok=True)
    mask = round_mask()
    for name, source in SOURCES.items():
        image = Image.open(Path("docs/logos") / source).convert("RGB")
        middle = image.width / 2
        box = (middle - RADIUS, middle - RADIUS, middle + RADIUS, middle + RADIUS)
        avatar = image.resize((SIZE, SIZE), Image.LANCZOS, box=box)
        avatar.putalpha(mask)
        path = out / f"{name}.png"
        avatar.save(path, optimize=True)
        check(path)
        print(f"{path}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
