"""Tiny ASCII map drawing kit used to author the area grids (1 char = 2 m)."""
class Map:
    def __init__(s, w, h, fill=' '):
        s.w, s.h = w, h
        s.g = [[fill] * w for _ in range(h)]
    def fill(s, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < s.w and 0 <= y < s.h: s.g[y][x] = c
    def room(s, x0, y0, x1, y1, wall, floor):
        s.fill(x0, y0, x1, y1, wall); s.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor)
    def put(s, x, y, c): s.g[y][x] = c
    def hline(s, x0, x1, y, c): s.fill(x0, y, x1, y, c)
    def vline(s, x, y0, y1, c): s.fill(x, y0, x, y1, c)
    def rows(s): return [''.join(r) for r in s.g]
    def ts(s, name):
        return '  grid: [\n' + '\n'.join("    '" + r.replace("'", "\\'") + "'," for r in s.rows()) + '\n  ],'
