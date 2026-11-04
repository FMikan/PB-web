"""Splits the statement design (docs/img/Point_Blank_WEB_002.png, white text and red pen
marks on a transparent 3840x2160 frame) into the two layers app/scroll-text.tsx stacks:

    public/statement-text.png   the white text, as is
    public/statement-marks.png  the red marks' shape only (alpha), for a CSS mask, so the
                                page can fill them with the header's gradient and shine

    python3 scripts/statement-layers.py

Every pixel is white, red, or a mix of the two along an edge; its green says how much
of it is white (red has none), so its alpha splits between the layers by that. The text
layer is cropped to the content, with the same margin left and right so it stays where
it was in the frame; the marks layer to the marks. Prints both boxes for the page.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/img/Point_Blank_WEB_002.png"
PAD = 8  # px around the content, so nothing is cut at the edge

px = np.array(Image.open(SRC).convert("RGBA")).astype(float)
alpha = px[..., 3] / 255
white = px[..., 1] / 255
text = alpha * white
marks = alpha * (1 - white)

ys, xs = np.nonzero(alpha > 0)
x0 = xs.min() - PAD
x1 = px.shape[1] - x0  # same margin on the right: keeps the frame's centering
y0, y1 = ys.min() - PAD, ys.max() + 1 + PAD
ys, xs = np.nonzero(marks > 0.02)
mx0, my0, mx1, my1 = xs.min() - PAD, ys.min() - PAD, xs.max() + 1 + PAD, ys.max() + 1 + PAD


def save(a, box, name):
    l, t, r, b = box
    a = (a[t:b, l:r] * 255).round().astype(np.uint8)
    Image.fromarray(np.dstack([np.full_like(a, 255), a]), "LA").save(ROOT / "public" / name, optimize=True)


save(text, (x0, y0, x1, y1), "statement-text.png")
save(marks, (mx0, my0, mx1, my1), "statement-marks.png")
print(f"frame {px.shape[1]}x{px.shape[0]}")
print(f"text  x {x0} y {y0} size {x1 - x0}x{y1 - y0}")
print(f"marks x {mx0} y {my0} size {mx1 - mx0}x{my1 - my0}")
