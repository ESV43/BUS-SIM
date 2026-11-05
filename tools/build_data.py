#!/usr/bin/env python3
"""Build the data bundle for the IISER Thiruvananthapuram 3D campus model.

Sources (2026 refresh):
  - OpenStreetMap (buildings, roads, water, pitches, parking, boundary) - ODbL
  - Esri World Imagery (ground texture) - attribution in the app
  - AWS Terrain Tiles / Mapzen terrarium (elevation) - CC-BY

Run tools/fetch_sources.py first to refresh the source tiles and OSM extract.
"""
import base64, json, math, os, random, io, re, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, box
from shapely.ops import unary_union
import xml.etree.ElementTree as ET
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('IISERT_SRC', '/tmp/opencode/iisert'))
OUT = ROOT / 'data'
OUT.mkdir(exist_ok=True)
FETCH_DATE = time.strftime('%Y-%m-%d')

# --- web mercator mosaic geometry -------------------------------------------------
Z = 18
TX0, TY0 = 187231, 124719
NX, NY = 13, 12
TS = 256
MW, MH = NX * TS, NY * TS
R_EARTH = 6378137.0
WORLD = (2 ** Z) * TS

gx_c = TX0 * TS + MW / 2.0
gy_c = TY0 * TS + MH / 2.0
lon_c = gx_c / WORLD * 360.0 - 180.0
lat_c = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * gy_c / WORLD))))
MPP = math.cos(math.radians(lat_c)) * 2 * math.pi * R_EARTH / WORLD
GW = MW * MPP
GH = MH * MPP

def proj(lon, lat):
    gx = (lon + 180.0) / 360.0 * WORLD
    lat_r = math.radians(lat)
    gy = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * WORLD
    return ((gx - gx_c) * MPP, (gy - gy_c) * MPP)

def unproj(x, z):
    gx = x / MPP + gx_c
    gy = z / MPP + gy_c
    lon = gx / WORLD * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * gy / WORLD))))
    return lon, lat

# --- elevation (terrarium z15) ----------------------------------------------------
TZ = 15
TX15, TY15 = 23403, 15589
terr = Image.new('RGB', (3 * 256, 3 * 256))
for yy in range(3):
    for xx in range(3):
        p = SRC / 'terr_z15' / f'{TX15 + xx}_{TY15 + yy}.png'
        if p.exists():
            terr.paste(Image.open(p).convert('RGB'), (xx * 256, yy * 256))
ta = np.asarray(terr).astype(np.float32)
DEM = ta[:, :, 0] * 256.0 + ta[:, :, 1] + ta[:, :, 2] / 256.0 - 32768.0

def elev_grid(xs, zs):
    """Bicubic sample of the terrarium DEM at projected scene coordinates."""
    scale = 2 ** (Z - TZ)
    u = ((np.asarray(xs, dtype=np.float64) / MPP + gx_c) / scale) - TX15 * 256.0
    v = ((np.asarray(zs, dtype=np.float64) / MPP + gy_c) / scale) - TY15 * 256.0
    return map_coordinates(DEM, [v, u], order=3, mode='nearest', prefilter=True)

# --- OSM --------------------------------------------------------------------------
print('parsing OSM...')
osm_timestamp = ''
osm_json = SRC / 'campus-2026.osm.json'
if osm_json.exists():
    raw = json.loads(osm_json.read_text())
    osm_timestamp = raw.get('osm3s', {}).get('timestamp_osm_base', '')
    nodes = {}
    for el in raw.get('elements', []):
        if el.get('type') == 'node':
            nodes[str(el['id'])] = (float(el['lon']), float(el['lat']))
    ways = []
    for el in raw.get('elements', []):
        if el.get('type') != 'way':
            continue
        refs = [str(r) for r in el.get('nodes', [])]
        if len(refs) < 2 or any(r not in nodes for r in refs):
            continue
        pts = [proj(*nodes[r]) for r in refs]
        ways.append((str(el['id']), el.get('tags', {}), pts))
else:
    osm = ET.parse(SRC / 'campus.osm').getroot()
    nodes = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in osm.findall('node')}
    ways = []
    for w in osm.findall('way'):
        tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
        refs = [nd.get('ref') for nd in w.findall('nd')]
        if any(r not in nodes for r in refs):
            continue
        pts = [proj(*nodes[r]) for r in refs]
        ways.append((str(w.get('id')), tags, pts))
