import json
def pack(name):
    o=json.load(open(name+'_out.json'))
    dark=[[op,d] for c,op,d in o['layers'] if c!="#fff"]
    light=[[op,d] for c,op,d in o['layers'] if c=="#fff"]
    r={"body":o['body'],"tr":o['tr'],"dark":dark,"light":light,"arches":o['arches']}
    for k in ('glass','mirror','head','tail'):
        if k in o: r[k]=o[k]
    return r
data={"fd":pack('fd'),"zenix":pack('zx'),"accord":pack('ac')}
js="/* DIBUAT OTOMATIS (tools trace) — jiplakan vektor sisi-samping dari foto Instagram @rzmong & @gesrexgang (dipakai dengan izin).\n * Lapisan bayangan/kilap diturunkan dari luminans foto (potrace), cat tetap bisa diganti warna. Jangan edit manual. */\nwindow.RZMTraced="+json.dumps(data,separators=(',',':'))+";\n"
open('/workspace/airsusp/web/control/cars-traced.js','w').write(js)
import gzip; print(len(js), len(gzip.compress(js.encode())))
