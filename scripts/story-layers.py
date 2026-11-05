"""The two lines under the statement, each from its design (docs/text/tekst_2.png, tekst_3.png:
white text and red pen marks on a transparent 3840x2160 frame), and the hand-drawn arrows that
lead from one to the next, as the layers app/scroll-text.tsx stacks:

    public/story-*.png   white text as is, a line each; red marks and arrows as shapes only
                         (alpha), for the page to fill with the statement's pink gradient
    app/story.ts         where each sits, when it comes in, and the pen strokes of the marks

    python3 scripts/story-layers.py

In these designs the red runs behind the white, so the letters are whole. Every pixel is white
over red: its green says how much white, and what's left of its alpha is the red showing past
that. The red carries on a little under the letters, so no seam shows along their edges.
The arrows aren't in the designs: each is a brush stroke, drawn here. Same scale as the
statement: its box is 3464 wide (the design's), and this one hangs right under it.
"""

import json
from pathlib import Path

import numpy as np
import pen
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app/story.ts"
WIDTH = 3464  # the statement's box (app/statement.ts)
PAD = 8  # px around each layer, so nothing is cut at the edge
SPEED = 6000  # pen speed on the designs' marks, px per second
LIFT = 0.03  # pause when the pen lifts, seconds
RNG = np.random.default_rng(7)  # the arrows' wobble, the same on every run
HANDOFF = 2 / 3  # the next thing starts when this one is this far through
ARROW_TIME = 0.36  # seconds, about: the shaft, then the two barbs
LINE_TIME = 0.6  # a line's rise (globals.css .statement-line)


def design(name):
    px = np.array(Image.open(ROOT / f"docs/text/{name}.png").convert("RGBA")).astype(float)
    alpha = px[..., 3] / 255
    text = alpha * px[..., 1] / 255
    red = np.where(text < 0.98, (alpha - text) / np.maximum(1 - text, 0.02), 0).clip(0, 1)
    # A check: white over red has to give back the design, pixel by pixel.
    assert np.abs(text + (1 - text) * red - alpha)[text < 0.98].max() < 0.02, name
    red = np.maximum(red, ndimage.grey_dilation(red, size=5) * (text > 0.02))
    return text, red


def cut(a, left=0, top=0, right=None, bottom=None):
    out = np.zeros_like(a)
    out[top:bottom, left:right] = a[top:bottom, left:right]
    return out


def box(a):
    ys, xs = np.nonzero(a > 0.02)
    return int(xs.min() - PAD), int(ys.min() - PAD), int(xs.max() + 1 + PAD), int(ys.max() + 1 + PAD)


def save(a, b, name):
    l, t, r, btm = b
    a = (a[t:btm, l:r] * 255).round().astype(np.uint8)
    Image.fromarray(np.dstack([np.full_like(a, 255), a]), "LA").save(ROOT / "public" / f"{name}.png", optimize=True)
    return a


def layer(name, b, shift, at):
    l, t, r, btm = b
    return {"src": f"/{name}.png", "x": l + shift[0], "y": t + shift[1], "width": r - l, "height": btm - t, "at": round(at, 3)}


def line(a, name, shift, at):
    b = box(a)
    save(a, b, name)
    return layer(name, b, shift, at)


def mark(a, name, shift, at, speed=SPEED, lift=LIFT):
    """A mark of a design: its strokes found from its shape (scripts/pen.py)."""
    b = box(a)
    gray = save(a, b, name)
    strokes, duration, missed = pen.strokes(gray, blur=2, hole=200, cover=1.4, edge=10, speed=speed, lift=lift)
    assert missed < 0.002, f"{name}: the pen misses {missed:.2%}"
    print(f"{name}: {len(strokes)} strokes, {duration}s")
    return {**layer(name, b, shift, at), "strokes": strokes, "duration": duration}


def curve(points, n=400):
    """A smooth line through points (Catmull-Rom), evenly spaced along its length."""
    p = np.array(points, float)
    p = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for a, b, c, d in zip(p, p[1:], p[2:], p[3:]):
        for t in np.linspace(0, 1, 60, endpoint=False):
            out.append(b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a))))
    out.append(p[-2])
    out = np.array(out)
    along = np.r_[0, np.cumsum(np.hypot(*np.diff(out, axis=0).T))]
    at = np.linspace(0, along[-1], n)
    return np.column_stack([np.interp(at, along, out[:, 0]), np.interp(at, along, out[:, 1])])


def wander(n, size):
    """Slow noise, what a hand adds to a line: n samples, ending at 0 at both ends."""
    x = ndimage.gaussian_filter1d(RNG.normal(size=n), n / 9)
    return x / np.abs(x).max() * size * np.sin(np.linspace(0, np.pi, n)) ** 0.5


