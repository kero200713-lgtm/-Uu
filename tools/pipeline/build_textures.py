"""Converts selected ambientCG (CC0) 1K materials into mobile-sized textures.
albedo (AO pre-multiplied) 1024/512 JPG, normal (OpenGL) 512 JPG, roughness 256 JPG.
usage: python3 -I build_textures.py <acg_dir> <out_dir>"""
import sys, os, glob
from PIL import Image, ImageChops
SEL = {
  'ground_forest': ('Ground023', 1024), 'ground_mud': ('Ground106', 1024), 'ground_grass': ('Ground078', 1024),
  'asphalt': ('Asphalt031', 1024), 'road': ('Road007', 1024), 'concrete': ('Concrete012', 1024),
  'concrete_light': ('Concrete046', 512), 'plaster': ('PaintedPlaster006', 1024), 'tiles_white': ('Tiles107', 512),
  'tiles_check': ('Tiles074', 512), 'ceiling': ('OfficeCeiling001', 512), 'wood_floor': ('WoodFloor043', 1024),
  'planks': ('Planks037A', 1024), 'bricks': ('Bricks105', 1024), 'roof': ('RoofingTiles013A', 512),
  'metal_floor': ('DiamondPlate008C', 1024), 'metal_rust': ('MetalWalkway014', 512), 'metal_painted': ('Metal053B', 1024),
  'metal_green': ('PaintedMetal006', 512), 'rock': ('Rock058', 1024), 'gravel': ('Gravel023', 1024), 'wallpaper': ('Wallpaper001A', 512),
}
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for name, (aid, size) in SEL.items():
    d = os.path.join(src, aid)
    def f(suffix):
        g = glob.glob(os.path.join(d, f'*_{suffix}.jpg'))
        return g[0] if g else None
    col = Image.open(f('Color')).convert('RGB').resize((size, size), Image.LANCZOS)
    ao = f('AmbientOcclusion')
    if ao:
        a = Image.open(ao).convert('L').resize((size, size), Image.LANCZOS)
        a = a.point(lambda v: int(255 - (255 - v) * 0.6))
        col = ImageChops.multiply(col, Image.merge('RGB', (a, a, a)))
    col.save(os.path.join(out, f'{name}_c.jpg'), quality=80, optimize=True, progressive=True)
    Image.open(f('NormalGL')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(out, f'{name}_n.jpg'), quality=86, optimize=True)
    Image.open(f('Roughness')).convert('L').resize((256, 256), Image.LANCZOS).save(os.path.join(out, f'{name}_r.jpg'), quality=85, optimize=True)
    print(name, aid)
