"""App icon + splash generator (Pillow only). Draws the UĞULTU mark — concentric
resonance rings around a noisy waveform — at any resolution and writes every
icon/splash slot of the web build, the Android project and the iOS project.

    python3 tools/pipeline/make_icons.py
"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BG = (6, 8, 10)
TEAL = (95, 232, 208)


def mark(size, bg=True, scale=1.0):
    """Renders the mark at `size` px (4x supersampled). scale shrinks it for safe zones."""
    S = size * 4
    img = Image.new('RGBA', (S, S), BG + (255,) if bg else (0, 0, 0, 0))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d, g = ImageDraw.Draw(img), ImageDraw.Draw(glow)
    c = S / 2
    rings = [(0.40, 0.012, 0.32), (0.30, 0.012, 0.45), (0.19, 0.014, 0.85)]
    for r, w, a in rings:
        R, W = r * S * scale, max(2, w * S * scale)
        col = tuple(int(v * a + b * (1 - a)) for v, b in zip(TEAL, BG)) + (255,)
        d.ellipse([c - R, c - R, c + R, c + R], outline=col, width=int(W))
        g.ellipse([c - R, c - R, c + R, c + R], outline=TEAL + (int(110 * a),), width=int(W * 3))
    # waveform: quiet at the edges, loud and jagged inside the inner ring
    rnd = random.Random(7)
    pts = []
    x0, x1 = c - 0.40 * S * scale, c + 0.40 * S * scale
    n = 400
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        u = (x - c) / (0.19 * S * scale)
        env = math.exp(-u * u * 1.4) * 0.11 + 0.012 * math.exp(-u * u * 0.15)
        y = c + math.sin(t * math.pi * 26) * env * S * scale + (rnd.random() - 0.5) * 0.006 * S * scale
        pts.append((x, y))
    lw = max(2, int(0.011 * S * scale))
    g.line(pts, fill=(220, 245, 240, 160), width=lw * 4, joint='curve')
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.012))
    img = Image.alpha_composite(img, glow)
    ImageDraw.Draw(img).line(pts, fill=(226, 238, 236, 255), width=lw, joint='curve')
    return img.resize((size, size), Image.LANCZOS)


def save(img, rel, rgb=False):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    (img.convert('RGB') if rgb else img).save(p, optimize=True)
    print('wrote', rel, img.size)


def splash(w, h, rel):
    im = Image.new('RGB', (w, h), BG)
    m = mark(int(min(w, h) * 0.42))
    im.paste(m, ((w - m.width) // 2, (h - m.height) // 2), m)
    save(im, rel, rgb=True)


def main():
    big = mark(1024)
    # web / PWA
    save(mark(192), 'public/icons/icon-192.png')
    save(mark(512), 'public/icons/icon-512.png')
    save(mark(512, scale=0.78), 'public/icons/icon-maskable-512.png')
    # iOS: a single 1024 px icon without alpha
    save(big, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', rgb=True)
    for f in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
        splash(2732, 2732, f'ios/App/App/Assets.xcassets/Splash.imageset/{f}')
    # Android launcher icons (legacy square/round + adaptive foreground on 108dp with a 66dp safe zone)
    res = 'android/app/src/main/res'
    for dpi, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        save(mark(px), f'{res}/mipmap-{dpi}/ic_launcher.png')
        r = mark(px)
        mask = Image.new('L', r.size, 0); ImageDraw.Draw(mask).ellipse([0, 0, px - 1, px - 1], fill=255)
        r.putalpha(mask)
        save(r, f'{res}/mipmap-{dpi}/ic_launcher_round.png')
        save(mark(int(px * 108 / 48), bg=False, scale=0.62), f'{res}/mipmap-{dpi}/ic_launcher_foreground.png')
    with open(os.path.join(ROOT, res, 'values/ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#06080A</color>\n</resources>\n')
    # Android splash (pre-Android 12 launch theme)
    for d, (w, h) in {'drawable': (480, 320), 'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
                      'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280), 'drawable-port-mdpi': (320, 480),
                      'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600),
                      'drawable-port-xxxhdpi': (1280, 1920)}.items():
        splash(w, h, f'{res}/{d}/splash.png')


if __name__ == '__main__':
    main()
