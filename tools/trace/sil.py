import json,sys,numpy as np
from PIL import Image, ImageDraw
def cr(pts, n=8, closed=True):
    P=pts+[pts[0],pts[1],pts[2]] if closed else pts
    out=[]
    for i in range(len(pts)):
        p0,p1,p2,p3=[np.array(P[(i+k-1)%len(pts)],float) for k in range(4)]
        for t in np.linspace(0,1,n,endpoint=False):
            out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
    return [tuple(x) for x in out]
def cr_path(pts, f=lambda p:p, closed=True):
    # catmull-rom -> cubic bezier path string
    n=len(pts); s="M%.1f %.1f"%f(pts[0])
    for i in range(n if closed else n-1):
        p0=np.array(pts[(i-1)%n]);p1=np.array(pts[i]);p2=np.array(pts[(i+1)%n]);p3=np.array(pts[(i+2)%n])
        c1=p1+(p2-p0)/6; c2=p2-(p3-p1)/6
        s+=" C%.1f %.1f %.1f %.1f %.1f %.1f"%(f(c1)+f(c2)+f(p2))
    return s+("Z" if closed else "")
if __name__=="__main__":
    cfg=json.load(open(sys.argv[1])); im=Image.open(cfg['img']).convert('RGB'); sc=3
    im=im.resize((im.width*sc,im.height*sc))
    d=ImageDraw.Draw(im,'RGBA')
    for name,pts in cfg['shapes'].items():
        closed=not name.startswith('L')
        poly=[(x*sc,y*sc) for x,y in cr(pts,closed=closed)]
        if closed: d.polygon(poly,outline=(0,255,0,255)); 
        else: d.line(poly,fill=(255,0,255,255),width=2)
        for x,y in pts: d.ellipse([x*sc-3,y*sc-3,x*sc+3,y*sc+3],fill=(255,255,0,255))
    for c in cfg.get('circles',[]):
        x,y,r=c; d.ellipse([(x-r)*sc,(y-r)*sc,(x+r)*sc,(y+r)*sc],outline=(255,0,0,255),width=2)
    if len(sys.argv)>3:
        x0,y0,x1,y1=map(int,sys.argv[3:7]); im=im.crop((x0*sc,y0*sc,x1*sc,y1*sc))
    im.save(sys.argv[2])
