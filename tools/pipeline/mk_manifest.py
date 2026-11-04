"""Generates the prop-pack manifests (which source model goes into which pack,
with real-world scale normalisation and colour grading).
usage: python3 -I mk_manifest.py <download_dir> <out_models_dir>"""
import json, os, glob, sys

D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/dl'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'public/assets/models'
packs = {}


def add(pack, name, src, **o):
    packs.setdefault(pack, []).append([name, src, o] if o else [name, src])


NAT_SCALE = {'Pine': 4.6, 'CommonTree_Dead': 4.2, 'BirchTree_Dead': 4.4, 'Willow_Dead': 4.0, 'CommonTree_': 4.2, 'Grass': 0.45,
             'Plant': 0.55, 'Bush': 0.9, 'Rock_Moss': 1.0, 'Rock_': 1.0, 'TreeStump': 1.0, 'WoodLog': 0.8}


def nat_scale(n):
    for k, v in NAT_SCALE.items():
        if n.startswith(k):
            return v
    return 1.0


for f in sorted(glob.glob(f'{D}/glb_raw/nature/*.glb')):
    n = os.path.basename(f)[:-4]
    o = {'scale': nat_scale(n)}
    if n.startswith('Grass') or n.startswith('Plant'):
        o.update(desat=0.45, tint=[0.55, 0.6, 0.45])
    elif 'Pine' in n or (n.startswith('CommonTree_') and 'Dead' not in n):
        o.update(desat=0.35, tint=[0.5, 0.58, 0.52])
    elif 'Bush' in n:
        o.update(desat=0.4, tint=[0.55, 0.6, 0.5])
    else:
        o.update(desat=0.25, tint=[0.8, 0.8, 0.78])
    add('nature', n, f, **o)
for f in sorted(glob.glob(f'{D}/glb_raw/interior/*.glb')):
    add('interior', os.path.basename(f)[:-4], f, desat=0.3, tint=[0.85, 0.83, 0.8], scale=0.5)
for f in sorted(glob.glob(f'{D}/glb_raw/scifi/*.glb')):
    add('facility', os.path.basename(f)[:-4], f, desat=0.35, tint=[0.8, 0.82, 0.85], scale=0.8)
FIT = {'Axe': 0.75, 'Axe_Small': 0.45, 'Backpack': 0.55, 'Bandages': 0.11, 'Battery_Big': 0.1, 'Battery_Small': 0.07, 'BearTrap_Open': 0.5,
       'Bonfire': 1.2, 'Can_Closed': 0.13, 'Can_Red': 0.13, 'FirstAidKit': 0.38, 'FirstAidKit_Hard': 0.38, 'FlareGun': 0.24, 'GasCan': 0.5,
       'Knife': 0.22, 'Matchbox': 0.07, 'Phone': 0.14, 'Pistol_1': 0.22, 'Pot': 0.32, 'PropaneTank': 0.65, 'Radio': 0.34, 'Revolver_1': 0.26,
       'Shotgun_1': 1.0, 'Shovel': 1.1, 'Tent': 3.2, 'Torch': 0.26, 'Trashcan': 0.9, 'WaterBottle_1': 0.26, 'WoodLog': 1.0}
for f in sorted(glob.glob(f'{D}/glb_raw/survival/*.glb')):
    n = os.path.basename(f)[:-4]
    o = {'desat': 0.1}
    if n in FIT:
        o['fit'] = FIT[n]
    add('items', n, f, **o)
for n, fit in [('Pistol', 0.22), ('Shotgun', 1.0), ('Knife', 0.25), ('Axe', 0.75)]:
    add('items', 'W_' + n, f'{D}/zak_glb/{n}.glb', desat=0.35, tint=[0.8, 0.8, 0.8], fit=fit)
for n in ['Barrel', 'Blood_1', 'Blood_2', 'Blood_3', 'CinderBlock', 'Container_Green', 'Container_Red', 'Couch', 'FireHydrant', 'Pallet',
          'Pallet_Broken', 'Pipes', 'PlasticBarrier', 'StreetLights', 'TownSign', 'TrafficBarrier_1', 'TrafficBarrier_2', 'TrafficCone_1',
          'TrashBag_1', 'TrashBag_2', 'WaterTower', 'Wheel', 'Wheels_Stack', 'Chest']:
    add('urban', n, f'{D}/zak_glb/{n}.glb', desat=0.45, tint=[0.75, 0.74, 0.72])
for n in ['Vehicle_Pickup', 'Vehicle_Sports', 'Vehicle_Truck']:
    add('urban', n, f'{D}/zak_glb/{n}.glb', desat=0.5, tint=[0.7, 0.7, 0.7])
json.dump({'out': OUT, 'packs': packs, 'simplify': {}}, open(f'{D}/props_manifest_in.json', 'w'), indent=1)
lod = [e for e in packs['nature'] if any(k in e[0] for k in ['Pine', 'CommonTree', 'Birch', 'Willow', 'Rock_', 'Bush'])]
json.dump({'out': OUT, 'packs': {'nature_lod': lod}, 'simplify': {'nature_lod': 0.22}}, open(f'{D}/lod_manifest.json', 'w'))
print({k: len(v) for k, v in packs.items()})
