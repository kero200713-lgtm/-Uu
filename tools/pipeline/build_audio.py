"""Audio pipeline for UĞULTU.
Decodes source WAVs with ffmpeg, trims silence, applies fades, loudness-matches,
and assembles SFX into a single mono audio sprite (MP3) with a JSON map.
Ambience/music loops get a short crossfade so they loop without clicks.
Shipping sounds inside a sprite (not as standalone files) also respects the
Soundza licence ("no redistribution as standalone files").

usage: python3 -I build_audio.py <gen_dir> <cat_dir> <out_dir>
"""
import sys, os, json, subprocess
import numpy as np

SR = 44100
gen, cat, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)

def load(path, mono=True):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32).copy()
    return a if mono else a.reshape(-1, 2)

def trim(a, thr_db=-48, pad=0.01):
    thr = 10 ** (thr_db / 20)
    env = np.abs(a) if a.ndim == 1 else np.abs(a).max(1)
    idx = np.where(env > thr)[0]
    if len(idx) == 0: return a
    s = max(0, idx[0] - int(pad * SR)); e = min(len(a), idx[-1] + int(pad * 4 * SR))
    return a[s:e]

def fade(a, fin=0.004, fout=0.03):
    n_in, n_out = int(fin * SR), int(fout * SR)
    w = np.ones(len(a), np.float32)
    if n_in: w[:n_in] = np.linspace(0, 1, n_in)
    if n_out: w[-n_out:] = np.minimum(w[-n_out:], np.linspace(1, 0, n_out))
    return a * (w if a.ndim == 1 else w[:, None])

def norm(a, peak=0.89, rms=None):
    p = np.abs(a).max() + 1e-9
    g = peak / p
    if rms is not None:
        r = np.sqrt(np.mean(a ** 2)) + 1e-9
        g = min(g, rms / r)
    return a * g

def encode(a, path, br='96k', stereo=False):
    a = np.clip(a, -1, 1).astype(np.float32)
    ch = '2' if stereo else '1'
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', ch, '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, path]
    subprocess.run(cmd, input=a.tobytes(), check=True)

def crossfade_loop(a, xf=0.6):
    n = int(xf * SR)
    if len(a) < 3 * n: return a
    head, body, tail = a[:n], a[n:-n], a[-n:]
    t = np.linspace(0, 1, n, dtype=np.float32)
    if a.ndim == 2: t = t[:, None]
    mixed = tail * (1 - t) + head * t
    return np.concatenate([body, mixed])

