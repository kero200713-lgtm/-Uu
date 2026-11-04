import sys; sys.path.insert(0, 'tools/maps')
from mapkit import Map
m = Map(36, 30, ' ')
m.room(0, 0, 35, 29, 'M', 'm')
# central block walls (x 12-31, y 4-19) + ring corridor around it
m.fill(12, 4, 31, 19, 'M')
m.room(12, 4, 21, 12, 'M', 'm')      # Lab A (acoustic chamber)
m.room(21, 4, 31, 12, 'M', 'm')      # server room
m.room(12, 12, 21, 19, 'M', 'm')     # dormitory (safe room)
m.room(21, 12, 31, 19, 'N', 'c')     # Kemal's lab
m.put(16, 4, 'S'); m.put(26, 4, 'S'); m.put(12, 15, 'S'); m.put(26, 19, 'S')
# west wing: shaft room (x1-8, y1-9), storage (x1-8, y11-16), lift ante-room (x1-8, y18-28)
m.room(0, 0, 9, 10, 'M', 'q'); m.put(9, 5, 'S')                 # drill shaft room (rock/gravel floor)
m.room(0, 10, 9, 17, 'M', 'm'); m.put(9, 14, 'S')               # storage
m.room(0, 17, 9, 29, 'M', 'm'); m.put(9, 21, 'S')               # lift + security checkpoint
# south wing below the ring: lower corridor already part of ring (y 20-21); fill south block rooms
m.room(9, 22, 35, 29, 'M', 'm')
m.vline(22, 23, 28, 'M'); m.put(16, 22, 'S'); m.put(28, 22, 'S')  # two south rooms: hydroponics/records (x10-21), generator room (x23-34)
# windows / observation glass (sight but no passage)
m.put(21, 8, 'v'); m.put(17, 12, 'v')
print(m.ts('facility'))
