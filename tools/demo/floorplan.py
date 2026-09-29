"""Draws the demo house. Laid out with the driveway on top, then turned half a circle so it ends up
at the bottom.

    python3 tools/demo/floorplan.py <resources>/floorplans/downstairs.svg
"""

import sys
from pathlib import Path

T = 8  # wall thickness
H = T / 2

# The vehicle from resources/floorplans/downstairs-bli.svg, nose up, as drawn there.
CAR_PATH = "m 381.5,350.3 -3.1,-14.1 c 13.5,-17.1 44.2,-15.9 57.6,0 l -3.9,14.1 c -17.1,-4.3 -34,-3.9 -50.6,0 z m -7.1,-38.1 c 1.1,12.1 0.6,26.6 0,41.8 -0.5,14.1 -1.1,28.9 -0.4,43 v 0 c 0,6.4 0.1,11.6 1.7,16.1 1.6,4.4 4.6,8.3 10.7,12 6.1,3.8 14.9,5.6 23.5,5.2 8.1,-0.4 16,-2.9 21.1,-7.5 8.7,-7.8 8.6,-13.8 8.6,-23.7 v -2 c 1.3,-17.1 0.7,-32.9 0.1,-48.4 -0.5,-12 -0.9,-23.8 -0.4,-35.8 0.6,-15.5 -6.9,-25 -17,-29.4 -4.8,-2.1 -10.2,-3 -15.6,-2.8 -5.4,0.2 -10.8,1.4 -15.6,3.7 -10.4,4.8 -18,14.4 -16.7,27.8 z m -2.4,41.7 c 0.2,-5.2 0.4,-10.4 0.5,-15.3 -0.1,0 -0.1,0.1 -0.2,0.2 -0.9,1.1 -0.5,2.5 -1,3.7 -0.1,0.3 -0.2,0.5 -0.4,0.7 -0.3,0.3 -0.9,0.5 -1.6,0.7 -1.8,0.4 -7.3,1 -8.6,0.5 -0.8,-0.3 -1.1,-1.3 -0.7,-2.6 0.6,-1.8 1.7,-2.8 3.2,-3.7 2.5,-1.5 5.5,-2 9.4,-2 0.2,-8.5 0.1,-16.5 -0.6,-23.6 -1.4,-14.7 6.9,-25.1 18.2,-30.4 5.1,-2.4 10.9,-3.7 16.6,-3.9 5.8,-0.2 11.5,0.8 16.7,3 11,4.7 19.2,15.1 18.6,31.8 -0.3,7.7 -0.2,15.4 0,23.2 3.8,0.1 6.8,0.5 9.3,2 1.5,0.9 2.5,1.900 3.2,3.7 0.4,1.3 0.1,2.2 -0.7,2.6 -1.4,0.6 -6.9,-0.1 -8.6,-0.5 -0.8,-0.2 -1.4,-0.4 -1.6,-0.7 -0.2,-0.2 -0.3,-0.4 -0.4,-0.7 -0.5,-1.2 -0.1,-2.5 -1,-3.7 0.1,3.2 0.2,6.5 0.4,9.8 0.6,15.6 1.2,31.5 -0.1,48.7 v 1.9 c 0,10.7 0.1,17.1 -9.5,25.6 -5.6,5.1 -14.1,7.7 -22.7,8.200 -9.1,0.5 -18.5,-1.5 -25,-5.6 -6.6,-4.1 -10,-8.4 -11.7,-13.4 -1.7,-4.9 -1.8,-10.3 -1.8,-16.9 -1,-14.3 -0.4,-29.2 0.1,-43.3 z m 5,30.7 c -1.7,-10.1 -1.4,-25.8 0.6,-35.9 3.8,14.2 2.9,22.2 -0.6,35.9 z m 60.3,0 c 1.7,-10.1 1.4,-25.8 -0.6,-35.9 -3.8,14.2 -2.9,22.2 0.6,35.9 z M 415,284.7 c 5.4,2 10,4.7 13.7,8.3 3.7,3.6 6.5,8 8.1,13.5 0.1,0.2 -0.1,0.5 -0.3,0.6 -0.1,0 -0.3,0 -0.4,-0.1 -4.3,-3.2 -9.1,-7.3 -13.3,-11.5 -3.5,-3.5 -6.6,-7.1 -8.4,-10.2 -0.1,-0.2 0,-0.5 0.2,-0.6 0.2,0 0.3,0 0.4,0 z m -30.9,9.5 c 3.7,-3.6 8.4,-6.3 13.7,-8.3 0.2,-0.1 0.5,0 0.6,0.2 v 0.4 c -1.8,3.1 -4.9,6.7 -8.4,10.2 -4.2,4.1 -9,8.3 -13.3,11.5 -0.1,0.1 -0.2,0.1 -0.4,0.1 -0.2,-0.1 -0.4,-0.3 -0.3,-0.6 1.6,-5.4 4.4,-9.9 8.1,-13.5 z m -2.3,100.4 2.5,-7.2 c 16,2.5 32.7,2.3 46,0 l 2.3,6.8 c -18,8.6 -32,9.5 -50.8,0.4 z"
CAR_CENTRE = (411, 358.5)

