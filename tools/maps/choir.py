import sys, math; sys.path.insert(0, 'tools/maps')
from mapkit import Map
m = Map(32, 36, 'R')
cx, cy, R = 16, 15, 12.5
for y in range(36):
    for x in range(32):
        d = math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05)
        wob = 1.2 * math.sin(x * 0.9) * math.cos(y * 0.7)
        if d < R + wob: m.put(x, y, 'r')
# entry tunnel from the south (shaft)
m.fill(14, 26, 17, 34, 'r'); m.fill(13, 31, 18, 34, 'r')
# console alcove (north)
m.fill(13, 1, 18, 4, 'r')
# rock pillars for cover
for (px, py) in [(8, 10), (23, 9), (9, 20), (22, 20), (16, 23), (12, 6), (20, 6)]:
    m.fill(px, py, px + 1, py, 'R')
print(m.ts('choir'))