print('osm ways:', len(ways), 'snapshot:', osm_timestamp or 'unknown')

def clean_ring(pts):
    ring = list(pts)
    if len(ring) > 1 and abs(ring[0][0] - ring[-1][0]) < 1e-6 and abs(ring[0][1] - ring[-1][1]) < 1e-6:
        ring = ring[:-1]
    # remove consecutive duplicates
    out = []
    for p in ring:
        if not out or (abs(p[0] - out[-1][0]) > 1e-4 or abs(p[1] - out[-1][1]) > 1e-4):
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-4 and abs(out[0][1] - out[-1][1]) < 1e-4:
        out.pop()
    return out

def clean_line(pts):
    """Remove consecutive duplicate vertices from an open polyline."""
    out = []
    for p in pts:
        if not out or (abs(p[0] - out[-1][0]) > 1e-4 or abs(p[1] - out[-1][1]) > 1e-4):
            out.append((float(p[0]), float(p[1])))
    return out

def clip_line(pts, pad=10.0):
    """Clip a polyline to the ground texture extent."""
    if len(pts) < 2:
        return []
    clip = LineString(pts).intersection(box(-GW / 2 + pad, -GH / 2 + pad,
                                            GW / 2 - pad, GH / 2 - pad))
    if clip.is_empty:
        return []
    if clip.geom_type == 'LineString':
        return [list(clip.coords)]
    if clip.geom_type == 'MultiLineString':
        return [list(g.coords) for g in clip.geoms]
    return []