def ink(strokes, shape):
    """The strokes [(centerline, width at each point)] as a brush would leave them: stamped at
    4x, then the edge roughened a little, like the design's marks."""
    h, w = shape
    im = Image.new("L", (w * 4, h * 4), 0)
    draw = ImageDraw.Draw(im)
    for pts, widths in strokes:
        for (x, y), width in zip(pts, widths):
            r = width * 2
            draw.ellipse((x * 4 - r, y * 4 - r, x * 4 + r, y * 4 + r), fill=255)
    shape_ = np.array(im.resize((w, h), Image.BOX)) / 255
    rough = ndimage.gaussian_filter(RNG.normal(size=shape), 1.6)
    rough /= np.abs(rough).max()
    return ((ndimage.gaussian_filter(shape_, 0.8) + 0.2 * rough - 0.5) * 3 + 0.5).clip(0, 1) * (shape_ > 0.02)


def arrow(points, name, at, weight=25, duration=ARROW_TIME):
    """A brush arrow along points, in this box's pixels: starts as a hairline, swells as the hand
    speeds up, then two uneven barbs, one flicked in to the tip and one out of it."""
    shaft = curve(points)
    n = len(shaft)
    normal = np.gradient(shaft, axis=0)[:, ::-1] * [1, -1]
    normal /= np.hypot(*normal.T)[:, None]
    shaft = shaft + normal * wander(n, 8)[:, None]
    t = np.linspace(0, 1, n)
    swell = np.clip(t / 0.62, 0, 1) ** 1.3
    settle = 1 - 0.8 * np.clip((t - 0.8) / 0.2, 0, 1) ** 1.2  # thins into the tip, which stays a point
    widths = (5 + (weight - 5) * swell * settle) * (1 + wander(n, 0.2))
    back = shaft[-30] - shaft[-1]
    back /= np.hypot(*back)

    def barb(turn, length, bend):
        c, s = np.cos(np.radians(turn)), np.sin(np.radians(turn))
        way = np.array([back[0] * c - back[1] * s, back[0] * s + back[1] * c])
        side = np.array([-way[1], way[0]])
        tip = shaft[-1] - way * 3  # the barbs start just past the shaft's end, as a hand overshoots
        return curve([tip, tip + way * length * 0.55 + side * bend, tip + way * length])

    barbs = [barb(-31, 165, -9), barb(38, 125, 7)]
    barbs = [barbs[0][::-1], barbs[1]]  # one flicked in to the tip, one out of it
    # Thin at the tip, so the three meet in a point, fullest a third of the way out.
    fullest = lambda k: 3 + (weight * k - 3) * np.sin(np.pi * np.linspace(0, 1, 400) ** 0.62)
    barb_widths = [fullest(0.62)[::-1], fullest(0.54)]

    every = np.vstack([shaft, *barbs])
    left, top = (every.min(axis=0) - weight - PAD).astype(int)
    right, bottom = (every.max(axis=0) + weight + PAD).astype(int)
    origin = np.array([left, top])
    size = (int(bottom - top), int(right - left))
    drawn = [(shaft - origin, widths), (barbs[0] - origin, barb_widths[0]), (barbs[1] - origin, barb_widths[1])]
    a = ink(drawn, size)
    gray = save(a, (0, 0, size[1], size[0]), name)

    # The pen follows the same lines, wider than the ink. Most of the time goes on the shaft.
    times = [duration * 0.74, duration * 0.1, duration * 0.1]
    strokes, s = [], 0.0
    check = Image.new("L", (size[1], size[0]), 0)
    painter = ImageDraw.Draw(check)
    for (pts, w), dur in zip(drawn, times):
        width = int(w.max() * 1.3 + 12)
        points_ = pen.simplify([tuple(p) for p in pts], 0.6)
        painter.line(points_, fill=255, width=width, joint="curve")
        for x, y in (points_[0], points_[-1]):
            painter.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=255)
        strokes.append(["M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in points_), width, round(s, 3), round(dur, 3)])
        s += dur + LIFT
    missed = ((gray > 127) & (np.array(check) == 0)).sum() / (gray > 127).sum()
    assert missed < 0.002, f"{name}: the pen misses {missed:.2%}"
    print(f"{name}: {s - LIFT:.3f}s")
    return {"src": f"/{name}.png", "x": int(left), "y": int(top), "width": size[1], "height": size[0], "at": at, "strokes": strokes, "duration": round(s - LIFT, 3)}


def ring(a, name, shift, at, points, duration):
    """The design's ring around "Work": it runs behind the letters, so its centerline can't be
    found from what shows. The path is by hand, in its frame's pixels, in the order it's drawn."""
    b = box(a)
    gray = save(a, b, name)
    pts = curve(points, 300) - [b[0], b[1]]
    width = 50
    check = Image.new("L", gray.shape[::-1], 0)
    points_ = pen.simplify([tuple(p) for p in pts], 0.6)
    ImageDraw.Draw(check).line(points_, fill=255, width=width, joint="curve")
    for x, y in (points_[0], points_[-1]):
        ImageDraw.Draw(check).ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=255)
    shown = gray > 127
    missed = (shown & (np.array(check) == 0)).sum() / shown.sum()
    assert missed < 0.002, f"{name}: the pen misses {missed:.2%}"
    stroke = ["M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in points_), width, 0.0, duration]
    return {**layer(name, b, shift, at), "strokes": [stroke], "duration": duration}


def placed(text, red, top):
    """Where a design's frame goes so that all of it, marks too, is in the middle of the box with
    its topmost ink at top; and where its ink's left and bottom end up."""
    left, y, right, bottom = box(np.maximum(text, red))
    shift = (round(WIDTH / 2 - (left + right) / 2), top - (y + PAD))
    return shift, left + PAD + shift[0], bottom - PAD + shift[1]


# The statement's lowest ink (the circle round "has"), in this box's pixels: just above it. The
# gap from there to the first line here is the gap between the two lines here too.
src = (ROOT / "app/statement.ts").read_text()
statement = json.loads(src[src.index("= {\n") + 2 : src.rindex(";")])
inked = statement["lines"] + statement["marks"]
STATEMENT_BOTTOM = max(l["y"] + l["height"] for l in inked) - PAD - statement["height"]
# Its leftmost ink, where the page shows it: centered like these (app/scroll-text.tsx moves it).
left, right = min(l["x"] for l in inked) + PAD, max(l["x"] + l["width"] for l in inked) - PAD
STATEMENT_LEFT = left + WIDTH / 2 - (left + right) / 2
STATEMENT_RIGHT = right + WIDTH / 2 - (left + right) / 2
TEKST_2_TOP = 478
GAP = TEKST_2_TOP - STATEMENT_BOTTOM


def beat(layers, next_at):
    """A beat's box (what's watched to start it) and its layers placed inside that."""
    left = min(l["x"] for l in layers)
    top = min(l["y"] for l in layers)
    right = max(l["x"] + l["width"] for l in layers)
    bottom = max(l["y"] + l["height"] for l in layers)
    for l in layers:
        l["x"] -= left
        l["y"] -= top
    return {"x": left, "y": top, "width": right - left, "height": bottom - top, "next": round(next_at, 3), "layers": layers}


def handoff(start, layers):
    """When the next thing starts: this one's HANDOFF of the way through, from start to its last
    layer's end."""
    end = max(l["at"] + l.get("duration", LINE_TIME) for l in layers)
    return start + (end - start) * HANDOFF


# "But their Work Feels...": the arrow comes down from the end of the statement to the end of
# this line, "But their Work" rises, "Feels..." right after, and the pen rings "Work" last. One
# line: "Feels..." moved up beside "Work", on its baseline, a word space after it (as between
# "But" and "their"), so its F sits over the ring's right side, the ring running behind.
text, red = design("tekst_2")
RING = [(2407, 1154), (2320, 1158), (2250, 1148), (2205, 1120), (2178, 1080), (2187, 1045), (2219, 1016), (2279, 986),
        (2359, 961), (2449, 946), (2539, 941), (2619, 951), (2689, 971), (2744, 1006), (2767, 1046), (2757, 1086),
        (2724, 1131), (2669, 1171), (2599, 1199), (2519, 1213), (2439, 1216), (2369, 1211), (2309, 1201), (2281, 1191), (2276, 1181)]
cols = lambda a: np.nonzero((a > 0.5).any(axis=0))[0]
rows = lambda a: np.nonzero((a > 0.5).any(axis=1))[0]
first, feels = cut(text, bottom=1146), cut(text, top=1146)
text = first + np.roll(feels, (rows(first).max() - rows(feels).max(), cols(first).max() + 39 - cols(feels).min()), axis=(0, 1))
split = cols(first).max() + 20
shift, tekst_2_left, tekst_2_bottom = placed(text, red, TEKST_2_TOP)
tekst_2_right = cols(np.maximum(text, red)).max() + shift[0]
middle = (rows(first).min() + rows(first).max()) / 2 + shift[1]  # of the letters
tip = (tekst_2_right + 120, middle)  # a little short of its end
pointer = arrow([(3380, 14), (3392, 140), (3380, 300), (3285, 440), (3110, 545), (tip[0] + 120, tip[1] - 8), tip], "story-arrow-1", 0)
start = pointer["duration"] * HANDOFF
words = [
    ring(red, "story-ring", shift, start + 0.2, RING, 0.3),  # under the letters, so first in the stack
    line(cut(text, right=split), "story-2-line-1", shift, start),
    line(cut(text, left=split), "story-2-line-2", shift, start + 0.08),
]
second = beat([pointer, *words], handoff(start, words))

# "Alive! & Unique": the arrow again, from the start of the line above in one loose swing out to
# the left and round to the start of this one: "Alive", which rises, the pen flicks "!" and the
# underline, "&" rises, and the pen writes "Unique" to finish it.
text, red = design("tekst_3")
shift, tekst_3_left, _ = placed(text, red, tekst_2_bottom + GAP)
x, y = tekst_2_left - 85, middle + 40  # left of "But"
tip_x, tip_y = tekst_3_left - 182, 1079 + shift[1]  # as far off "Alive"'s middle as the first arrow's tip is off its line
# One cubic curve, so it bends all the way round like a hand's swing rather than going straight,
# turning and going straight again: it leaves heading out left and a little down, and comes
# into the tip from the left, just above.
t = np.linspace(0, 1, 14)[:, None]
ends = np.array([(x, y), (x - 560, y + 90), (tip_x - 720, tip_y - 10), (tip_x, tip_y)])
swing = (1 - t) ** 3 * ends[0] + 3 * (1 - t) ** 2 * t * ends[1] + 3 * (1 - t) * t**2 * ends[2] + t**3 * ends[3]
pointer = arrow([tuple(p) for p in swing], "story-arrow-2", 0, duration=0.42)
start = pointer["duration"] * HANDOFF
words = [
    line(cut(text, right=1965), "story-3-alive", shift, start),
    mark(cut(red, right=1995, bottom=1141), "story-3-bang", shift, start + 0.16, 9000),
    mark(cut(red, right=1995, top=1141), "story-3-underline", shift, start + 0.2, 14000),
    line(cut(text, left=1965), "story-3-and", shift, start + 0.26),
    mark(cut(red, left=1995), "story-3-unique", shift, start + 0.34, 14000, 0.012),
]
third = beat([pointer, *words], handoff(start, words))

# A check: neither arrow reaches past the statement's width.
for b in (second, third):
    a = b["layers"][0]
    ink = cols(np.array(Image.open(ROOT / f"public{a['src']}").getchannel("A")) / 255)
    left, right = b["x"] + a["x"] + ink.min(), b["x"] + a["x"] + ink.max() + 1
    assert STATEMENT_LEFT <= left and right <= STATEMENT_RIGHT, (a["src"], left, right, STATEMENT_LEFT, STATEMENT_RIGHT)
    print(a["src"], "ink", left, right, "statement", STATEMENT_LEFT, STATEMENT_RIGHT)

beats = [second, third]
height = max(b["y"] + b["height"] for b in beats)
OUT.write_text(
    "// Generated by scripts/story-layers.py. Don't edit; run it again after the designs change.\n"
    "// Pixels of the designs, a beat relative to the story's box and a layer relative to its beat,\n"
    "// in paint order. at, duration and next (when the next beat may start) in seconds from the\n"
    "// start of the beat. Mark strokes are\n"
    "// [path, pen width, start (s), duration (s)] in writing order, in the mark's own box.\n\n"
    "type Layer = { src: string; x: number; y: number; width: number; height: number; at: number };\n"
    "export type StoryMark = Layer & { strokes: [string, number, number, number][]; duration: number };\n"
    "type Beat = { x: number; y: number; width: number; height: number; next: number; layers: (Layer | StoryMark)[] };\n\n"
    "export const STORY: { width: number; height: number; beats: Beat[] } = "
    f"{json.dumps({'width': WIDTH, 'height': int(height), 'beats': beats}, indent=2)};\n"
)
print("story", WIDTH, height, [(b["x"], b["y"], b["width"], b["height"], b["next"]) for b in beats])
print("gaps", GAP, (tekst_2_bottom + GAP) - tekst_2_bottom, "statement bottom", STATEMENT_BOTTOM, "tekst_2", TEKST_2_TOP, tekst_2_bottom, "left", tekst_2_left)
for b in beats:
    print([(l["src"], l["at"], l.get("duration", LINE_TIME)) for l in b["layers"]])
