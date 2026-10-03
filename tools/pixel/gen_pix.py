import sys,json,os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from pix import build, enc; import specs
out={}
for name in ('fd','show','zenix','accord'):
    g,w,m=build(getattr(specs,name.upper()))
    m['body']=enc(g); m['well']=enc(w); out[name]=m
js="/* DIBUAT OTOMATIS oleh tools/pixel/gen_pix.py — sprite pixel art mobil (palet terindeks; 1-5 = cat yang bisa ditukar warna).\n * Proporsi dari foto Instagram @rzmong & @gesrexgang (dipakai dengan izin). Jangan edit manual. */\nwindow.RZMPix="+json.dumps(out,separators=(',',':'))+";\n"
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','web','control','cars-pixel.js'),'w').write(js)
import gzip; print(len(js),len(gzip.compress(js.encode())))
