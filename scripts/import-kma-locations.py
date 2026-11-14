"""Import the official KMA 2026-09-30 grid/area table, without third-party packages."""
import io, json, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
archive = zipfile.ZipFile('kma-official-guide.zip')
book = zipfile.ZipFile(io.BytesIO(archive.read('dfs-zone-tree_excel_20260930.xlsx')))
ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings = [''.join(t.itertext()) for t in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('s:si',ns)]
records = []
for row in ET.fromstring(book.read('xl/worksheets/sheet1.xml')).findall('s:sheetData/s:row',ns)[1:]:
    values = {}
    for c in row:
        v = c.find('s:v',ns)
        if v is not None:
            values[''.join(x for x in c.attrib['r'] if x.isalpha())] = strings[int(v.text)] if c.attrib.get('t')=='s' else v.text
    if values.get('A') != 'kor': continue
    try:
        records.append({'areaNo':values['B'], 'name':' '.join(values.get(k,'') for k in ['C','D','E']).strip(), 'nx':int(values['F']), 'ny':int(values['G']), 'latitude':round(float(values['O']),7), 'longitude':round(float(values['N']),7)})
    except (KeyError,ValueError): continue
Path('server/data').mkdir(exist_ok=True)
Path('server/data/kma-locations.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Imported {len(records)} official KMA locations.')
