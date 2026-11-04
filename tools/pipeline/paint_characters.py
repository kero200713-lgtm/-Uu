"""
Character texture painter for UĞULTU.

The free Quaternius "Universal Base Characters" bodies ship without clothing.
This tool rasterises each body mesh into UV space to obtain, for every texel,
its bind-pose 3D position, normal and dominant bone. With that we can paint
clothing, dirt, blood, wounds and the bioluminescent "Hum" infection
procedurally in 3D space (seamless across UV islands), on top of the original
CC0 skin textures.

Output per variant (in public/assets/textures/characters):
  <variant>_albedo.jpg    1024 sRGB colour
  <variant>_normal.jpg    1024 tangent-space normal (clothes flattened + fabric)
  <variant>_rough.jpg      512 roughness (grey)
  <variant>_glow.jpg       256 emissive mask (grey) - pulsed in shader

Usage: python3 -I paint_characters.py <ubc_work_dir> <out_dir>
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gltfmesh import Gltf

SIZE = 1024
rng_global = np.random.default_rng(7)

# ---------------------------------------------------------------- noise ----
def _hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144269504) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)

def vnoise(p, freq, seed=0):
    """3D value noise, p: (N,3) -> (N,) in [0,1]"""
    q = p * freq
    i = np.floor(q).astype(np.int64)
    f = q - i
    u = f * f * (3 - 2 * f)
    res = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                res = res + w * _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return res

def fbm(p, freq, octaves=4, seed=0):
    a, s, tot = 0.5, 0.0, 0.0
    for o in range(octaves):
        s = s + a * vnoise(p, freq * (2 ** o), seed + o * 17)
        tot += a
        a *= 0.5
    return s / tot

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

# ------------------------------------------------------------ rasterise ----
def rasterise(prim):
    P, N, UV, idx = prim['POSITION'], prim['NORMAL'], prim['TEXCOORD_0'], prim['indices']
    J, W = prim['JOINTS_0'].astype(np.int64), prim['WEIGHTS_0']
    names = prim['joint_names']
    dom = J[np.arange(len(J)), np.argmax(W, axis=1)]
    # one-hot-ish soft bone groups per vertex: hands / head
    def group_weight(pred):
        mask = np.array([1.0 if pred(n) else 0.0 for n in names], dtype=np.float32)
        return (W * mask[J]).sum(1)
    hand_w = group_weight(lambda n: n.startswith(('hand_', 'index', 'middle', 'pinky', 'ring', 'thumb')))
    head_w = group_weight(lambda n: n in ('Head',))
    pos = np.zeros((SIZE, SIZE, 3), np.float32)
    nrm = np.zeros((SIZE, SIZE, 3), np.float32)
    aux = np.zeros((SIZE, SIZE, 2), np.float32)
    cov = np.zeros((SIZE, SIZE), bool)
    uvp = UV * SIZE
    for t in idx:
        a, b, c = uvp[t[0]], uvp[t[1]], uvp[t[2]]
        x0 = int(max(0, math.floor(min(a[0], b[0], c[0]))));
        x1 = int(min(SIZE - 1, math.ceil(max(a[0], b[0], c[0]))))
        y0 = int(max(0, math.floor(min(a[1], b[1], c[1]))));
        y1 = int(min(SIZE - 1, math.ceil(max(a[1], b[1], c[1]))))
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9: continue
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        l2 = 1 - l0 - l1
        m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not m.any(): continue
        yy, xx = (ys[m] - 0.5).astype(int), (xs[m] - 0.5).astype(int)
        L = np.stack([l0[m], l1[m], l2[m]], 1)
        pos[yy, xx] = L @ P[t]
        nn = L @ N[t]
        nrm[yy, xx] = nn / (np.linalg.norm(nn, axis=1, keepdims=True) + 1e-8)
        aux[yy, xx, 0] = L @ hand_w[t]
        aux[yy, xx, 1] = L @ head_w[t]
        cov[yy, xx] = True
    # dilate to cover seams
    for _ in range(6):
        empty = ~cov
        if not empty.any(): break
        acc_p = np.zeros_like(pos); acc_n = np.zeros_like(nrm); acc_a = np.zeros_like(aux); cnt = np.zeros((SIZE, SIZE), np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sc = np.roll(np.roll(cov, dy, 0), dx, 1)
            acc_p += np.roll(np.roll(pos, dy, 0), dx, 1) * sc[..., None]
            acc_n += np.roll(np.roll(nrm, dy, 0), dx, 1) * sc[..., None]
            acc_a += np.roll(np.roll(aux, dy, 0), dx, 1) * sc[..., None]
            cnt += sc
        fill = empty & (cnt > 0)
        pos[fill] = acc_p[fill] / cnt[fill][:, None]
        nrm[fill] = acc_n[fill] / cnt[fill][:, None]
        aux[fill] = acc_a[fill] / cnt[fill][:, None]
        cov |= fill
    # glTF UV origin is top-left (v down) which matches image rows directly
    return pos, nrm, aux, cov

# --------------------------------------------------------------- regions ----
class Body:
    def __init__(self, prim, female):
        jp = prim['joint_pos']
        self.female = female
        self.y_pelvis = jp['pelvis'][1]
        self.y_spine1 = jp['spine_01'][1]
        self.y_neck = jp['neck_01'][1]
        self.y_head = jp['Head'][1]
        self.x_upper = jp['upperarm_l'][0]
        self.x_lower = jp['lowerarm_l'][0]
        self.x_hand = jp['hand_l'][0]
        self.y_calf = jp['calf_l'][1]
        self.y_arm = jp['upperarm_l'][1]
        self.y_foot = jp['foot_l'][1]

def masks(B, pos, aux):
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    ax = np.abs(x)
    hand = np.clip(aux[..., 0] * 1.6, 0, 1)
    head = np.clip(aux[..., 1] * 1.5, 0, 1)
    arm = smooth(B.x_upper - 0.07, B.x_upper + 0.02, ax) * (y > B.y_pelvis + 0.15)
    leg = (y < B.y_pelvis + 0.06).astype(np.float32)
    torso = (1 - arm) * (1 - leg) * (1 - head) * (y < B.y_neck + 0.02)
    return dict(x=x, y=y, z=z, ax=ax, hand=hand, head=head, arm=arm, leg=leg, torso=torso)

# ------------------------------------------------------------- painting ----
def lum(c):
    return (c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11)

def mix(a, b, t):
    t = t[..., None] if t.ndim == a.ndim - 1 else t
    return a * (1 - t) + b * t

def col(hexv):
    hexv = hexv.lstrip('#')
    return np.array([int(hexv[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)

def paint(variant, B, pos, nrm, aux, cov, skin_albedo, skin_normal, skin_rough):
    M = masks(B, pos, aux)
    P = pos.reshape(-1, 3)
    H, Wd = pos.shape[:2]
    def F(freq, oct=4, seed=0):
        return fbm(P, freq, oct, seed).reshape(H, Wd)
    x, y, z, ax = M['x'], M['y'], M['z'], M['ax']
    alb = skin_albedo.copy()
    rough = skin_rough.copy()
    nmap = skin_normal.copy()
    glow = np.zeros((H, Wd), np.float32)
    flat_n = np.array([0.5, 0.5, 1.0], np.float32)
    shade = np.clip(lum(skin_albedo) / (lum(skin_albedo).mean() + 1e-4), 0.55, 1.35)  # keep sculpt shading
    fab_fine = F(180, 3, 11)
    fab_mid = F(28, 4, 12)
    grime = F(9, 5, 13)
    clothes_total = np.zeros((H, Wd), np.float32)

    def apply_cloth(mask, base, rough_v, pattern=None, stretch=0.28):
        nonlocal alb, rough, nmap, clothes_total
        c = np.broadcast_to(base, alb.shape).copy() if base.ndim == 1 else base
        c = c * (0.82 + 0.3 * fab_mid[..., None]) * (0.92 + 0.12 * fab_fine[..., None])
        c = c * (shade[..., None] ** stretch)
        if pattern is not None:
            c = c * pattern[..., None] if pattern.ndim == 2 else c * pattern
        alb = mix(alb, c, mask)
        rough = mix(rough[..., None], np.full_like(rough[..., None], rough_v), mask)[..., 0]
        # flatten sculpt normals under fabric, add fabric bump
        fn = np.stack([0.5 + (fab_fine - 0.5) * 0.18, 0.5 + (F(170, 2, 31) - 0.5) * 0.18, np.ones_like(fab_fine)], -1)
        nmap = mix(nmap, mix(fn, nmap, np.full_like(mask, 0.08)), mask)
        clothes_total = np.maximum(clothes_total, mask)

    def scalp(color_hex, strength=1.0):
        """Paints the scalp under the hair mesh with hair colour so gaps between
        hair cards never show bare skin (the 'bald patch' look)."""
        nonlocal alb, rough, nmap
        head = smooth(0.35, 0.6, M['head'])
        # hairline: high on the forehead, low at the nape, blended around the sides
        # front hairline stays above the forehead (top of skull - 4 cm); the player's
        # geometric hair cap covers the same region, so no dark band shows below it
        y_top = float(np.max(np.where(head > 0.5, y, -1.0)))
        k = smooth(-0.03, 0.07, z)
        line = (B.y_head - 0.03) * (1 - k) + (y_top - 0.04) * k
        m = smooth(line, line + 0.02, y) * head * strength
        strands = 0.75 + 0.35 * fbm(P * np.array([90.0, 14.0, 90.0], np.float32), 1.0, 3, 91).reshape(H, Wd)
        base = col(color_hex)
        c = base[None, None, :] * strands[..., None]
        alb = mix(alb, c, np.clip(m, 0, 1))
        rough = mix(rough[..., None], np.full_like(rough[..., None], 0.7), m)[..., 0]
        nmap = mix(nmap, np.stack([0.5 + (strands - 1) * 0.3, np.full_like(strands, 0.5), np.ones_like(strands)], -1), m * 0.8)

    def dirt(amount, low_bias=1.0):
        nonlocal alb, rough
        g = smooth(0.45, 0.8, grime) * amount
        g = g + smooth(0.55, 0.0, y) * 0.55 * low_bias * amount
        g = np.clip(g, 0, 0.85)
        alb = mix(alb, alb * np.array([0.42, 0.36, 0.3], np.float32), g)

    def blood(mask, amount):
        nonlocal alb, rough
        b = smooth(0.52, 0.7, F(14, 4, 41)) * mask * amount
        dark = np.array([0.22, 0.02, 0.02], np.float32)
        alb = mix(alb, dark * (0.6 + 0.6 * F(60, 2, 42))[..., None], np.clip(b, 0, 1))
        rough = mix(rough[..., None], np.full_like(rough[..., None], 0.28), np.clip(b, 0, 1))[..., 0]

    def zombie_skin(tone, sat, rot):
        nonlocal alb
        l = lum(alb)[..., None]
        grey = np.concatenate([l, l, l], -1)
        a = mix(alb, grey, np.full(alb.shape[:2], sat, np.float32))
        a = a * tone
        mottle = F(6, 4, 51)
        bruise = smooth(0.55, 0.75, mottle) * rot
        a = mix(a, a * np.array([0.55, 0.42, 0.55], np.float32), bruise)
        veins = 1 - np.abs(F(22, 3, 52) - 0.5) * 2
        vmask = smooth(0.86, 0.97, veins) * rot * (1 - M['hand'] * 0.5)
        a = mix(a, np.array([0.12, 0.13, 0.16], np.float32) * l * 2, vmask * 0.8)
        alb = a

    def hum_growth(regions, intensity, seed=61):
        """bioluminescent gill-like infection patches"""
        nonlocal alb, rough, glow, nmap
        n = F(16, 4, seed)
        ridges = 0.5 + 0.5 * np.sin(F(40, 2, seed + 1) * 30.0)
        g = smooth(0.58, 0.74, n) * regions
        g2 = g * (0.55 + 0.45 * ridges)
        flesh = np.array([0.55, 0.62, 0.54], np.float32)
        alb = mix(alb, flesh * (0.6 + 0.5 * ridges[..., None]), np.clip(g2 * 0.9, 0, 1))
        rough = mix(rough[..., None], np.full_like(rough[..., None], 0.22), g)[..., 0]
        glow = np.maximum(glow, np.clip(g2 * intensity, 0, 1))
        bump = np.stack([0.5 + (ridges - 0.5) * 0.35 * g, 0.5 + (n - 0.5) * 0.3 * g, np.ones_like(n)], -1)
        nmap = mix(nmap, bump, g * 0.7)

    neck_back = smooth(B.y_neck - 0.25, B.y_neck - 0.05, y) * smooth(B.y_head + 0.2, B.y_head + 0.05, y)
    ears = np.exp(-(((ax - 0.075) / 0.03) ** 2 + ((y - (B.y_head + 0.08)) / 0.05) ** 2 + ((z + 0.0) / 0.06) ** 2))
    spine_line = np.exp(-((x / 0.05) ** 2)) * (z < -0.02) * smooth(B.y_pelvis, B.y_spine1 + 0.1, y)
    pants = M['leg'] * (y > B.y_foot + 0.12)
    boots = (y < B.y_foot + 0.16).astype(np.float32) * M['leg']
    front = (z > 0.0).astype(np.float32)

    if variant == 'player':
        # Ela: waxed-canvas field jacket, cargo pants, leather boots, fingerless gloves look
        sleeve_end = smooth(B.x_hand - 0.03, B.x_hand - 0.06, ax)
        jacket = np.clip(M['torso'] + M['arm'] * sleeve_end, 0, 1) * (1 - M['head']) * (y > B.y_pelvis - 0.06)
        jacket *= (1 - M['hand'])
        collar_cut = smooth(B.y_neck + 0.03, B.y_neck - 0.02, y)
        jacket *= collar_cut
        jc = col('#3f4a37')
        zipper = np.exp(-((x / 0.006) ** 2)) * front * (y > B.y_pelvis) * (y < B.y_neck)
        pockets = ((np.abs(ax - 0.09) < 0.055) & (np.abs(y - (B.y_pelvis + 0.12)) < 0.05) & (z > 0.02)).astype(np.float32)
        seam = 1 - 0.35 * (np.abs(((ax - 0.09) / 0.055)) > 0.92) * pockets - 0.3 * np.clip(pockets * (np.abs((y - (B.y_pelvis + 0.12)) / 0.05) > 0.9), 0, 1)
        cuff = smooth(B.x_hand - 0.07, B.x_hand - 0.05, ax) * M['arm']
        pattern = seam * (1 - zipper * 0.6) * (1 - cuff * 0.25)
        apply_cloth(jacket, jc, 0.78, pattern)
        alb = mix(alb, np.array([0.55, 0.5, 0.42], np.float32), zipper * jacket * 0.6)
        # pants
        pc = col('#2a3446')
        knee = np.exp(-(((y - B.y_calf - 0.02) / 0.04) ** 2)) * front
        apply_cloth(np.clip(pants * (1 - jacket * 0.0), 0, 1), pc, 0.85, 1 - 0.18 * knee)
        belt = M['leg'] * smooth(B.y_pelvis + 0.02, B.y_pelvis + 0.035, y) * smooth(B.y_pelvis + 0.09, B.y_pelvis + 0.07, y)
        apply_cloth(belt, col('#1b1410'), 0.5)
        apply_cloth(boots, col('#4a3020'), 0.55, 1 - 0.25 * smooth(B.y_foot - 0.04, B.y_foot - 0.07, y))
        # scarf / collar band at the neck
        scarf = smooth(B.y_neck - 0.06, B.y_neck - 0.02, y) * smooth(B.y_neck + 0.07, B.y_neck + 0.03, y) * (1 - M['head'] * 0.5) * smooth(0.13, 0.09, ax) * (1 - M['arm'])
        apply_cloth(scarf, col('#3b4a44'), 0.9)
        # gloves (fingerless) on palm area
        glove = M['hand'] * smooth(B.x_hand + 0.07, B.x_hand + 0.05, ax)
        apply_cloth(glove, col('#1c1a18'), 0.6)
        # face: slightly tired, a little grime
        dirt(0.35, 0.8)
        alb = mix(alb, alb * 0.92, M['head'] * smooth(0.6, 0.8, F(30, 3, 70)) * 0.4)
        scalp('#2a1a10')
    else:
        if variant in ('hollow_miner', 'hollow_town', 'husk', 'listener'):
            zombie_skin(np.array([0.78, 0.82, 0.76], np.float32), 0.72 if variant != 'listener' else 0.9, 1.0)
        else:
            zombie_skin(np.array([0.82, 0.84, 0.8], np.float32), 0.7, 0.9)
        tears = smooth(0.62, 0.7, F(7, 4, 81))   # holes in clothing
        if variant == 'hollow_miner':
            jacket = np.clip(M['torso'] + M['arm'] * smooth(B.x_lower + 0.05, B.x_lower - 0.02, ax), 0, 1) * (1 - M['head']) * (y > B.y_pelvis - 0.06)
            cover = np.clip(jacket + pants, 0, 1) * (1 - tears)
            stripes = (np.abs(y - (B.y_spine1 + 0.12)) < 0.022) | (np.abs(y - (B.y_calf - 0.12)) < 0.022)
            base = col('#1f2c44')
            apply_cloth(cover, base, 0.88, 1 + 2.4 * stripes.astype(np.float32) * np.array([1.0])[0])
            alb = mix(alb, col('#c46a1c') * (0.7 + 0.3 * fab_mid[..., None]), stripes.astype(np.float32) * cover * 0.85)
            apply_cloth(boots, col('#151515'), 0.6)
            dirt(1.0, 1.2)
            alb = mix(alb, alb * 0.35, smooth(0.5, 0.75, F(5, 3, 90)) * clothes_total * 0.6)  # coal dust
            hum_growth(np.clip(neck_back + ears * 1.5 + spine_line * 0.6, 0, 1), 0.9)
            blood(M['head'] * (y < B.y_head + 0.02) * front + jacket * 0.4, 0.9)
        elif variant == 'hollow_town':
            shirt = np.clip(M['torso'] + M['arm'] * smooth(B.x_lower + 0.08, B.x_lower + 0.02, ax), 0, 1) * (1 - M['head']) * (y > B.y_pelvis - 0.04)
            check = ((np.floor(x * 18 + 100) + np.floor(y * 18)) % 2).astype(np.float32)
            lines = ((np.abs(((x * 18) % 1) - 0.5) < 0.12) | (np.abs(((y * 18) % 1) - 0.5) < 0.12)).astype(np.float32)
            plaid = 0.75 + 0.2 * check + 0.25 * lines
            apply_cloth(shirt * (1 - tears), col('#5a2420'), 0.9, plaid)
            apply_cloth(pants * (1 - tears * 0.6), col('#2f3b4f'), 0.85)
            apply_cloth(boots, col('#2a2420'), 0.6)
            dirt(0.9)
            scalp('#3e3833', 0.9)
            hum_growth(np.clip(neck_back + ears * 1.5, 0, 1), 0.85, 64)
            blood(np.clip(shirt * front + M['head'] * front * (y < B.y_head), 0, 1), 1.0)
        elif variant == 'hollow_nurse':
            top = np.clip(M['torso'] + M['arm'] * smooth(B.x_upper + 0.12, B.x_upper + 0.06, ax), 0, 1) * (1 - M['head']) * (y > B.y_pelvis - 0.05)
            apply_cloth(top * (1 - tears * 0.8), col('#7fa3a0'), 0.8)
            apply_cloth(pants * (1 - tears * 0.5), col('#6f918f'), 0.82)
            apply_cloth(boots, col('#bdbdb5'), 0.6)
            dirt(0.7)
            scalp('#231a14')
            hum_growth(np.clip(neck_back + ears * 1.5 + spine_line * 0.3, 0, 1), 0.9, 66)
            blood(np.clip(top * 0.7 + M['hand'] + M['head'] * front * (y < B.y_head), 0, 1), 1.1)
        elif variant == 'lurker':
            gown = np.clip(M['torso'] + M['arm'] * smooth(B.x_upper + 0.1, B.x_upper + 0.04, ax), 0, 1) * (1 - M['head'])
            gown = np.clip(gown + M['leg'] * (y > B.y_calf + 0.08), 0, 1)
            dots = (((np.floor(x * 40 + 100) + np.floor(y * 40)) % 3) == 0).astype(np.float32) * 0.08
            apply_cloth(gown * (1 - tears * 0.9), col('#9aa3a6'), 0.9, 1 - dots)
            dirt(0.8)
            scalp('#17120e')
            alb = alb * 0.88
            hum_growth(np.clip(neck_back + ears * 2 + spine_line + M['arm'] * 0.25, 0, 1), 1.0, 67)
            blood(np.clip(gown * 0.5 + M['hand'] + M['head'] * front, 0, 1), 1.1)
        elif variant == 'husk':
            apply_cloth(pants * (1 - tears * 0.7), col('#3b3a33'), 0.9)
            apply_cloth(boots, col('#151515'), 0.6)
            dirt(1.1, 1.2)
            sacs = np.clip(M['torso'] * 1.0 + M['arm'] * 0.6 + neck_back + ears, 0, 1)
            hum_growth(sacs, 1.0, 68)
            hum_growth(np.clip(M['torso'] * front, 0, 1), 0.8, 69)
            blood(np.clip(M['torso'] * front + M['hand'], 0, 1), 0.8)
        elif variant == 'listener':
            alb = alb * np.array([0.7, 0.72, 0.7], np.float32)
            hum_growth(np.clip(M['torso'] + M['arm'] + neck_back + M['head'] + M['leg'] * 0.5, 0, 1), 1.0, 71)
            hum_growth(np.clip(spine_line * 2 + neck_back * 2, 0, 1), 1.0, 72)
            dirt(0.9)
            blood(np.clip(M['hand'] + M['head'] * front, 0, 1), 1.0)
        # milky eyes are handled by the eye material at runtime
    alb = np.clip(alb, 0, 1)
    rough = np.clip(rough, 0.05, 1)
    return alb, nmap, rough, glow

def to_img(a, mode='RGB'):
    a = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(a, mode if a.ndim == 3 else 'L')

def main():
    work, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    only = set(sys.argv[3:])
    bodies = {
        'female': ('Superhero_Female_FullBody.gltf', 'Superhero_Female', 'T_Superhero_Female_Light_BaseColor.png', 'T_Superhero_Female_Normal.png', 'T_Superhero_Female_Roughness.png'),
        'male': ('Superhero_Male_FullBody.gltf', 'SuperHero_Male', 'T_Superhero_Male_Ligh.png', 'T_Superhero_Male_Normal.png', 'T_Superhero_Male_Roughness.png'),
    }
    variants = {
        'female': ['player', 'hollow_nurse', 'lurker'],
        'male': ['hollow_miner', 'hollow_town', 'husk', 'listener'],
    }
    for sex, (gf, node, ta, tn, tr) in bodies.items():
        vs = [v for v in variants[sex] if not only or v in only]
        if not vs: continue
        g = Gltf(os.path.join(work, gf))
        prim = g.primitive(node)
        print('rasterising', sex, flush=True)
        pos, nrm, aux, cov = rasterise(prim)
        B = Body(prim, sex == 'female')
        sa = np.asarray(Image.open(os.path.join(work, ta)).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255
        sn = np.asarray(Image.open(os.path.join(work, tn)).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255
        sr_img = Image.open(os.path.join(work, tr)).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        sr = np.asarray(sr_img, np.float32)[..., 1] / 255  # glTF roughness = G
        for v in vs:
            print('  painting', v, flush=True)
            alb, nmap, rough, glow = paint(v, B, pos, nrm, aux, cov, sa, sn, sr)
            to_img(alb).save(os.path.join(out, f'{v}_albedo.jpg'), quality=88, optimize=True)
            to_img(nmap).resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, f'{v}_normal.jpg'), quality=90, optimize=True)
            to_img(rough).resize((512, 512), Image.LANCZOS).save(os.path.join(out, f'{v}_rough.jpg'), quality=88, optimize=True)
            gimg = to_img(glow).resize((256, 256), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
            gimg.save(os.path.join(out, f'{v}_glow.jpg'), quality=90, optimize=True)

if __name__ == '__main__':
    main()
