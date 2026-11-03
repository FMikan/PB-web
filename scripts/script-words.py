"""Builds app/script-words.ts: the Have Heart words of the scroll text as SVG, with a pen
path through each letter so the page can write them in, like the swoosh in the header.

    python3 scripts/script-words.py

For each word: its outline (the fill), and its centerline split into strokes in writing
order, each with a width that covers the letter around it and a start time and duration
at a steady pen speed. The centerline comes from thinning the rasterized word; the walk
along it goes left to right, keeps going straight through junctions, and lifts the pen
to the leftmost branch it left behind when a stroke ends. Pieces that aren't joined to
the word (an i's dot, the comma) come in order of where they start.

Needs numpy, scipy, Pillow and fontTools. Run it again after changing the words.
"""

import io
import json
import math
from pathlib import Path

import numpy as np
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "app/fonts/have-heart-one.woff2"
OUT = ROOT / "app/script-words.ts"
WORDS = ["alive,", "unique."]
SCALE = 0.5  # raster pixels per font unit
PAD = 40  # raster padding, px
SPEED = 7800  # pen speed, font units per second
LIFT = 0.03  # pause when the pen lifts, seconds
COVER = 1.2  # pen width over the letter's thickness under it
HOLE = 300  # holes in a letter smaller than this (px) are brush texture, not counters


def load():
    font = TTFont(FONT)
    font.flavor = None  # woff2 -> plain OpenType for FreeType
    buf = io.BytesIO()
    font.save(buf)
    return font, buf.getvalue()


def outline(font, word):
    """SVG path of the word in font units, baseline at y=0, y down; and its advance."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    pen = SVGPathPen(gs, ntos=lambda v: str(round(v)))
    x = 0
    for ch in word:
        name = cmap[ord(ch)]
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        x += font["hmtx"][name][0]
    return pen.getCommands(), x


def thin(img):
    """Zhang-Suen thinning of a boolean image."""
    img = img.astype(np.uint8)
    while True:
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            n = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
            b = sum(n)
            a = sum(((n[k] == 0) & (n[(k + 1) % 8] == 1)).astype(np.uint8) for k in range(8))
            p2, p4, p6, p8 = n[0], n[2], n[4], n[6]
            c = ((p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)) if step == 0 else ((p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0))
            m = (img == 1) & (b >= 2) & (b <= 6) & (a == 1) & c
            if m.any():
                img[m] = 0
                changed = True
        if not changed:
            return img.astype(bool)


NEIGHBORS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def walk(pixels):
    """Orders one connected skeleton (set of (x, y)) into strokes, as lists of points."""
    left = set(pixels)
    seen = set()
    strokes = []
    start = min(left)  # leftmost (then topmost)
    stroke, heading = [start], (0, 1)  # first stroke heads down
    left.discard(start)
    seen.add(start)
    while True:
        x, y = stroke[-1]
        nxt = [(x + dx, y + dy) for dx, dy in NEIGHBORS if (x + dx, y + dy) in left]
        if nxt:
            if len(stroke) > 1:
                bx, by = stroke[max(0, len(stroke) - 6)]
                d = math.hypot(x - bx, y - by) or 1
                heading = ((x - bx) / d, (y - by) / d)
            p = max(nxt, key=lambda q: ((q[0] - x) * heading[0] + (q[1] - y) * heading[1]) / math.hypot(q[0] - x, q[1] - y))
            stroke.append(p)
            left.discard(p)
            seen.add(p)
            continue
        strokes.append(stroke)
        if not left:
            return strokes
        # Lift: the leftmost branch that leaves from what's already drawn, starting from
        # the drawn pixel it touches so the strokes join.
        frontier = [q for q in left if any((q[0] + dx, q[1] + dy) in seen for dx, dy in NEIGHBORS)]
        q = min(frontier or left)
        anchor = next(((q[0] + dx, q[1] + dy) for dx, dy in NEIGHBORS if (q[0] + dx, q[1] + dy) in seen), None)
        stroke = [anchor, q] if anchor else [q]
        heading = (0, 1)
        left.discard(q)
        seen.add(q)


def smooth(pts, k=3):
    if len(pts) <= 2 * k:
        return pts
    a = np.array(pts, float)
    out = a.copy()
    for i in range(k, len(a) - k):
        out[i] = a[i - k : i + k + 1].mean(axis=0)
    return [tuple(p) for p in out]


def simplify(pts, eps):
    """Ramer-Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    L = np.hypot(*ab)
    d = [abs(np.cross(ab, np.array(p) - a)) / L if L else np.hypot(*(np.array(p) - a)) for p in pts]
    i = int(np.argmax(d))
    if d[i] <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], eps)[:-1] + simplify(pts[i:], eps)