def resample_line(pts, step=2.5):
    """Resample a polyline at roughly equal spacing, keeping both endpoints."""
    pts = clean_line(pts)
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    for i in range(len(pts) - 1):
        x0, z0 = pts[i]; x1, z1 = pts[i + 1]
        seg = math.hypot(x1 - x0, z1 - z0)
        if seg < 1e-6:
            continue
        n = max(1, int(math.ceil(seg / step)))
        for k in range(1, n + 1):
            t = k / n
            p = (x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
            if abs(p[0] - out[-1][0]) > 1e-4 or abs(p[1] - out[-1][1]) > 1e-4:
                out.append(p)
    if abs(out[-1][0] - pts[-1][0]) > 1e-4 or abs(out[-1][1] - pts[-1][1]) > 1e-4:
        out.append(pts[-1])
    return out

def smooth_profile(vals, window=3):
    if len(vals) <= 2 or window <= 1:
        return vals
    half = window // 2
    out = []
    for i in range(len(vals)):
        a = max(0, i - half); b = min(len(vals), i + half + 1)
        out.append(sum(vals[a:b]) / (b - a))
    return out

ROAD_WIDTH = {
    'motorway': 11.0, 'trunk': 10.0, 'primary': 9.0, 'secondary': 8.0,
    'tertiary': 7.0, 'unclassified': 5.6, 'residential': 5.2,
    'living_street': 5.0, 'service': 3.6, 'track': 3.0,
    'footway': 1.8, 'path': 1.5, 'steps': 1.8, 'pedestrian': 3.0,
    'cycleway': 2.0, 'bridleway': 2.0,
}
ROAD_LIFT = {
    'primary': 0.19, 'secondary': 0.18, 'tertiary': 0.17,
    'unclassified': 0.15, 'residential': 0.14, 'living_street': 0.13,
    'service': 0.11, 'track': 0.09, 'footway': 0.07, 'path': 0.07,
    'steps': 0.08, 'pedestrian': 0.09, 'cycleway': 0.08, 'bridleway': 0.08,
}

def road_width(tags, hw):
    w = tags.get('width')
    if w:
        m = re.match(r'\s*([0-9]+(?:\.[0-9]+)?)', w)
        if m:
            val = float(m.group(1))
            if 1.0 <= val <= 30.0:
                return val
    lanes = tags.get('lanes')
    if lanes:
        try:
            n = int(float(lanes.split(';')[0]))
            if 1 <= n <= 8:
                return max(ROAD_WIDTH.get(hw, 4.0), n * 3.25 + 0.8)
        except Exception:
            pass
    return ROAD_WIDTH.get(hw, 4.0)

def road_surface(tags, hw):
    s = (tags.get('surface') or '').lower()
    if s in ('asphalt', 'chipseal', 'tarmac'):
        return 'asphalt'
    if s in ('concrete', 'concrete:plates', 'cement'):
        return 'concrete'
    if s in ('paving_stones', 'paver', 'sett', 'cobblestone', 'unhewn_cobblestone'):
        return 'paving'
    if s in ('gravel', 'compacted', 'fine_gravel', 'pebblestone'):
        return 'gravel'
    if s in ('earth', 'dirt', 'ground', 'unpaved', 'mud', 'sand'):
        return 'earth'
    if s in ('grass', 'grass_paver'):
        return 'grass'
    if hw in ('footway', 'pedestrian', 'steps'):
        return 'paving'
    if hw == 'path':
        return 'earth'
    if hw == 'track':
        return 'gravel'
    return 'asphalt'

def pitch_color(name):
    n = (name or '').lower()
    if 'football' in n or 'futsal' in n:
        return '#3f7a3c'
    if 'basketball' in n:
        return '#4f6f8f'
    if 'volleyball' in n:
        return '#5b7a68'
    if 'tennis' in n:
        return '#6a7f5a'
    if 'kabaddi' in n:
        return '#8a6a4a'
    if 'cricket' in n:
        return '#6f6b52'
    return '#5c7b57'

sat = np.asarray(Image.open(SRC / 'mosaic_z18.jpg').convert('RGB'))

def sat_px(x, z):
    return x / MPP + MW / 2.0, z / MPP + MH / 2.0

def sample_roof(poly):
    """Median of satellite pixels well inside a footprint (roof colour)."""
    try:
        inner = poly.buffer(-0.8)
        if inner.is_empty:
            inner = poly.buffer(-0.3)
        if inner.is_empty:
            inner = poly
    except Exception:
        inner = poly
    minx, minz, maxx, maxz = inner.bounds
    x0, y0 = sat_px(minx, minz); x1, y1 = sat_px(maxx, maxz)
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(MW - 1, int(x1) + 1), min(MH - 1, int(y1) + 1)
    if x1 <= x0 or y1 <= y0:
        return None
    step = max(1, int(max(x1 - x0, y1 - y0) / 80))
    vals = []
    for py in range(y0, y1 + 1, step):
        for px in range(x0, x1 + 1, step):
            wx = (px - MW / 2.0) * MPP
            wz = (py - MH / 2.0) * MPP
            if inner.contains(Point(wx, wz)):
                vals.append(sat[py, px])
    if not vals:
        return None
    arr = np.array(vals)
    return tuple(int(v) for v in np.median(arr, axis=0))

def default_roof(kind):
    return {
        'hostel': '#8f3b2c', 'academic': '#9e3f2f', 'research': '#9e3f2f',
        'dining': '#8d3a2a', 'admin': '#8c3b2b', 'residential': '#8a3c2d',
        'utility': '#6d6a63', 'shop': '#8e3b2c', 'hospital': '#9c4634',
        'sports': '#7d807a',
    }.get(kind, '#8e3b2c')

def kind_for(name, tags):
    n = (name or '').lower(); a = (tags.get('amenity') or '').lower()
    if a == 'library' or 'library' in n: return 'library'
    if 'hostel' in n or n in ('ponmudi', 'agasthya', 'sispara', 'anamudi'):
        return 'hostel'
    if 'dining' in n or n.startswith('cdh') or 'cafe' in n or a in ('restaurant', 'cafe', 'fast_food'):
        return 'dining'
    if 'director' in n or 'admin' in n: return 'admin'
    if 'hospital' in n or a == 'hospital': return 'hospital'
    if 'shopping' in n or 'cake world' in n: return 'shop'
    if 'animal house' in n or 'utility' in n: return 'utility'
    if 'visitors' in n or 'retreat' in n or 'guest' in n: return 'residential'
    if 'academic' in n or 'lecture' in n or a in ('college', 'university', 'school'):
        return 'academic'
    if 'instrument' in n or 'block' in n or 'crucible' in n:
        return 'research'
    if 'sports' in n or 'stadium' in n: return 'sports'
    return 'other'

def floors_for(name, tags, kind, area):
    lev = tags.get('building:levels')
    if lev:
        try:
            v = int(float(lev))
            if 1 <= v <= 12:
                return v
        except Exception:
            pass
    n = (name or '').lower()
    if 'anamudi' in n: return 6
    if any(k in n for k in ('phd hostel', 'ponmudi', 'agasthya', 'sispara')): return 5
    if 'biology' in n: return 5
    if 'chemistry' in n: return 4
    if 'physics' in n: return 3
    if 'lecture hall' in n: return 3
    if 'academic block' in n: return 3
    if 'library' in n: return 2
    if 'instrument' in n: return 2
    if 'animal house' in n: return 1
    if 'central dining' in n or n.startswith('cdh') or 'cafe' in n or 'cake world' in n: return 1
    if 'shopping' in n: return 2
    if 'hospital' in n: return 2
    if 'crucible' in n: return 2
    if 'director' in n: return 2
    if 'visitors' in n or 'vistors' in n: return 2
    if area > 1400: return 4
    if area > 650: return 3
    if area > 180: return 2
    return 1

WALL = {
    'academic': '#e9e2d4', 'research': '#e4ded2', 'library': '#eee7da',
    'hostel': '#e8ddcb', 'dining': '#ded2bd', 'admin': '#e7dcc9',
    'residential': '#e5dece', 'utility': '#d5d2c9', 'shop': '#e8dece',
    'hospital': '#f0ece2', 'sports': '#dcd9d0', 'other': '#e5ded1',
}

def color_boost(hexcol, sat_mul=1.3, val_mul=1.0):
    import colorsys
    c = hexcol.lstrip('#'); r, g, b = int(c[0:2],16)/255, int(c[2:4],16)/255, int(c[4:6],16)/255
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    s = min(1.0, s * sat_mul); v = min(1.0, v * val_mul)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return '#%02x%02x%02x' % (int(r*255), int(g*255), int(b*255))

def name_fix(n):
    return (n.replace('Iiser', 'IISER').replace('Vistors', 'Visitors')
             .replace('  ', ' ').strip())

def rnd_color(hexcol, rng, amt=8):
    c = hexcol.lstrip('#'); r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    r = max(0, min(255, r + rng.randint(-amt, amt)))
    g = max(0, min(255, g + rng.randint(-amt, amt)))
    b = max(0, min(255, b + rng.randint(-amt, amt)))
    return '#%02x%02x%02x' % (r, g, b)

def order_ccw(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, z1 = ring[i]; x2, z2 = ring[(i + 1) % len(ring)]
        s += x1 * z2 - x2 * z1
    return ring if s > 0 else list(reversed(ring))

# height grid — ~5 m spacing, matching the 4.8 m terrarium DEM at this latitude
HNX, HNZ = 393, 363
hx0, hz0 = -GW / 2, -GH / 2
hdx, hdz = GW / (HNX - 1), GH / (HNZ - 1)
print('sampling elevation grid...')
hxs = np.linspace(hx0, hx0 + GW, HNX)
hzs = np.linspace(hz0, hz0 + GH, HNZ)
HX, HZ = np.meshgrid(hxs, hzs)
HGRID = elev_grid(HX.ravel(), HZ.ravel()).reshape(HNZ, HNX)
# gentle smoothing to remove DEM pixel steps / tile seams (edge-safe)
HGRID = gaussian_filter(HGRID, sigma=0.65, mode='nearest')
HGRID = np.round(HGRID * 4) / 4
print('height range: %.1f – %.1f m' % (HGRID.min(), HGRID.max()))

def h_slope(x, z):
    i = min(max(int(round((x - hx0) / hdx)), 1), HNX - 2)
    j = min(max(int(round((z - hz0) / hdz)), 1), HNZ - 2)
    dzdx = (HGRID[j, i + 1] - HGRID[j, i - 1]) / (2 * hdx)
    dzdz = (HGRID[j + 1, i] - HGRID[j - 1, i]) / (2 * hdz)
    return math.hypot(dzdx, dzdz)

def h_bilinear(x, z):
    fx = (x - hx0) / hdx; fz = (z - hz0) / hdz
    i = int(math.floor(fx)); j = int(math.floor(fz))
    i = min(max(i, 0), HNX - 2); j = min(max(j, 0), HNZ - 2)
    tx = min(max(fx - i, 0), 1); tz = min(max(fz - j, 0), 1)
    h00 = HGRID[j, i]; h10 = HGRID[j, i + 1]; h01 = HGRID[j + 1, i]; h11 = HGRID[j + 1, i + 1]
    return float((h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz)

def b64_i16(arr):
    import struct
    return base64.b64encode(struct.pack('<' + 'h' * arr.size, *[int(v) for v in arr.flatten()])).decode('ascii')

rng = random.Random(1511)
buildings = []
labels = []
exclude_polys = []
road_geoms = []
water = []
pitches = []
parking = []
boundary = None

# campus boundary
for wid, tags, pts in ways:
    if tags.get('amenity') == 'university' and len(pts) >= 3:
        boundary = order_ccw(clean_ring(pts))
        break

print('building footprints...')
for wid, tags, pts in ways:
    if 'building' not in tags:
        continue
    ring = clean_ring(pts)
    if len(ring) < 3:
        continue
    poly = Polygon(ring)
    if not poly.is_valid:
        poly = poly.buffer(0)
        if poly.is_empty:
            continue
        if isinstance(poly, MultiPolygon):
            poly = max(poly.geoms, key=lambda p: p.area)
    if poly.area < 9:
        continue
    c = poly.centroid
    if not (-GW / 2 + 8 < c.x < GW / 2 - 8 and -GH / 2 + 8 < c.y < GH / 2 - 8):
        continue
    raw_name = tags.get('name', '')
    name = name_fix(raw_name)
    kind = kind_for(raw_name, tags)
    area = poly.area
    floors = floors_for(raw_name, tags, kind, area)
    plinth = 0.45
    wall_h = round(floors * 3.25 + plinth, 2)
    rr = poly.minimum_rotated_rectangle
    try:
        rr_coords = list(rr.exterior.coords)
        min_dim = min(LineString([rr_coords[0], rr_coords[1]]).length,
                      LineString([rr_coords[1], rr_coords[2]]).length)
    except Exception:
        min_dim = math.sqrt(max(area, 1))
    # roof style + geometry
    style = 'hip'
    if kind in ('utility',) or area < 25:
        style = 'flat'
    if any(k in (raw_name or '').lower() for k in ('instrumentation facility', 'animal house')):
        style = 'flat'
    roof_outer = None; roof_inner = None; roof_h = 0.0
    foot = order_ccw([(float(p[0]), float(p[1])) for p in poly.exterior.coords[:-1]])
    if style == 'hip' and min_dim > 7:
        roof_h = max(1.8, min(9.0, min_dim * 0.24))
        k = 0.12
        roof_outer = order_ccw([(float(c.x + (x - c.x) * 1.02), float(c.y + (z - c.y) * 1.02)) for x, z in foot])
        roof_inner = order_ccw([(float(c.x + (x - c.x) * k), float(c.y + (z - c.y) * k)) for x, z in foot])
    else:
        style = 'flat'
        roof_outer = order_ccw([(float(c.x + (x - c.x) * 1.01), float(c.y + (z - c.y) * 1.01)) for x, z in foot])
    terr_vals = [h_bilinear(x, z) for x, z in foot + [(c.x, c.y)]]
    base = float(np.median(terr_vals)) - 0.35
    found_bottom = min(terr_vals) - 3.0
    sampled = sample_roof(poly)
    roof_col = None
    if sampled:
        r, g, b = sampled
        bright = (r + g + b) / 3
        greenish = g > r * 1.08 and g > b * 1.08
        if bright > 38 and not greenish:
            roof_col = '#%02x%02x%02x' % (r, g, b)
    if not roof_col:
        roof_col = default_roof(kind)
    if style == 'hip':
        terra = ['#82352a', '#8a3b2c', '#773127', '#8f3f2e', '#7d3529', '#903f2f']
        roof_col = terra[int(wid) % len(terra)]
    roof_col = rnd_color(roof_col, rng, 5)
    wall_col = rnd_color(WALL.get(kind, WALL['other']), rng, 5)
    b_id = wid
    centroid = (float(c.x), float(c.y))
    total_h = wall_h + roof_h
    label_y = base + total_h + (4.0 if name else 0)
    b = {
        'id': b_id, 'name': name, 'kind': kind, 'floors': floors,
        'area': round(area, 1), 'base': round(base, 2),
        'foundBottom': round(found_bottom, 2),
        'wallH': wall_h, 'roofH': round(roof_h, 2), 'style': style,
        'roofColor': roof_col, 'wallColor': wall_col,
        'footprint': [[round(x, 3), round(z, 3)] for x, z in foot],
        'roofOuter': [[round(x, 3), round(z, 3)] for x, z in roof_outer] if roof_outer else None,
        'roofInner': [[round(x, 3), round(z, 3)] for x, z in roof_inner] if roof_inner else None,
        'cx': round(centroid[0], 2), 'cz': round(centroid[1], 2),
        'labelY': round(label_y, 2),
    }
    buildings.append(b)
    exclude_polys.append(poly.buffer(5.0))
    if name:
        major = any(k in raw_name.lower() for k in (
            'academic block', 'lecture hall', 'physics block', 'chemistry block',
            'biology block', 'library', 'central dining', 'anamudi', 'director'))
        labels.append({
            'text': name, 'x': round(centroid[0], 2), 'y': round(label_y, 2),
            'z': round(centroid[1], 2), 'kind': kind, 'major': bool(major), 'id': b_id,
        })

print('buildings:', len(buildings))

# roads, water, pitches, parking
for wid, tags, pts in ways:
    hw = tags.get('highway')
    if hw:
        width = road_width(tags, hw)
        surface = road_surface(tags, hw)
        lift = ROAD_LIFT.get(hw, 0.10)
        step = 2.2 if hw in ('footway', 'path', 'steps') else 3.0
        for part in clip_line(pts, pad=8.0):
            rs = resample_line(part, step)
            if len(rs) < 2:
                continue
            ys = []
            for i, (x, z) in enumerate(rs):
                if i == 0:
                    dx = rs[1][0] - x; dz = rs[1][1] - z
                elif i == len(rs) - 1:
                    dx = x - rs[i - 1][0]; dz = z - rs[i - 1][1]
                else:
                    dx = rs[i + 1][0] - rs[i - 1][0]; dz = rs[i + 1][1] - rs[i - 1][1]
                ln = math.hypot(dx, dz) or 1.0
                nx, nz = -dz / ln, dx / ln
                hc = h_bilinear(x, z)
                hl = h_bilinear(x + nx * width * 0.5, z + nz * width * 0.5)
                hr = h_bilinear(x - nx * width * 0.5, z - nz * width * 0.5)
                ys.append(max(hc, hl, hr))
            ys = smooth_profile(ys, 3)
            ys = [max(y, h_bilinear(x, z) + 0.04) for y, (x, z) in zip(ys, rs)]
            road_geoms.append({
                'type': hw, 'width': round(width, 2), 'surface': surface,
                'name': name_fix(tags.get('name', '')),
                'lift': round(lift, 2),
                'pts': [[round(x, 2), round(z, 2), round(y + lift, 2)]
                        for (x, z), y in zip(rs, ys)],
            })
    if tags.get('natural') == 'water' and len(pts) >= 3:
        ring = clean_ring(pts)
        if len(ring) >= 3:
            wc = Polygon(ring).centroid
            if -GW/2+10 < wc.x < GW/2-10 and -GH/2+10 < wc.y < GH/2-10:
                levels = [h_bilinear(x, z) for x, z in ring]
                lvl = min(levels) + 0.25
                water.append({'level': round(lvl, 2), 'name': name_fix(tags.get('name', '')),
                              'polygon': [[round(x, 2), round(z, 2)] for x, z in order_ccw(ring)]})
    if tags.get('leisure') in ('pitch', 'park') and len(pts) >= 3:
        ring = clean_ring(pts)
        if len(ring) >= 3:
            pc = Polygon(ring).centroid
            if -GW/2+10 < pc.x < GW/2-10 and -GH/2+10 < pc.y < GH/2-10:
                pname = name_fix(tags.get('name', ''))
                levels = [h_bilinear(x, z) for x, z in ring]
                lvl = max(levels) + 0.04
                pitches.append({'kind': tags.get('leisure'), 'polygon': [[round(x, 2), round(z, 2)] for x, z in order_ccw(ring)],
                                'name': pname, 'color': pitch_color(pname), 'level': round(lvl, 2)})
    if tags.get('amenity') == 'parking' and len(pts) >= 3:
        ring = clean_ring(pts)
        if len(ring) >= 3:
            pc = Polygon(ring).centroid
            if -GW/2+10 < pc.x < GW/2-10 and -GH/2+10 < pc.y < GH/2-10:
                levels = [h_bilinear(x, z) for x, z in ring]
                lvl = max(levels) + 0.06
                parking.append({'level': round(lvl, 2), 'name': name_fix(tags.get('name', '')),
                                'polygon': [[round(x, 2), round(z, 2)] for x, z in order_ccw(ring)]})

# POIs
pois = []
main_gate = proj(77.133262, 8.677921)
pois.append({'text': 'Main Gate', 'x': round(main_gate[0], 2), 'z': round(main_gate[1], 2),
             'y': round(h_bilinear(*main_gate) + 4, 2), 'kind': 'gate', 'major': True})
sports_c = proj(77.13455, 8.67835)
pois.append({'text': 'Sports Grounds', 'x': round(sports_c[0], 2), 'z': round(sports_c[1], 2),
             'y': round(h_bilinear(*sports_c) + 3, 2), 'kind': 'sports', 'major': True})
football = proj(77.13038, 8.68676)
pois.append({'text': 'Football Field', 'x': round(football[0], 2), 'z': round(football[1], 2),
             'y': round(h_bilinear(*football) + 3, 2), 'kind': 'sports', 'major': False})
labels.extend(pois)

# --- tree placement ---------------------------------------------------------------
print('placing trees...')
tree_mask = Image.new('L', (int(GW / 2) + 1, int(GH / 2) + 1), 0)
td = ImageDraw.Draw(tree_mask)
def to_mask(x, z):
    return (x + GW / 2) / 2.0, (z + GH / 2) / 2.0
def draw_poly(poly, val=255, grow=True):
    g = poly.buffer(5.0) if grow else poly
    pts = [to_mask(x, z) for x, z in g.exterior.coords]
    td.polygon(pts, fill=val)
for p in exclude_polys:
    draw_poly(p)
for road in road_geoms:
    pts = [(p[0], p[1]) for p in road['pts']]
    buf = LineString(pts).buffer(road['width'] / 2 + 3.5)
    if buf.geom_type == 'Polygon':
        td.polygon([to_mask(x, z) for x, z in buf.exterior.coords], fill=255)
    elif buf.geom_type == 'MultiPolygon':
        for g in buf.geoms:
            td.polygon([to_mask(x, z) for x, z in g.exterior.coords], fill=255)
for w in water:
    td.polygon([to_mask(x, z) for x, z in w['polygon']], fill=255)
for p in pitches:
    td.polygon([to_mask(x, z) for x, z in p['polygon']], fill=255)
for p in parking:
    td.polygon([to_mask(x, z) for x, z in p['polygon']], fill=255)
mask_arr = np.asarray(tree_mask)

def sat_rgb(x, z):
    px, py = sat_px(x, z)
    px = min(max(int(px), 2), MW - 3); py = min(max(int(py), 2), MH - 3)
    patch = sat[py - 1:py + 2, px - 1:px + 2].reshape(-1, 3).astype(np.float32)
    return patch.mean(axis=0)

# centre of main campus roughly at the academic complex
core = proj(77.1360, 8.6822)
trees = []
rng2 = random.Random(77)
step = 16.0
for gz in np.arange(-GH / 2 + 22, GH / 2 - 22, step):
    for gx in np.arange(-GW / 2 + 22, GW / 2 - 22, step):
        x = gx + rng2.uniform(-6, 6); z = gz + rng2.uniform(-6, 6)
        mx, my = to_mask(x, z)
        if 0 <= int(mx) < mask_arr.shape[1] and 0 <= int(my) < mask_arr.shape[0] and mask_arr[int(my), int(mx)] > 0:
            continue
        r, g, b = sat_rgb(x, z)
        bright = (r + g + b) / 3
        green = g - (r + b) / 2
        if green < 10 or bright < 30:
            continue
        d_core = math.hypot(x - core[0], z - core[1])
        if d_core > 500:
            continue
        if h_slope(x, z) > 0.30:
            continue
        if green > 18 and bright < 145:
            prob = 1.0
        elif green > 12 and bright < 125:
            prob = 0.55
        elif bright > 120:
            prob = 0.02
        else:
            prob = 0.04
        if rng2.random() > prob:
            continue
        h = rng2.uniform(7.0, 15.5) * (1.0 if bright < 120 else 0.8)
        rad = h * rng2.uniform(0.28, 0.38)
        y = h_bilinear(x, z)
        trees.append((round(x, 1), round(z, 1), round(y - 0.3, 2),
                      round(h, 1), round(rng2.uniform(0, math.tau), 2),
                      rng2.randrange(6), round(rad, 2)))
print('trees:', len(trees))
if len(trees) > 3600:
    rng2.shuffle(trees)
    trees = trees[:3600]
    trees.sort(key=lambda t: (t[1], t[0]))

# --- output -----------------------------------------------------------------------
def pack_tree(t):
    return [t[0], t[1], t[2], t[3], t[4], t[5]]

meta = {
    'name': 'IISER Thiruvananthapuram',
    'campusLat': 8.6822865, 'campusLon': 77.1364649,
    'zoom': Z, 'tileOrigin': [TX0, TY0], 'tileSize': TS,
    'mosaic': [MW, MH], 'mpp': MPP,
    'ground': [round(GW, 3), round(GH, 3)],
    'centerLatLon': [lat_c, lon_c],
    'bounds': {'west': unproj(-GW / 2, 0)[0], 'east': unproj(GW / 2, 0)[0],
               'north': unproj(0, -GH / 2)[1], 'south': unproj(0, GH / 2)[1]},
    'heightRange': [float(HGRID.min()), float(HGRID.max())],
    'sources': {
        'osmSnapshot': osm_timestamp,
        'osmLicense': 'ODbL 1.0',
        'satellite': 'Esri World Imagery, retrieved ' + FETCH_DATE,
        'terrain': 'AWS Terrain Tiles / Mapzen terrarium, retrieved ' + FETCH_DATE,
    },
}
hm = {
    'nx': HNX, 'nz': HNZ, 'x0': round(hx0, 3), 'z0': round(hz0, 3),
    'dx': round(hdx, 5), 'dz': round(hdz, 5),
    'b64': b64_i16(np.round(HGRID * 10)),
}

data = {
    'meta': meta,
    'boundary': [[round(x, 2), round(z, 2)] for x, z in (boundary or [])],
    'buildings': buildings,
    'labels': labels,
    'roads': road_geoms,
    'water': water,
    'pitches': pitches,
    'parking': parking,
    'trees': [pack_tree(t) for t in trees],
    'heightmap': hm,
}
js = 'window.CAMPUS_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n'
(OUT / 'campus-data.js').write_text(js)
print('wrote campus-data.js', len(js) / 1e6, 'MB')

# satellite data uri
img = Image.open(SRC / 'mosaic_z18.jpg').convert('RGB')
buf = io.BytesIO(); img.save(buf, 'JPEG', quality=90, optimize=True)
enc = base64.b64encode(buf.getvalue()).decode('ascii')
(OUT / 'satellite.js').write_text('window.CAMPUS_SATELLITE_URI = "data:image/jpeg;base64,' + enc + '";\n')
print('wrote satellite.js', len(enc) / 1e6, 'MB b64')

# quick manifest for debugging
with open(OUT / 'manifest.json', 'w') as f:
    json.dump({'buildings': len(buildings), 'labels': len(labels), 'trees': len(trees),
               'roads': len(road_geoms), 'water': len(water), 'pitches': len(pitches),
               'parking': len(parking), 'osmSnapshot': osm_timestamp, 'fetched': FETCH_DATE,
               'ground': [GW, GH], 'mpp': MPP, 'elev': meta['heightRange']}, f, indent=2)
