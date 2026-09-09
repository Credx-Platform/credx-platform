#!/usr/bin/env python3
"""Grade the hero backdrop subjects into the credX favicon's material language.

The favicon/logo is a studio render: silver-white extruded body, chrome-cyan
faceted accent, key light from upper left, soft vignette on charcoal. This script
pushes the four hero subjects onto that same ramp so the backdrop reads as one
lit set instead of four stock photos that merely share a blue tint.

Two things change versus the earlier black-matte JPEG pipeline:

  * Output is RGBA PNG, not a black matte. The hero backdrop is no longer flat
    black — it gains the favicon's charcoal studio wash — so `mix-blend-mode:
    screen` would wash the subjects out. Real alpha lets them composite normally
    and take a CSS drop-shadow for the contact shadow the favicon has.
  * Alpha is keyed off luminance for the three renders that were generated on
    black, which is exactly the matte the screen blend was faking, but now usable
    over a non-black backdrop. The merch shot was shot on white, so it gets a
    border flood fill instead.

Usage:
    python3 scripts/style-hero-layers.py          # rebuilds all four
    python3 scripts/style-hero-layers.py car cash # rebuilds a subset

Pure PIL on purpose: this box has no numpy, and the flood fill is fast enough at
product-shot resolution.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DEST_DIR = ROOT / 'apps/web/public/images/hero'
GEN = Path('/home/ubuntu/.openclaw/media/tool-image-generation')
INBOX = Path('/home/ubuntu/.openclaw/media/inbound')

MAX_EDGE = 900
PALETTE_COLORS = 256

# Sampled off favicon.png / images/credx-logo-1.jpg: deep slate shadow, chrome
# cyan through the mids, and a hot silver-white specular — the "cred" body and
# the faceted "X" are the two ends of this same ramp. Note how much of the ramp
# is spent above mid: the favicon is silver-first with cyan as the accent, so a
# blue-dominant ramp reads as "tinted photo" rather than as the logo's material.
RAMP = [
    (0.00, (10, 17, 28)),
    (0.20, (30, 74, 116)),
    (0.42, (72, 154, 205)),
    (0.62, (150, 205, 238)),
    (0.80, (208, 231, 245)),
    (1.00, (255, 255, 255)),
]
# <1 lifts the subject into the silver end of the ramp. The source renders are
# night shots; without this they land in the bottom quarter and stay navy.
GLOSS_GAMMA = 0.62
# Percentiles the masked subject is stretched across before grading, so four
# differently-exposed sources arrive at the ramp on the same footing.
STRETCH_LO_PCT, STRETCH_HI_PCT = 2.0, 98.0

# Luminance window the alpha ramps across. Below LO is backdrop, above HI is
# solid subject; between them is the soft edge the renders already have.
ALPHA_LO, ALPHA_HI = 0.035, 0.20
# A pixel joins the white sweep only if every channel is this bright. The darkest
# thing in the sweep is the soft contact shadow, which stays above it.
WHITE_MIN = 216

SUBJECTS = {
    'house': (GEN / 'hero-house-v2---e31add8b-c6ad-413c-90f5-817101182c8d.png', 'luma'),
    'car':   (GEN / 'hero-car-v2---eb455d1d-bb3d-49c4-b7d2-be43b21297bf.png', 'luma'),
    'cash':  (GEN / 'hero-cash-v2---470fadcf-653c-449c-93d2-be60f484b451.png', 'luma'),
    'merch': (INBOX / '7b120ba2-fc80-4dc8-a76b-b61bae5ae0e6.jpg', 'white'),
}


def ramp_lut():
    lut_r, lut_g, lut_b = [], [], []
    for i in range(256):
        t = (i / 255) ** GLOSS_GAMMA
        for (t0, c0), (t1, c1) in zip(RAMP, RAMP[1:]):
            if t <= t1 or t1 == 1.0:
                span = t1 - t0
                k = 0.0 if span == 0 else (t - t0) / span
                k = min(1.0, max(0.0, k))
                lut_r.append(round(c0[0] + (c1[0] - c0[0]) * k))
                lut_g.append(round(c0[1] + (c1[1] - c0[1]) * k))
                lut_b.append(round(c0[2] + (c1[2] - c0[2]) * k))
                break
    return lut_r + lut_g + lut_b


def white_sweep_alpha(im):
    """Alpha for a subject shot on a white studio sweep.

    Flood filled from the border rather than thresholded globally, so the white
    'credX' wordmarks printed on the garments stay opaque — they are enclosed by
    dark fabric and never reachable from outside.
    """
    w, h = im.size
    px = im.load()
    alpha = Image.new('L', (w, h), 255)
    ap = alpha.load()

    def is_white(x, y):
        r, g, b = px[x, y]
        return r >= WHITE_MIN and g >= WHITE_MIN and b >= WHITE_MIN

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_white(x, y):
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_white(x, y):
                seen[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        ap[x, y] = 0
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_white(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    # Feather the cut so the edge does not alias against the hero backdrop.
    return alpha.filter(ImageFilter.GaussianBlur(0.8))


def luma_alpha(im):
    """Alpha from luminance: the black the render was generated on becomes air."""
    lut = []
    for i in range(256):
        t = (i / 255 - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)
        t = min(1.0, max(0.0, t))
        # smoothstep, so the edge rolls off instead of banding at the threshold
        lut.append(round(255 * t * t * (3 - 2 * t)))
    return im.convert('L').point(lut).filter(ImageFilter.GaussianBlur(0.5))


def stretch_lut(gray, mask):
    """Linear stretch between the subject's own 2nd and 98th percentile.

    Measured through the alpha mask, so the black surround of the night renders
    does not drag the low percentile down to zero and flatten the stretch.
    """
    hist = gray.histogram(mask)
    total = sum(hist)
    if not total:
        return list(range(256))
    lo_target, hi_target = total * STRETCH_LO_PCT / 100, total * STRETCH_HI_PCT / 100
    lo, hi, run = 0, 255, 0
    for i, n in enumerate(hist):
        run += n
        if run <= lo_target:
            lo = i
        if run <= hi_target:
            hi = i
    if hi <= lo:
        return list(range(256))
    return [min(255, max(0, round((i - lo) * 255 / (hi - lo)))) for i in range(256)]


def build(slug, src, key):
    im = Image.open(src).convert('RGB')
    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

    alpha = white_sweep_alpha(im) if key == 'white' else luma_alpha(im)

    gray = im.convert('L')
    gray = gray.point(stretch_lut(gray, alpha.point(lambda v: 255 if v > 16 else 0)))
    graded = gray.convert('RGB').point(ramp_lut())
    # A touch of local contrast reads as specular gloss on the graded surface.
    graded = ImageEnhance.Contrast(graded).enhance(1.08)
    graded.putalpha(alpha)

    dest = DEST_DIR / f'hero-{slug}.png'
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    graded.quantize(colors=PALETTE_COLORS, method=Image.FASTOCTREE).save(dest, 'PNG', optimize=True)
    print(f'{slug:6s} -> {dest.name} {dest.stat().st_size // 1024} KB ({graded.width}x{graded.height})')


def main() -> int:
    wanted = sys.argv[1:] or list(SUBJECTS)
    for slug in wanted:
        if slug not in SUBJECTS:
            print(f'error: unknown subject {slug!r}; known: {", ".join(SUBJECTS)}')
            return 1
        src, key = SUBJECTS[slug]
        if not src.is_file():
            print(f'error: missing source for {slug}: {src}')
            return 1
        build(slug, src, key)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
