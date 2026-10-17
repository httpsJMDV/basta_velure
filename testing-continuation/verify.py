import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as E

base = Path(__file__).parent
docs = base.parent / 'docs2'
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
total = 0
for original in sorted(docs.glob('*.xlsx')):
    target = docs / 'answered' / original.name
    cases = json.loads((base / 'cases' / (original.stem + '.json')).read_text())
    with ZipFile(original) as src, ZipFile(target) as out:
        assert src.namelist() == out.namelist(), original.name
        allowed = {}
        for case in cases:
            allowed.setdefault(case['file'], set()).update(f'{c}{case["row"]}' for c in 'KLM')
        for name in src.namelist():
            if name.endswith('.xml'):
                old, new = E.fromstring(src.read(name)), E.fromstring(out.read(name))
                if not name.startswith('xl/worksheets/'):
                    assert src.read(name) == out.read(name), (original.name, name)
                    continue
                oc = {c.attrib['r']: c for c in old.findall('.//s:c', ns)}
                nc = {c.attrib['r']: c for c in new.findall('.//s:c', ns)}
                for ref, cell in oc.items():
                    assert cell.attrib.get('s') == nc[ref].attrib.get('s'), (original.name, name, ref, 'style')
                    if ref not in allowed.get(name, set()) and E.tostring(cell) != E.tostring(nc[ref]):
                        # Existing builder also fills yellow Summary and Assumptions answers.
                        assert ref.startswith(('B','D')), (original.name, name, ref)
                for case in [c for c in cases if c['file'] == name]:
                    for col in 'KL':
                        text = ''.join(nc[f'{col}{case["row"]}'].itertext()).strip()
                        assert text, (original.name, case['id'], col)
        total += len(cases)
    print(f'{original.name}: XML, styles, case answer coverage verified ({len(cases)} cases)')
print(f'{total} case rows across eight workbooks verified.')
