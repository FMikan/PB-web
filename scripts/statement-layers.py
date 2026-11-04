"""Splits the statement design (docs/img/Point_Blank_WEB_002.png, white text and red pen
marks on a transparent 3840x2160 frame) into the layers app/scroll-text.tsx stacks, so
each can come in on its own:

    public/statement-line-1.png, -2.png   the white text, a line each, as is
    public/statement-1.png                the red "1%"'s shape only (alpha), and
    public/statement-circle.png           the red circle's: CSS masks, for the page to
                                          fill with its own color
    app/statement.ts                      where each sits, and the pen strokes that
                                          write the marks in (scripts/pen.py)

    python3 scripts/statement-layers.py

Every pixel is white, red, or a mix of the two along an edge; its green says how much
of it is white (red has none), so its alpha splits between text and marks by that. The
statement's box is the content's, with the same margin left and right so it stays where
it was in the frame. Text pieces go to the line their middle is in; the marks split at
the widest gap between them.

Where a mark is drawn over a letter, the text layer has a hole until the pen covers it:
the "e" of "have" and the "o" of "of" under "1%", the "a" of "access" under the circle.
Those three are drawn back in under the marks, in the design's own face (Benzin,
app/fonts/benzin-semibold.woff2; used here only), at the size and place that best
match what shows of each.
"""

import io
import json
from pathlib import Path

import numpy as np
import pen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/img/Point_Blank_WEB_002.png"
OUT = ROOT / "app/statement.ts"
PAD = 8  # px around each layer, so nothing is cut at the edge
LINE_SPLIT = 1112  # design y between the lines: the emptiest row there (1100-1124)
SPEED = 8000  # pen speed on the marks, design px per second
LIFT = 0.03  # pause when the pen lifts, seconds
FONT = ROOT / "app/fonts/benzin-semibold.woff2"
# The letters under the marks, and about where their middles are in the design.
HIDDEN = [("e", 2265, 1050), ("o", 2530, 1050), ("a", 1980, 1203)]

px = np.array(Image.open(SRC).convert("RGBA")).astype(float)
alpha = px[..., 3] / 255
white = px[..., 1] / 255
text = alpha * white
marks = alpha * (1 - white)

# Draw the hidden letters back in. Each is matched against what shows of it (not under a
# mark): first its size and place in coarse steps, then to the pixel.
font = TTFont(FONT)
font.flavor = None  # woff2 -> plain OpenType for FreeType
buf = io.BytesIO()
font.save(buf)
under = marks > 0.02


def glyph(ch, size):
    face = ImageFont.truetype(io.BytesIO(buf.getvalue()), size)
    l, t, r, b = face.getbbox(ch, anchor="ls")
    im = Image.new("L", (r - l + 4, b - t + 4), 0)
    ImageDraw.Draw(im).text((2 - l, 2 - t), ch, font=face, fill=255, anchor="ls")
    return np.array(im) / 255


def miss(g, x, y):
    h, w = g.shape
    shows = ~under[y : y + h, x : x + w]
    return (((text[y : y + h, x : x + w] - g) ** 2) * shows).sum() / shows.sum()


patch = ndimage.binary_dilation(under, iterations=2)  # + the edge pixels a mark only half covers
for ch, cx, cy in HIDDEN:
    tries = []
    for size, step, reach in [(s, 2, 40) for s in range(120, 200, 4)]:
        g = glyph(ch, size)
        h, w = g.shape
        for dy in range(-reach, reach + 1, step):
            for dx in range(-reach, reach + 1, step):
                x, y = cx - w // 2 + dx, cy - h // 2 + dy
                tries.append((miss(g, x, y), size, x, y))
    _, size0, x0_, y0_ = min(tries)
    tries = []
    for size in range(size0 - 3, size0 + 4):
        g = glyph(ch, size)
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                tries.append((miss(g, x0_ + dx, y0_ + dy), size, x0_ + dx, y0_ + dy))
    err, size, x, y = min(tries)
    assert err < 0.06, f"{ch}: no good match ({err:.3f})"
    g = glyph(ch, size)
    h, w = g.shape
    cut = patch[y : y + h, x : x + w]
    text[y : y + h, x : x + w][cut] = np.maximum(text[y : y + h, x : x + w][cut], g[cut])
    print(f"{ch}: size {size} at {x},{y}")

ys, xs = np.nonzero(alpha > 0)
x0 = xs.min() - PAD
x1 = px.shape[1] - x0  # same margin on the right: keeps the frame's centering
y0, y1 = ys.min() - PAD, ys.max() + 1 + PAD


def box(a):
    ys, xs = np.nonzero(a > 0.02)
    return xs.min() - PAD, ys.min() - PAD, xs.max() + 1 + PAD, ys.max() + 1 + PAD


def save(a, b, name):
    l, t, r, btm = b
    a = (a[t:btm, l:r] * 255).round().astype(np.uint8)
    Image.fromarray(np.dstack([np.full_like(a, 255), a]), "LA").save(ROOT / "public" / name, optimize=True)
    return a


def place(b):
    """A layer's box, relative to the statement's."""
    l, t, r, btm = b
    return {"x": int(l - x0), "y": int(t - y0), "width": int(r - l), "height": int(btm - t)}


# Lines: every piece of text (a letter, a dot) goes to the line its middle is in.
labels, n = ndimage.label(text > 0, structure=np.ones((3, 3)))
middles = ndimage.center_of_mass(text > 0, labels, range(1, n + 1))
first = np.zeros(n + 1, bool)
first[1:] = [y < LINE_SPLIT for y, _ in middles]
lines = []
for k, keep in enumerate((first[labels], ~first[labels] & (labels > 0)), 1):
    layer = np.where(keep, text, 0)
    b = box(layer)
    save(layer, b, f"statement-line-{k}.png")
    lines.append({"src": f"/statement-line-{k}.png", **place(b)})

# Marks: split at the widest run of empty columns between them; "1%" first, as it's
# read first.
cols = np.nonzero((marks > 0.02).any(axis=0))[0]
gap = int(np.argmax(np.diff(cols)))
split = (cols[gap] + cols[gap + 1]) // 2
out = []
for name, part in (("1", slice(split, None)), ("circle", slice(None, split))):
    layer = np.zeros_like(marks)
    layer[:, part] = marks[:, part]
    b = box(layer)
    gray = save(layer, b, f"statement-{name}.png")
    strokes, duration, missed = pen.strokes(gray, blur=2, hole=200, cover=1.2, edge=6, speed=SPEED, lift=LIFT)
    assert missed < 0.002, f"{name}: the pen misses {missed:.2%} of the mark"
    out.append({"src": f"/statement-{name}.png", **place(b), "strokes": strokes, "duration": duration})
    print(f"{name}: {len(strokes)} strokes, {duration}s")

OUT.write_text(
    "// Generated by scripts/statement-layers.py. Don't edit; run it again after the design changes.\n"
    "// Design pixels, relative to the statement's box. Mark strokes are [path, pen width,\n"
    "// start (s), duration (s)] in writing order, in the mark's own box.\n\n"
    "type Layer = { src: string; x: number; y: number; width: number; height: number };\n"
    "export type Mark = Layer & { strokes: [string, number, number, number][]; duration: number };\n\n"
    "export const STATEMENT: { width: number; height: number; lines: Layer[]; marks: Mark[] } = "
    f"{json.dumps({'width': int(x1 - x0), 'height': int(y1 - y0), 'lines': lines, 'marks': out}, indent=2)};\n"
)
for line in lines:
    print(line)
