"""Validate generated XLSX package contracts, independent of SheetJS parsing."""
import json
import posixpath
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
P = '{http://schemas.openxmlformats.org/package/2006/relationships}'
ORDER = 'sheetPr dimension sheetViews sheetFormatPr cols sheetData sheetCalcPr sheetProtection protectedRanges scenarios autoFilter sortState dataConsolidate customSheetViews mergeCells phoneticPr conditionalFormatting dataValidations hyperlinks printOptions pageMargins pageSetup headerFooter rowBreaks colBreaks customProperties cellWatches ignoredErrors smartTags drawing legacyDrawing legacyDrawingHF picture oleObjects controls webPublishItems tableParts extLst'.split()

def validate(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate package path'
        docs = {n: ET.fromstring(archive.read(n)) for n in names if n.endswith(('.xml', '.rels'))}
        for name, doc in docs.items():
            if not name.endswith('.rels'):
                continue
            base = '' if name == '_rels/.rels' else name.rsplit('/_rels/', 1)[0] + '/'
            ids = set()
            for rel in doc:
                assert rel.attrib['Id'] not in ids
                ids.add(rel.attrib['Id'])
                if rel.attrib.get('TargetMode') == 'External':
                    continue
                target = rel.attrib['Target']
                resolved = target.lstrip('/') if target.startswith('/') else posixpath.normpath(base + target)
                assert resolved in names, (name, resolved)
        ct = docs['[Content_Types].xml']
        for override in ct:
            if 'PartName' in override.attrib:
                assert override.attrib['PartName'].lstrip('/') in names
        styles = docs['xl/styles.xml']
        for tag in ('fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'numFmts'):
            node = styles.find(S + tag)
            assert node is not None and int(node.attrib['count']) == len(node), tag
        xfs = styles.find(S + 'cellXfs')
        custom_formats = {int(x.attrib['numFmtId']) for x in styles.find(S + 'numFmts')}
        for xf in xfs:
            for attr, tag in [('fontId', 'fonts'), ('fillId', 'fills'), ('borderId', 'borders'), ('xfId', 'cellStyleXfs')]:
                assert 0 <= int(xf.attrib[attr]) < len(styles.find(S + tag))
            assert int(xf.attrib['numFmtId']) < 164 or int(xf.attrib['numFmtId']) in custom_formats
        strings = docs.get('xl/sharedStrings.xml')
        rels = {r.attrib['Id']: r.attrib['Target'] for r in docs['xl/_rels/workbook.xml.rels']}
        sheets = docs['xl/workbook.xml'].find(S + 'sheets')
        sheet_names = [s.attrib['name'] for s in sheets]
        assert len(sheet_names) == len(set(sheet_names))
        for sheet in sheets:
            target = rels[sheet.attrib[R + 'id']]
            name = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            doc = docs[name]
            tags = [n.tag.removeprefix(S) for n in doc]
            assert all(n in ORDER for n in tags), tags
            assert [ORDER.index(n) for n in tags] == sorted(ORDER.index(n) for n in tags), tags
            assert len(tags) == len(set(tags)), tags
            refs = set()
            for row in doc.find(S + 'sheetData'):
                last_col = -1
                for cell in row:
                    ref = cell.attrib['r']
                    match = re.fullmatch(r'([A-Z]+)([1-9][0-9]*)', ref)
                    assert match and int(match[2]) == int(row.attrib['r'])
                    assert ref not in refs
                    refs.add(ref)
                    col = 0
                    for char in match[1]:
                        col = col * 26 + ord(char) - 64
                    assert col > last_col
                    last_col = col
                    assert 0 <= int(cell.attrib.get('s', 0)) < len(xfs)
                    value = cell.find(S + 'v')
                    kind = cell.attrib.get('t', 'n')
                    if value is not None and value.text:
                        if kind == 's':
                            assert strings is not None and 0 <= int(value.text) < len(strings)
                        elif kind == 'n':
                            assert float(value.text) == float(value.text)
            merges = doc.find(S + 'mergeCells')
            assert merges is None or int(merges.attrib['count']) == len(merges)
        return {'sheets': len(sheets), 'xml_parts': len(docs), 'zip_crc': 'PASS', 'structure': 'PASS'}

if __name__ == '__main__':
    print(json.dumps([validate(path) for path in sys.argv[1:]]))
