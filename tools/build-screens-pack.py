#!/usr/bin/env python3
"""Fabrique le pack d'images des écrans avioniques à partir du poster « Synoptic ACE » FlightSafety.

    python3 tools/build-screens-pack.py "Synoptic ACE.pdf" private/pc24-ecrans.pack.json [dossier-png]

Nécessite pdftoppm (poppler) et Pillow. Le pack produit contient des images
protégées par le droit d'auteur : usage personnel, ne pas le commiter ni le publier.
Les découpes doivent rester cohérentes avec les vues « ecr-* » de content/cockpit.json.
Avec un troisième argument, les images sont aussi écrites en PNG (pour placer les zones).
"""
import base64
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

DPI = 200
# Coordonnées en unités d'un aperçu de l'affiche à 40 dpi (page 1947 × 2810 pt).
UNIT = DPI / 40

# Bords des panneaux, relevés sur l'affiche.
FMS_COLS = [(337.2, 403.8), (405.2, 476.2), (477.8, 548.6), (550.2, 621.3), (622.9, 693.9),
            (695.3, 766.3), (767.7, 838.7), (840.3, 911.3), (912.7, 983.7)]
FMS_ROWS = [(1005.8, 1079.4), (1081.0, 1154.8)]
PROC_COLS = [(121.2, 192.0), (194.0, 265.0)]
PROC_ROWS = [(1002.0, 1075.6), (1077.2, 1151.2)]
SEN_COLS = [(90.6, 160.6), (162.1, 232.2), (233.6, 303.8), (305.2, 375.3)]
SEN_ROWS = [(587.0, 664.8), (666.8, 744.4), (746.4, 824.2), (826.2, 903.9), (905.9, 983.9)]
RAD_COLS = [(713.8, 784.6), (786.1, 856.8), (858.7, 929.5), (931.0, 1001.7)]
RAD_ROWS = [(586.8, 664.4), (666.4, 744.6), (746.2, 824.8), (826.6, 904.5), (907.3, 984.9)]
SYN_COLS = [(79.2, 304.2), (309.8, 534.9), (540.7, 765.7), (771.7, 996.8)]
SYN_ROWS = [(1182.4, 1343.0), (1348.8, 1509.5)]


def cell(cols, rows, c, r, rows2=None):
    (x0, x1), (y0, y1) = cols[c], rows[r]
    if rows2 is not None:
        y1 = rows[rows2][1]
    return (x0, y0, x1, y1)


def syn(c, r):
    return cell(SYN_COLS, SYN_ROWS, c, r)


F = lambda c, r: cell(FMS_COLS, FMS_ROWS, c, r)  # noqa: E731
P = lambda c, r: cell(PROC_COLS, PROC_ROWS, c, r)  # noqa: E731
S = lambda c, r: cell(SEN_COLS, SEN_ROWS, c, r)  # noqa: E731
R = lambda c, r: cell(RAD_COLS, RAD_ROWS, c, r)  # noqa: E731

