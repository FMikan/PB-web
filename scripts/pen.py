"""The pen: turns a raster of ink into strokes a page can draw in, one after another, as
the dashes of SVG mask paths (scripts/script-words.py, scripts/statement-layers.py).

The centerline comes from thinning the ink; the walk along it goes left to right, keeps
going straight through junctions, and lifts the pen to the leftmost branch it left
behind when a stroke ends. Pieces that aren't joined (an i's dot, a comma) come in order
of where they start. Each stroke gets a width that covers the ink around it, and a start
time and duration at a steady speed.
"""

import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


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


def strokes(gray, *, blur, hole, cover, edge, speed, lift, unit=1.0, origin=(0, 0)):
    """Pen strokes over gray (0-255 ink raster). blur and hole (px) smooth away texture
    that would branch the centerline: the blur's sigma, and the size under which a hole
    in the ink is texture rather than a counter. Widths are cover x the ink's thickness +
    edge px. Output in units of unit px from origin, speed in units/s, lift (s) between
    strokes. Returns ([path, width, start, duration], total duration, share of ink missed)."""
    ink = gray > 127
    solid = ndimage.gaussian_filter(gray.astype(float), blur) > 127
    holes, n = ndimage.label(~solid)
    sizes = ndimage.sum(np.ones_like(holes), holes, range(n + 1))
    solid |= (sizes < hole)[holes] & (holes > 0)
    depth = ndimage.distance_transform_edt(solid)
    labels, n = ndimage.label(thin(solid), structure=np.ones((3, 3)))
    parts = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(labels == k)
        parts.append((xs.min(), set(zip(xs.tolist(), ys.tolist()))))
    parts.sort(key=lambda p: p[0])

    out, t = [], 0.0
    pen = Image.new("L", gray.shape[::-1], 0)
    draw = ImageDraw.Draw(pen)
    ox, oy = origin
    for _, pixels in parts:
        part = walk(pixels)
        # Stubs off a junction are covered by the strokes around them; a dot is all stub,
        # so it keeps its longest.
        keep = [s for s in part if len(s) >= max(depth[y, x] for x, y in s)] or [max(part, key=len)]
        for s in keep:
            width = 2 * max(depth[y, x] for x, y in s) * cover + edge
            pts = simplify(smooth(s), 0.6)
            if len(pts) == 1:
                pts = [pts[0], (pts[0][0] + 0.5, pts[0][1])]  # a dot: give the dash a length
            # Coverage check raster: the stroke at full length.
            draw.line(pts, fill=255, width=round(width), joint="curve")
            for x, y in (pts[0], pts[-1]):
                r = width / 2
                draw.ellipse((x - r, y - r, x + r, y + r), fill=255)
            units = [((x - ox) / unit, (y - oy) / unit) for x, y in pts]
            length = sum(math.dist(a, b) for a, b in zip(units, units[1:]))
            dur = max(length / speed, 0.04)
            path = "M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in units)
            out.append([path, round(width / unit), round(t, 3), round(dur, 3)])
            t += dur + lift
    missed = (ink & (np.array(pen) == 0)).sum() / ink.sum()
    return out, round(t - lift, 3), missed