def build(font, data, word):
    d, advance = outline(font, word)
    asc, desc = font["hhea"].ascent, -font["hhea"].descent
    # Raster with room for swashes past the advance and the box.
    w = int((advance + 600) * SCALE) + 2 * PAD
    h = int((asc + desc + 400) * SCALE) + 2 * PAD
    ox, oy = PAD + 300 * SCALE, PAD + (asc + 200) * SCALE  # baseline origin, px
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((ox, oy), word, font=ImageFont.truetype(io.BytesIO(data), round(1000 * SCALE)), fill=255, anchor="ls")
    ink = np.array(img) > 127
    # The brush texture (ragged edges, specks of paper inside the strokes) would branch the
    # centerline everywhere: blur it away and fill the small holes, keeping the counters.
    solid = ndimage.gaussian_filter(np.array(img, float), 3) > 127
    holes, n = ndimage.label(~solid)
    sizes = ndimage.sum(np.ones_like(holes), holes, range(n + 1))
    solid |= (sizes < HOLE)[holes] & (holes > 0)
    depth = ndimage.distance_transform_edt(solid)
    skel = thin(solid)
    labels, n = ndimage.label(skel, structure=np.ones((3, 3)))
    parts = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(labels == k)
        parts.append((xs.min(), set(zip(xs.tolist(), ys.tolist()))))
    parts.sort(key=lambda p: p[0])

    strokes, t = [], 0.0
    pen = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(pen)
    for _, pixels in parts:
        part = walk(pixels)
        # Stubs off a junction are covered by the strokes around them; a dot is all stub,
        # so it keeps its longest.
        keep = [s for s in part if len(s) >= max(depth[y, x] for x, y in s)] or [max(part, key=len)]
        for s in keep:
            width = 2 * max(depth[y, x] for x, y in s) * COVER + 12  # + the ragged brush edge past the smoothed shape
            pts = simplify(smooth(s), 0.6)
            if len(pts) == 1:
                pts = [pts[0], (pts[0][0] + 0.5, pts[0][1])]  # a dot: give the dash a length
            # Coverage check raster: the stroke at full length.
            draw.line(pts, fill=255, width=round(width), joint="curve")
            for x, y in (pts[0], pts[-1]):
                r = width / 2
                draw.ellipse((x - r, y - r, x + r, y + r), fill=255)
            units = [((x - ox) / SCALE, (y - oy) / SCALE) for x, y in pts]
            length = sum(math.dist(a, b) for a, b in zip(units, units[1:]))
            dur = max(length / SPEED, 0.04)
            path = "M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in units)
            strokes.append([path, round(width / SCALE), round(t, 3), round(dur, 3)])
            t += dur + LIFT
    missed = (ink & (np.array(pen) == 0)).sum() / ink.sum()
    return {"width": advance, "glyphs": d, "strokes": strokes, "duration": round(t - LIFT, 3)}, missed, (ink, skel, pen, ox, oy)


def main():
    font, data = load()
    words = {}
    for w in WORDS:
        words[w], missed, _ = build(font, data, w)
        assert missed < 0.002, f"{w}: the pen misses {missed:.2%} of the letters"
    OUT.write_text(
        "// Generated by scripts/script-words.py. Don't edit; change the words there and run it.\n"
        "// Font units, y down, baseline at 0; the em box is y -750 to 250. Strokes are\n"
        "// [path, pen width, start (s), duration (s)] in writing order.\n\n"
        "export type ScriptWord = { width: number; glyphs: string; strokes: [string, number, number, number][]; duration: number };\n\n"
        f"export const SCRIPT_WORDS: Record<string, ScriptWord> = {json.dumps(words, indent=2)};\n"
    )
    for w, v in words.items():
        print(f"{w}: {len(v['strokes'])} strokes, {v['duration']}s")


if __name__ == "__main__":
    main()