# Vue simple : un rectangle de l'affiche. Vue composée : (colonnes, [panneaux]),
# chaque panneau rempli dans l'ordre de lecture ; None laisse une case vide,
# ('tall', rect) occupe deux lignes.
CROPS = {
    'ecr-pfd': (112.8, 357.4, 398.5, 560.8),
    'ecr-mfd-haut': (406.3, 357.4, 691.9, 560.8),
    'ecr-mfd-bas': (403.0, 567.6, 694.0, 771.0),
    'ecr-composite': (403.0, 780.8, 694.0, 984.3),
    'ecr-syn-eng': syn(0, 0),
    'ecr-syn-fuel': syn(1, 0),
    'ecr-syn-elec': syn(2, 0),
    'ecr-syn-ecb': syn(3, 0),
    'ecr-syn-brakes': syn(0, 1),
    'ecr-syn-ips': syn(1, 1),
    'ecr-syn-ecs': syn(2, 1),
    'ecr-syn-sum': syn(3, 1),
    'ecr-inav': (411.0, 95.0, 691.0, 330.5),
    'ecr-cmc': (775.0, 140.0, 918.0, 297.0),
    'ecr-capteurs': (4, [S(0, 0), S(1, 0), S(2, 0), S(3, 0),
                         S(0, 1), S(1, 1), S(2, 1), S(3, 1),
                         S(0, 2), S(1, 2), S(0, 4), S(1, 4)]),
    'ecr-radar': (3, [S(2, 2), S(3, 2), S(0, 3), S(1, 3), S(2, 3), S(3, 3)]),
    'ecr-radios-1': (4, [R(0, 0), R(1, 0), R(2, 0), R(3, 0),
                         R(0, 1), R(1, 1), R(2, 1), R(3, 1)]),
    'ecr-radios-2': (3, [R(0, 2), R(1, 2), R(2, 2),
                         R(3, 2), R(0, 3), R(1, 3),
                         R(2, 3), R(3, 3), R(3, 4)]),
    'ecr-fms-init': (3, [('tall', cell(FMS_COLS, FMS_ROWS, 0, 0, 1)), F(1, 0), F(2, 0),
                         F(3, 0), F(4, 0),
                         F(5, 0), F(6, 0), F(8, 1)]),
    'ecr-fms-dep': (3, [P(0, 0), P(0, 1), F(7, 0),
                        F(8, 0), F(1, 1), None]),
    'ecr-fms-arr': (4, [P(1, 0), P(1, 1), F(2, 1), F(3, 1),
                        F(4, 1), F(5, 1), F(6, 1), F(7, 1)]),
}

CELL = (360, 374)  # taille d'une case composée, en pixels à 200 dpi
GAP = 8


def px(rect):
    return tuple(int(round(v * UNIT)) for v in rect)


def compose(page, cols, panels):
    w, h = CELL
    rows = []  # occupation des cases, pour placer les panneaux hauts
    placed = []
    pos = 0
    taken = set()
    for p in panels:
        while (pos // cols, pos % cols) in taken:
            pos += 1
        r, c = divmod(pos, cols)
        tall = isinstance(p, tuple) and len(p) == 2 and p[0] == 'tall'
        if tall:
            taken.add((r + 1, c))
        if p is not None:
            rect = p[1] if tall else p
            im = page.crop(px(rect)).resize((w, 2 * h + GAP if tall else h))
            placed.append((im, c, r))
        pos += 1
        rows.append(r + (1 if tall else 0))
    nrows = max(rows) + 1
    out = Image.new('RGB', (cols * w + (cols + 1) * GAP, nrows * h + (nrows + 1) * GAP), 'white')
    for im, c, r in placed:
        out.paste(im, (GAP + c * (w + GAP), GAP + r * (h + GAP)))
    return out


def main(pdf, out, pngdir=None):
    Image.MAX_IMAGE_PIXELS = None
    images = {}
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-f', '1', '-l', '1', pdf, f'{tmp}/p'], check=True)
        page = Image.open(next(Path(tmp).glob('p-*.png'))).convert('RGB')
        for view, spec in CROPS.items():
            if isinstance(spec[1], list):
                im = compose(page, *spec)
            else:
                im = page.crop(px(spec))
            if im.width > 1600:
                im = im.resize((1600, round(im.height * 1600 / im.width)))
            if pngdir:
                Path(pngdir).mkdir(parents=True, exist_ok=True)
                im.save(Path(pngdir) / f'{view}.png')
            buf = io.BytesIO()
            im.save(buf, 'JPEG', quality=80, optimize=True)
            images[view] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
            print(f'{view:15} {im.size[0]}x{im.size[1]}  {len(buf.getvalue()) // 1024} Ko')
    pack = {'_meta': {'source': 'Poster Synoptic ACE FlightSafety PC-24 rév. 2.1 — usage personnel'}, 'images': images}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(pack))
    print(f'→ {out} ({Path(out).stat().st_size // 1024} Ko)')


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(*sys.argv[1:])
