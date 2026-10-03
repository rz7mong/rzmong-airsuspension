import json,sys,subprocess,re,numpy as np,cv2
from PIL import Image, ImageDraw
from sil import cr, cr_path
U=3
def potrace_paths(binary):
    h,w=binary.shape
    img=Image.fromarray(np.where(binary,0,255).astype(np.uint8)).convert('1')
    img.save('/tmp/l.pbm')
    out=subprocess.run(['potrace','-b','svg','-u','1','--flat','-t','14','-a','1.1','-O','1.0','-o','-','/tmp/l.pbm'],capture_output=True,text=True).stdout
    ds=re.findall(r' d="([^"]+)"',out)
    return " ".join(d.replace("\n"," ") for d in ds)
def build(cfg):
    im=cv2.imread(cfg['img']); H,W=im.shape[:2]
    s,ox,oy=cfg['s'],cfg['ox'],cfg['oy']
    f=lambda p:(ox+p[0]*s, oy+p[1]*s)
    body=cfg['body']
    # mask at U scale
    mimg=Image.new('L',(W*U,H*U),0); d=ImageDraw.Draw(mimg)
    d.polygon([(x*U,y*U) for x,y in cr(body,12)],fill=255)
    for x,y,r in cfg['arches']: d.ellipse([(x-r)*U,(y-r)*U,(x+r)*U,(y+r)*U],fill=0)
    for poly in cfg.get('cut',[]): d.polygon([(x*U,y*U) for x,y in poly],fill=0)
    mask=np.array(mimg)>127
    g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY).astype(np.float32)
    g=cv2.resize(g,(W*U,H*U),interpolation=cv2.INTER_CUBIC)
    gs=cv2.GaussianBlur(g,(0,0),cfg.get('blur',2.2))
    vals=gs[mask]
    layers=[]
    for pct,col,op in cfg['levels']:
        t=np.percentile(vals,abs(pct))
        b=mask&((gs<t) if pct>0 else (gs>t))
        b=cv2.morphologyEx(b.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0
        layers.append((col,op,potrace_paths(b)))
    # edge (door gaps, seals): dark high-pass lines
    if cfg.get('edges'):
        hp=g-cv2.GaussianBlur(g,(0,0),4)
        e=mask&(cv2.GaussianBlur(hp,(0,0),1.0)<cfg['edges'])
        e=cv2.morphologyEx(e.astype(np.uint8),cv2.MORPH_OPEN,np.ones((2,2),np.uint8))>0
        layers.append(("#000",cfg.get('edgeop',.45),potrace_paths(e)))
    tr="matrix(%g 0 0 %g %g %g)"%(s/U,-s/U,ox,oy+s*H)
    out={"body":cr_path(body,f),"tr":tr,"layers":[[c,o,dd] for c,o,dd in layers]}
    for k in ('head','tail','glass','mirror'):
        if k in cfg: out[k]=cr_path(cfg[k],f)
    for k in ('lines',):
        if k in cfg: out[k]=" ".join(cr_path(l,f,closed=False) for l in cfg[k])
    out['arches']=[[round(ox+x*s,1),round(oy+y*s,1),round(r*s,1)] for x,y,r in cfg['arches']]
    return out
if __name__=="__main__":
    cfg=json.load(open(sys.argv[1])); o=build(cfg); json.dump(o,open(sys.argv[2],'w'))
    import gzip; raw=json.dumps(o).encode(); print("raw",len(raw),"gz",len(gzip.compress(raw)))
