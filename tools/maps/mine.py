import sys; sys.path.insert(0, 'tools/maps')
from mapkit import Map
m = Map(44, 40, 'T')
m.fill(1, 1, 42, 38, 'g')                       # gravel yard
m.hline(0, 43, 0, 'F'); m.hline(0, 43, 39, 'F'); m.vline(0, 0, 39, 'F'); m.vline(43, 0, 39, 'F')
# muddy road from the clinic path (south-west) to the yard
m.fill(2, 30, 5, 38, ','); m.fill(4, 26, 20, 31, ','); m.fill(16, 14, 21, 27, ',')
m.put(3, 39, 'G')                                 # entry gate from clinic path
# --- admin building (west): x 3-14, y 8-20
m.room(3, 8, 14, 20, 'B', 'c')
m.hline(4, 13, 14, 'P'); m.put(7, 14, 'D'); m.vline(9, 9, 13, 'P'); m.put(9, 11, 'D')
m.put(14, 17, 'D'); m.put(14, 11, 'v'); m.put(6, 8, 'v'); m.put(3, 17, 'v')
m.fill(10, 9, 13, 13, 'w')                        # foreman office (wood floor)
# --- garage (east-south): x 28-41, y 24-36, wide gate on the west side
m.room(28, 24, 41, 36, 'N', 'c')
m.put(28, 29, 'G'); m.put(28, 30, 'G'); m.put(41, 30, 'v'); m.put(34, 36, 'v')
# --- generator shed (north-center): x 18-25, y 3-9
m.room(18, 3, 25, 9, 'N', 'c'); m.put(21, 9, 'D'); m.put(25, 6, 'v')
# --- headframe / lift house (north-east): x 31-40, y 2-11
m.room(31, 2, 40, 11, 'M', 'm'); m.put(31, 7, 'S'); m.put(35, 11, 'v')
# coal piles + rubble
m.fill(22, 14, 25, 17, 'X'); m.fill(9, 24, 11, 25, 'X'); m.fill(36, 15, 39, 17, 'X'); m.fill(26, 34, 26, 36, 'X')
# rail / grating strip along the conveyor
m.fill(26, 12, 30, 13, 'x')
print(m.ts('mine'))