# The driveway, sized for the car with room either side.
DRIVE = (40, -60, 190, 146)
TOP = DRIVE[1] - 6
WIDTH = 520
BOTTOM = 710


def hwall(y, x0, x1, gaps=()):
    out, x = [], x0
    for g0, g1 in sorted(gaps):
        out.append((x, g0))
        x = g1
    out.append((x, x1))
    return "".join(f'<rect x="{a - H}" y="{y - H}" width="{b - a + T}" height="{T}" />' for a, b in out if b > a)


def vwall(x, y0, y1, gaps=()):
    out, y = [], y0
    for g0, g1 in sorted(gaps):
        out.append((y, g0))
        y = g1
    out.append((y, y1))
    return "".join(f'<rect x="{x - H}" y="{a - H}" width="{T}" height="{b - a + T}" />' for a, b in out if b > a)


walls = (
    hwall(150, 30, 490, [(55, 175), (300, 400)])
    + hwall(650, 30, 490, [(80, 140), (300, 390)])
    + vwall(30, 150, 650, [(520, 590)])
    + vwall(490, 150, 650, [(200, 300), (440, 560)])
    + vwall(200, 150, 650, [(260, 300), (560, 620)])
    + hwall(370, 30, 490, [(90, 140), (250, 430)])
    + hwall(450, 30, 200, [(110, 160)])
)


def light(entity, x0, y0, x1, y1):
    return f'<rect id="{entity}" x="{x0 + H}" y="{y0 + H}" width="{x1 - x0 - T}" height="{y1 - y0 - T}" />'


def window(name, entity, x, y, w, h):
    return (
        f'<rect id="{name}-window" x="{x}" y="{y}" width="{w}" height="{h}" style="fill:#1b1b1b;stroke:#666666" />'
        + (f'<rect id="{entity}" x="{x}" y="{y}" width="{w}" height="{h}" />' if entity else "")
    )


