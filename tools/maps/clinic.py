import sys; sys.path.insert(0, 'tools/maps')
from mapkit import Map
m = Map(30, 27, ' ')
m.room(0, 0, 29, 25, 'C', 't')
# corridors
m.fill(1, 12, 28, 13, 't')                      # main E-W corridor (2 tiles)
# --- south: lobby + rooms
m.vline(9, 14, 24, 'P'); m.vline(20, 14, 24, 'P'); m.hline(1, 28, 14, 'P')
m.put(14, 14, 'D'); m.put(15, 14, 't')          # lobby opens to corridor (one door + open)
m.put(15, 14, 'D')
m.put(14, 25, 'D')                              # front entrance (exit to town)
m.put(11, 25, 'v'); m.put(18, 25, 'v')
# west south: pharmacy (x1-8, y15-19) + storeroom (x1-8, y21-24)
m.hline(1, 8, 20, 'P'); m.put(9, 17, 'D'); m.put(5, 20, 'D')
m.fill(1, 15, 8, 19, 'k'); m.fill(1, 21, 8, 24, 'c')
# east south: staff lounge (safe room, x21-28, y15-19) + nurse station (x21-28, y21-24)
m.hline(21, 28, 20, 'P'); m.put(20, 17, 'D'); m.put(20, 22, 'D'); m.fill(21, 15, 28, 19, 'w')
# --- north side: rooms above corridor (y1-10), wall at y=11
m.hline(1, 28, 11, 'P')
for x in [6, 12, 17, 23]: m.vline(x, 1, 10, 'P')
# rooms: [1-5] doctor office, [7-11] patient A, [13-16] central hall to back, [18-22] patient B, [24-28] morgue
m.put(3, 11, 'D'); m.put(9, 11, 'D'); m.put(20, 11, 'D'); m.put(26, 11, 'D')
m.fill(13, 1, 16, 11, 't'); m.put(14, 11, 't'); m.put(15, 11, 't')   # open central hall
m.fill(24, 1, 28, 10, 'c')                                            # morgue concrete
m.fill(1, 1, 5, 10, 'w')                                              # doctor office wood
# back corridor north of central hall leads to the back door
m.put(14, 0, 'S')                                                     # back door (exit to mine)
m.put(2, 0, 'v'); m.put(9, 0, 'v'); m.put(20, 0, 'v')
m.put(0, 4, 'v'); m.put(29, 17, 'v'); m.put(0, 17, 'v')
# patient room internal partitions / beds handled by props
print(m.ts('clinic'))
