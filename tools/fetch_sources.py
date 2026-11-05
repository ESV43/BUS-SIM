#!/usr/bin/env python3
"""Fetch fresh source data for the IISER Thiruvananthapuram 3D campus model.

Downloads (2026 snapshot):
  - OpenStreetMap buildings, roads, water, pitches, parking, campus boundary
  - Esri World Imagery satellite tiles (z18) mosaicked to a single JPEG
  - AWS Terrain Tiles / Mapzen terrarium elevation tiles (z15)

Usage:
  python3 tools/fetch_sources.py [--src /tmp/opencode/iisert]
"""
import argparse
import io
import json
import time
from pathlib import Path

import requests
from PIL import Image

BBOX = (8.670, 77.120, 8.695, 77.145)  # south, west, north, east
Z = 18
TX0, TY0, NX, NY = 187231, 124719, 13, 12
TZ, TX15, TY15 = 15, 23403, 15589
UA = 'iisert-campus-3d/1.0 (educational; contact: local project)'

OVERPASS_QUERIES = [
    '''[out:json][timeout:180];
(
  way["building"]({bbox});
  way["highway"]({bbox});
  way["natural"="water"]({bbox});
  way["waterway"]({bbox});
  way["leisure"]({bbox});
  way["amenity"="university"]({bbox});
  way["landuse"]({bbox});
  way["barrier"]({bbox});
  node["amenity"]({bbox});
  node["tourism"]({bbox});
);
out body;
>;
out skel qt;''',
    '''[out:json][timeout:180];
(
  way["amenity"~"parking|playground|sports_centre|swimming_pool"]({bbox});
  way["natural"~"wood|scrub|grassland|grass|tree_row"]({bbox});
  way["landuse"~"forest|grass|meadow|recreation_ground|village_green"]({bbox});
  way["leisure"~"pitch|park|garden|playground|sports_centre|track"]({bbox});
  way["barrier"~"wall|fence|hedge"]({bbox});
  way["man_made"~"water_tower|storage_tank|reservoir_covered"]({bbox});
  way["power"="line"]({bbox});
  way["building:part"]({bbox});
  node["amenity"~"parking|shelter|bus_station|place_of_worship|fuel"]({bbox});
  node["natural"="tree"]({bbox});
  node["man_made"="tower"]({bbox});
);
out body;
>;
out skel qt;''',
]


def fetch_overpass(src: Path) -> None:
    session = requests.Session()
    session.headers['User-Agent'] = UA
    elements = {}
    timestamps = []
    for query in OVERPASS_QUERIES:
        q = query.replace('{bbox}', '%s,%s,%s,%s' % BBOX)
        for attempt in range(4):
            try:
                r = session.post('https://overpass-api.de/api/interpreter',
                                 data={'data': q}, timeout=240)
                r.raise_for_status()
                payload = r.json()
                break
            except Exception as exc:
                print('overpass attempt %d failed: %s' % (attempt + 1, exc))
                time.sleep(8 * (attempt + 1))
        else:
            raise SystemExit('could not download OpenStreetMap data')
        ts = payload.get('osm3s', {}).get('timestamp_osm_base')
        if ts:
            timestamps.append(ts)
        for el in payload.get('elements', []):
            elements[(el['type'], el['id'])] = el
        time.sleep(2)

    out = {
        'version': 0.6,
        'generator': 'iisert-campus-3d fetch_sources.py',
        'osm3s': {'timestamp_osm_base': max(timestamps) if timestamps else '',
                  'copyright': 'The data included in this document is from www.openstreetmap.org. '
                               'The data is made available under ODbL.'},
        'elements': list(elements.values()),
    }
    dest = src / 'campus-2026.osm.json'
    dest.write_text(json.dumps(out, separators=(',', ':')))
    print('osm: %d elements, snapshot %s' % (len(out['elements']), out['osm3s']['timestamp_osm_base']))


def fetch_satellite(src: Path) -> None:
    tiles = src / 'tiles'
    tiles.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers['User-Agent'] = UA
    mosaic = Image.new('RGB', (NX * 256, NY * 256))
    for j in range(NY):
        for i in range(NX):
            x, y = TX0 + i, TY0 + j
            dest = tiles / ('%d_%d.jpg' % (x, y))
            if not dest.exists() or dest.stat().st_size < 1000:
                url = ('https://server.arcgisonline.com/ArcGIS/rest/services/'
                       'World_Imagery/MapServer/tile/%d/%d/%d' % (Z, y, x))
                for attempt in range(4):
                    try:
                        r = session.get(url, timeout=90)
                        r.raise_for_status()
                        if len(r.content) < 1000:
                            raise ValueError('empty tile')
                        dest.write_bytes(r.content)
                        break
                    except Exception as exc:
                        print('satellite tile %d/%d failed: %s' % (x, y, exc))
                        time.sleep(3 * (attempt + 1))
                else:
                    raise SystemExit('could not download satellite tiles')
            mosaic.paste(Image.open(dest).convert('RGB'), (i * 256, j * 256))
    mosaic.save(src / 'mosaic_z18.jpg', quality=92)
    print('satellite: %dx%d mosaic' % mosaic.size)


def fetch_terrain(src: Path) -> None:
    dest_dir = src / 'terr_z15'
    dest_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers['User-Agent'] = UA
    for j in range(3):
        for i in range(3):
            x, y = TX15 + i, TY15 + j
            dest = dest_dir / ('%d_%d.png' % (x, y))
            if dest.exists() and dest.stat().st_size > 1000:
                continue
            url = ('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'
                   '%d/%d/%d.png' % (TZ, x, y))
            for attempt in range(4):
                try:
                    r = session.get(url, timeout=90)
                    r.raise_for_status()
                    dest.write_bytes(r.content)
                    break
                except Exception as exc:
                    print('terrain tile %d/%d failed: %s' % (x, y, exc))
                    time.sleep(3 * (attempt + 1))
            else:
                raise SystemExit('could not download terrain tiles')
    print('terrain: 3x3 tiles at z%d' % TZ)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='/tmp/opencode/iisert')
    args = ap.parse_args()
    src = Path(args.src)
    src.mkdir(parents=True, exist_ok=True)
    fetch_overpass(src)
    fetch_satellite(src)
    fetch_terrain(src)


if __name__ == '__main__':
    main()
