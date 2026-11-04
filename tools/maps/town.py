import sys; sys.path.insert(0, 'tools/maps')
from mapkit import Map
m = Map(40, 40, 'T')
# open town ground
m.fill(1, 1, 38, 38, ';')
# perimeter fence (quarantine) with rubble
m.hline(0, 39, 0, 'F'); m.hline(0, 39, 39, 'F'); m.vline(0, 0, 39, 'F'); m.vline(39, 0, 39, 'F')
# main street N-S and square
m.fill(17, 1, 21, 38, '_'); m.fill(18, 1, 20, 38, '=')
m.fill(11, 15, 28, 23, '_')            # square
m.fill(15, 17, 24, 21, '|')            # inner square paving (road texture w/ markings looks like a plaza)
# side streets E-W
m.fill(1, 25, 16, 26, '='); m.fill(22, 25, 38, 26, '=')
# --- west buildings
m.room(2, 3, 11, 11, 'B', 'w')          # post office
m.put(11, 7, 'D'); m.put(4, 3, 'v'); m.put(8, 3, 'v')     # front door east
m.room(2, 14, 11, 22, 'B', 'k')         # grocery (bakkal)
m.put(11, 18, 'D'); m.put(11, 16, 'v'); m.put(11, 20, 'v'); m.put(6, 14, 'v')
m.room(2, 28, 12, 37, 'B', 'w')         # Demir family house
m.hline(3, 11, 32, 'Y'); m.put(6, 32, 'D'); m.put(10, 32, 'D')               # interior wall + doors
m.vline(7, 33, 36, 'Y'); m.put(7, 35, 'D')
m.put(12, 30, 'D'); m.put(12, 34, 'v'); m.put(4, 37, 'v'); m.put(9, 28, 'v')
# --- east buildings
m.room(27, 28, 37, 37, 'C', 'c')        # gendarmerie station
m.hline(28, 36, 32, 'P'); m.put(30, 32, 'D'); m.put(34, 32, 'D')
m.vline(32, 33, 36, 'P'); m.put(32, 34, 'D')
m.put(27, 30, 'D'); m.put(27, 35, 'v'); m.put(37, 30, 'D')                   # front door west, back door east
m.room(27, 3, 37, 12, 'B', 'c')         # hardware store (nalbur)
m.vline(32, 4, 11, 'P'); m.put(32, 8, 'D')
m.put(27, 7, 'D'); m.put(27, 5, 'v'); m.put(27, 10, 'v'); m.put(37, 9, 'D')   # front (jammed) + back door east
# east back alley behind buildings (between x=38 and fence)
m.fill(38, 6, 38, 33, ',')
m.fill(28, 14, 37, 26, ';')             # yard between station and hardware (fenced)
m.hline(27, 37, 14, 'F')
m.vline(26, 14, 24, 'F')
# close the yard/alley off from the east street: only via the station back door
m.vline(27, 24, 27, 'F'); m.put(26, 24, 'F')
# clinic gate north
m.fill(16, 0, 22, 0, 'F'); m.put(19, 0, 'G')
# forest gate south
m.put(19, 39, 'G')
# rubble / barricades
m.fill(23, 34, 24, 35, 'X'); m.fill(13, 9, 14, 10, 'X'); m.put(15, 36, 'X')
print(m.ts('town'))
