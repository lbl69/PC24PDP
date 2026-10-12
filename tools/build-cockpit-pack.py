#!/usr/bin/env python3
"""Fabrique le pack d'images du cockpit à partir du poster PDF FlightSafety PC-24.

    python3 tools/build-cockpit-pack.py poster.pdf private/pc24-cockpit.pack.json

Nécessite pdftoppm (poppler) et Pillow. Le pack produit contient des images
protégées par le droit d'auteur : usage personnel, ne pas le commiter ni le publier.
Les découpes doivent rester cohérentes avec content/cockpit.json.
"""
import base64
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

DPI = 170
# vue : (page du PDF, découpe en fraction de page gauche, haut, droite, bas)
CROPS = {
    'overview': (1, (0.335, 0.02, 0.82, 0.905)),
    'overhead': (2, (0.26, 0.10, 0.76, 0.88)),
    'glare-left': (4, (0.22, 0.135, 0.785, 0.825)),
    'glare-center': (5, (0.22, 0.125, 0.795, 0.825)),
    'glare-right': (6, (0.22, 0.135, 0.78, 0.825)),
    'console-fwd': (8, (0.125, 0.115, 0.885, 0.86)),
    'console-center': (9, (0.27, 0.115, 0.725, 0.865)),
    'console-aft': (10, (0.145, 0.115, 0.835, 0.86)),
    'side': (11, (0.02, 0.18, 0.975, 0.83)),
}


def main(pdf, out):
    images = {}
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', pdf, f'{tmp}/p'], check=True)
        pages = sorted(Path(tmp).glob('p-*.png'))
        width = len(pages[0].stem.split('-')[1])
        for view, (page, (l, t, r, b)) in CROPS.items():
            im = Image.open(Path(tmp) / f'p-{page:0{width}d}.png').convert('RGB')
            w, h = im.size
            crop = im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))
            buf = io.BytesIO()
            crop.save(buf, 'JPEG', quality=82, optimize=True)
            images[view] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
            print(f'{view:15} {crop.size[0]}x{crop.size[1]}  {len(buf.getvalue()) // 1024} Ko')
    pack = {'_meta': {'source': 'Poster cockpit FlightSafety PC-24 rév. 0.2 — usage personnel'}, 'images': images}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(pack))
    print(f'→ {out} ({Path(out).stat().st_size // 1024} Ko)')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
