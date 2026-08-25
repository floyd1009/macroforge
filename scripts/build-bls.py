#!/usr/bin/env python3
"""
Rebuild src/data/bls/bls.json from the published Bundeslebensmittelschlüssel.

Source: Max Rubner-Institut (2025), BLS 4.0 — Deutsche Nährstoffdatenbank.
        DOI 10.25826/Data20251217-134202-0, CC BY 4.0.

The published file is a 14 MB XLSX with 418 columns (7,140 foods x 138
nutrients, each with a value, a data-origin flag and a reference). This script
keeps the 11 nutrients the app actually uses and drops the provenance columns,
taking the bundle from 14 MB to ~1 MB (~300 kB gzipped).

Two things about BLS make it fit this app without conversion, and both are
worth stating because getting either wrong is a silent, systematic error:

  * Column "CHO Carbohydrate, available" is *available* carbohydrate, with
    fibre reported separately in "FIBT". That is the EU convention the app
    stores everywhere, so no fibre is added or subtracted on import.
  * BLS computes energy with the LMIV Annex XIV factors, the same ones
    src/lib/nutrition.ts implements. bls.test.ts asserts the two agree on 95%+
    of foods, which is what would catch a mis-parsed carbohydrate column.

Usage:
    python3 scripts/build-bls.py path/to/BLS_4_0_Data_2025_EN.xlsx

The XLSX is not committed. Download it from the DOI above (the repository is
behind a bot challenge, so use a browser, or the MyCoRe REST API:
https://www.openagrar.de/api/v2/objects/openagrar_mods_00112643/derivates/openagrar_derivate_00069362/contents/BLS_4_0_Data_2025_EN.xlsx)
"""
import collections
import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'bls' / 'bls.json'

# Column index -> short key. Indices are positional in the published sheet;
# the header row is asserted below so a new BLS release cannot shift them
# silently.
COLS = {
    0: 'code', 1: 'de', 2: 'en',
    6: 'kcal', 9: 'water', 12: 'protein', 15: 'fat', 18: 'carbs', 21: 'fiber',
    24: 'alcohol', 120: 'salt', 183: 'polyols', 219: 'sugar', 246: 'satFat',
}
EXPECTED_HEADERS = {
    0: 'BLS Code', 2: 'Food name',
    6: 'ENERCC', 12: 'PROT625', 15: 'FAT', 18: 'CHO', 21: 'FIBT',
    120: 'NACL', 219: 'SUGAR', 246: 'FASAT',
}
NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar',
             'satFat', 'salt', 'alcohol', 'polyols', 'water']

RAW = re.compile(r'\b(raw|uncooked|dried|dry|fresh|green)\b', re.I)
COOKED = re.compile(r'\b(cooked|boiled|steamed|fried|roasted|baked|grilled|'
                    r'braised|stewed|deep-fried|prepared|heated)\b', re.I)


def col_index(ref):
    letters = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def detect_state(name):
    """BLS ships raw and cooked variants as separate foods; label which is which.

    This matters more than it looks: logging a cooked weight against a raw
    entry under-counts protein by roughly 30% for meat.
    """
    if COOKED.search(name):
        return 'cooked'
    if RAW.search(name):
        return 'raw'
    return 'as_sold'


def round_or_none(v, digits=2):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    x = round(f, digits)
    return int(x) if x == int(x) else x


def main(path):
    z = zipfile.ZipFile(path)

    shared = []
    with z.open('xl/sharedStrings.xml') as f:
        for _, el in ET.iterparse(f, events=('end',)):
            if el.tag == NS + 'si':
                shared.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                el.clear()

    def cell_value(c):
        t, v = c.get('t'), c.find(NS + 'v')
        if v is None or v.text is None:
            return None
        return shared[int(v.text)] if t == 's' else v.text

    rows, stats = [], collections.Counter()
    with z.open('xl/worksheets/sheet1.xml') as f:
        header_checked = False
        for _, el in ET.iterparse(f, events=('end',)):
            if el.tag != NS + 'row':
                continue

            cells = {}
            for c in el.findall(NS + 'c'):
                i = col_index(c.get('r'))
                if i in COLS:
                    cells[i] = cell_value(c)
            el.clear()

            if not header_checked:
                header_checked = True
                for i, expect in EXPECTED_HEADERS.items():
                    got = str(cells.get(i, ''))
                    if not got.startswith(expect):
                        raise SystemExit(
                            f'Column {i} is "{got}", expected it to start with '
                            f'"{expect}". The BLS layout changed — update COLS.')
                continue

            rec = {}
            for i, key in COLS.items():
                v = cells.get(i)
                if v is None:
                    continue
                rec[key] = v if key in ('code', 'de', 'en') else round_or_none(v)

            en = (rec.get('en') or '').strip()
            de = (rec.get('de') or '').strip()
            if not rec.get('code') or not (en or de):
                continue
            # Same gate the app applies to any source: no energy and no macros
            # is worse than no result, because it logs as zero calories.
            if all(rec.get(k) is None for k in ('kcal', 'protein', 'carbs', 'fat')):
                stats['dropped'] += 1
                continue

            state = detect_state(en)
            stats[state] += 1
            rows.append([rec['code'], en, de, state] + [rec.get(k) for k in NUTRIENTS])

    payload = {
        'v': 1,
        'source': 'BLS 4.0 (Max Rubner-Institut, CC BY 4.0)',
        'doi': '10.25826/Data20251217-134202-0',
        'cols': ['code', 'en', 'de', 'state'] + NUTRIENTS,
        'rows': rows,
    }
    js = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(js, encoding='utf-8')

    print(f'{len(rows)} foods -> {OUT}')
    print(f'  dropped (no usable data): {stats["dropped"]}')
    print(f'  state: raw={stats["raw"]} cooked={stats["cooked"]} as_sold={stats["as_sold"]}')
    print(f'  {len(js) / 1e6:.2f} MB, {len(gzip.compress(js.encode(), 9)) / 1024:.0f} kB gzipped')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