dx0, dy0, dx1, dy1 = DRIVE
drive_cx, drive_cy = (dx0 + dx1) / 2, (dy0 + dy1) / 2
car_cx, car_cy = CAR_CENTRE
turn_cx, turn_cy = WIDTH / 2, (TOP + BOTTOM) / 2

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {TOP} {WIDTH} {BOTTOM - TOP}" width="{WIDTH}" height="{BOTTOM - TOP}">
<g transform="rotate(180 {turn_cx} {turn_cy})">
  <!-- Driveway and the deck, outside -->
  <rect id="driveway" x="{dx0}" y="{dy0}" width="{dx1 - dx0}" height="{dy1 - dy0}" style="fill:#181818" />
  <g id="lr-deck"><rect x="230" y="654" width="240" height="52" />
    <path d="M230 667 H470 M230 680 H470 M230 693 H470" /></g>

  <!-- Room lights, under everything else -->
  {light("light.example_garage", 30, 150, 200, 370)}
  {light("light.example_kitchen", 200, 150, 490, 370)}
  {light("light.example_living_room", 200, 370, 490, 650)}
  {light("light.example_laundry", 30, 370, 200, 450)}
  {light("light.example_hallway", 30, 450, 200, 650)}

  <!-- Furniture -->
  <g class="object">
    <path d="M208 158 H430 V184 H234 V250 H208 Z" />
    <rect x="290" y="250" width="110" height="44" rx="3" />
    <rect x="44" y="200" width="16" height="140" />
    <rect x="100" y="380" width="36" height="36" rx="3" />
    <rect x="224" y="440" width="40" height="150" rx="8" />
    <rect x="264" y="440" width="10" height="150" rx="3" style="opacity:0.6" />
    <rect x="474" y="580" width="10" height="60" />
    <rect x="310" y="598" width="100" height="36" rx="18" style="opacity:0.7" />
  </g>
  <g id="hall-stair" style="fill:none">
    <path d="M150 470 H192 M150 485 H192 M150 500 H192 M150 515 H192 M150 530 H192 M150 545 H192 M150 560 H192 M150 575 H192 M150 470 V590 M192 470 V590" />
  </g>

  <!-- Walls -->
  <g id="walls">{walls}</g>

  <!-- Windows -->
  {window("ki", "binary_sensor.example_kitchen_window", 300, 147, 100, 6)}
  {window("lr", "binary_sensor.example_living_room_window", 487, 440, 6, 120)}
  {window("lr-east", "", 487, 200, 6, 100)}
  {window("hw", "", 27, 520, 6, 70)}
  {window("deck", "", 300, 647, 90, 6)}

  <!-- Doors: the closed leaf in the wall, and the swing drawn when it is open -->
  <g id="binary_sensor.example_front_door" type="exterior" orientation="horizontal">
    <rect id="closed-front" x="80" y="646" width="60" height="8" style="fill:#777777" />
    <path id="open-front" d="M80 650 V592 A58 58 0 0 1 138 650 Z" style="fill-opacity:0.35" />
  </g>
  <g id="binary_sensor.example_garage_door" type="exterior" orientation="horizontal">
    <rect id="closed-garage" x="55" y="146" width="120" height="8" style="fill:#777777" />
    <rect id="open-garage" x="55" y="154" width="120" height="30" style="fill-opacity:0.35" />
  </g>

  <!-- Things that report in -->
  <g id="switch.example_living_room_fan" transform="translate(360 500)">
    <rect x="-34" y="-34" width="68" height="68" />
    <circle r="6" />
    <path d="M0 -6 C-6 -16 -4 -30 0 -32 C4 -30 6 -16 0 -6 Z" />
    <path d="M0 -6 C-6 -16 -4 -30 0 -32 C4 -30 6 -16 0 -6 Z" transform="rotate(120)" />
    <path d="M0 -6 C-6 -16 -4 -30 0 -32 C4 -30 6 -16 0 -6 Z" transform="rotate(240)" />
  </g>
  <g id="binary_sensor.example_washer" type="appliance">
    <rect x="50" y="380" width="36" height="36" rx="3" />
    <circle cx="68" cy="398" r="11" style="fill:#e0e0e0;opacity:0.8" />
  </g>
  <circle id="binary_sensor.example_hallway_motion" cx="100" cy="530" r="9" />
  <rect id="sensor.example_bin" type="bin" x="202" y="96" width="24" height="30" rx="3" />
  <g id="binary_sensor.example_driveway_occupied">
    <path style="fill-rule:evenodd" transform="translate({drive_cx} {drive_cy}) rotate(180) translate({-car_cx} {-car_cy})" d="{CAR_PATH}" />
  </g>
</g>
</svg>
'''

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(svg)
print(f"wrote {out}")