# name -> (source, options)
G = lambda n: os.path.join(gen, n + '.wav')
Cc = lambda n: os.path.join(cat, n + '.wav')
SFX = {
    # player
    'p_hurt1': (G('player_hurt_1'), {}), 'p_hurt2': (G('player_hurt_2'), {}), 'p_death': (G('player_death'), {}),
    'p_breath': (G('breath'), {'peak': 0.6}),
    'st_concrete1': (G('step_concrete_1'), {'peak': 0.7}), 'st_concrete2': (G('step_concrete_2'), {'peak': 0.7}), 'st_concrete3': (G('step_concrete_3'), {'peak': 0.7}),
    'st_dirt1': (G('step_dirt_1'), {'peak': 0.7}), 'st_dirt2': (G('step_dirt_2'), {'peak': 0.7}), 'st_dirt3': (G('step_dirt_3'), {'peak': 0.7}),
    'st_wood1': (G('step_wood_1'), {'peak': 0.7}), 'st_wood2': (G('step_wood_2'), {'peak': 0.7}), 'st_wood3': (G('step_wood_3'), {'peak': 0.7}),
    'st_metal1': (G('step_metal_1'), {'peak': 0.7}), 'st_metal2': (G('step_metal_2'), {'peak': 0.7}), 'st_metal3': (G('step_metal_3'), {'peak': 0.7}),
    # weapons / combat
    'pistol1': (Cc('pistol_a'), {'max': 1.2}), 'pistol2': (Cc('pistol_b'), {'max': 1.2}), 'shotgun': (Cc('shotgun'), {'max': 1.5}),
    'shotgun_pump': (Cc('shotgun_reload'), {'start': 0.42, 'max': 0.8}), 'dry_fire': (G('dry_fire'), {}),
    'reload': (G('ammo_pickup'), {'peak': 0.8}),
    'swing1': (G('swing_1'), {}), 'swing2': (G('swing_2'), {}),
    'hit1': (G('flesh_hit_1'), {}), 'hit2': (G('flesh_hit_2'), {}), 'hit3': (G('flesh_hit_3'), {}),
    'impact1': (G('impact_wall_1'), {'peak': 0.7}), 'impact2': (G('impact_wall_2'), {'peak': 0.7}),
    'stab': (G('knife_stab'), {}), 'body_fall': (G('body_fall'), {}), 'flare': (G('flare'), {'peak': 0.8}),
    # creatures
    'z_call': (Cc('z_call'), {}), 'z_growl': (Cc('z_growl'), {}), 'z_attack': (Cc('z_attack'), {}), 'z_moan': (Cc('z_moan'), {}),
    'z_hurt': (Cc('z_hurt'), {}), 'husk_growl': (Cc('husk_growl'), {}), 'lurker_scream': (Cc('lurker_scream'), {}),
    'z_death': (Cc('creature_death'), {}), 'lis_click1': (G('listener_click_1'), {}), 'lis_click2': (G('listener_click_2'), {}),
    'choir_roar': (G('choir_roar'), {}),
    # world
    'door_creak': (Cc('door_creak'), {}), 'door_locked': (G('door_locked'), {}), 'door_metal': (G('door_metal'), {}),
    'door_unlock': (G('door_unlock'), {}), 'chain_gate': (G('chain_gate'), {}), 'generator': (G('generator'), {'peak': 0.8}),
    'elevator': (G('elevator'), {'peak': 0.8}), 'cassette': (G('cassette'), {}), 'radio_static': (G('radio_static'), {'peak': 0.6}),
    'thunder': (G('thunder'), {'peak': 0.8}), 'metal_far1': (G('metal_distant_1'), {}), 'metal_far2': (G('metal_distant_2'), {}),
    'house_creak': (G('house_creak'), {}), 'scream_far': (G('distant_scream'), {}), 'crow': (G('crow'), {}),
    'whispers': (G('whispers'), {}), 'bandage': (G('bandage'), {}), 'pickup_ammo': (G('ammo_pickup'), {'peak': 0.7}),
    'sting1': (G('sting_1'), {}), 'sting2': (G('sting_2'), {}),
}
LOOPS = {  # mono ambience loops
    'amb_rain': (G('rain'), 0.8), 'amb_hum': (G('hum_drone'), 1.2),
}
MUSIC = {  # stereo
    'mus_menu': (G('mus_menu'), False), 'mus_safe': (G('mus_safe'), True), 'mus_chase': (G('mus_chase'), True),
    'mus_boss': (G('mus_boss'), True), 'mus_ending': (G('mus_ending'), False),
}

gap = np.zeros(int(0.12 * SR), np.float32)
chunks, sprite = [], {}
pos = 0
for name, (src, o) in SFX.items():
    a = load(src)
    if 'start' in o: a = a[int(o['start'] * SR):]
    a = trim(a)
    if 'max' in o: a = a[:int(o['max'] * SR)]
    a = fade(norm(a, o.get('peak', 0.89)))
    sprite[name] = [round(pos / SR, 4), round(len(a) / SR, 4)]
    chunks += [a, gap]
    pos += len(a) + len(gap)
allsfx = np.concatenate(chunks)
encode(allsfx, os.path.join(out, 'sfx.mp3'), '96k')
for name, (src, xf) in LOOPS.items():
    a = norm(crossfade_loop(trim(load(src), -60), xf), 0.85)
    encode(a, os.path.join(out, f'{name}.mp3'), '80k')
for name, (src, loop) in MUSIC.items():
    a = load(src, mono=False)
    a = trim(a, -60)
    if loop: a = crossfade_loop(a, 0.25)
    else: a = fade(a, 0.01, 3.0)
    a = norm(a, 0.85)
    encode(a, os.path.join(out, f'{name}.mp3'), '112k', stereo=True)
json.dump({'sprite': sprite, 'loops': list(LOOPS), 'music': list(MUSIC)}, open(os.path.join(out, 'audio.json'), 'w'), indent=0)
print('sfx sprite', round(len(allsfx) / SR, 1), 's', len(sprite), 'sounds')
