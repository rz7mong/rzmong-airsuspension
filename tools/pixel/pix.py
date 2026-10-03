import json, math, numpy as np
from PIL import Image, ImageDraw
import sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from sil import cr
CH="0123456789abcdefghijk"
SS=4
def poly_mask(pts,W,H,smooth=True,closed=True):
    im=Image.new('L',(W*SS,H*SS),0); d=ImageDraw.Draw(im)
    P=cr(pts,10) if smooth else pts
    d.polygon([(x*SS,y*SS) for x,y in P],fill=255)
    a=np.array(im,dtype=np.float32).reshape(H,SS,W,SS).mean(axis=(1,3))
    return a>127
def line_px(pts,W,H,smooth=True):
    # 1px polyline (supersampled thin line -> pixels touched by centerline)
    P=cr(pts,12,closed=False) if smooth and len(pts)>2 else pts
    out=set()
    for (x0,y0),(x1,y1) in zip(P[:-1],P[1:]):
        n=int(max(abs(x1-x0),abs(y1-y0))*3)+1
        for t in np.linspace(0,1,n):
            x=x0+(x1-x0)*t; y=y0+(y1-y0)*t
            out.add((int(math.floor(x)),int(math.floor(y))))
    m=np.zeros((H,W),bool)
    for x,y in out:
        if 0<=x<W and 0<=y<H: m[y,x]=True
    return m
def build(spec):
    k=spec['k']; R=spec['R']; aR=spec.get('archR',R+2)
    rx,ry=spec['axleR']; fx,fy=spec['axleF']
    # map so rear axle center -> pixel center (cx+.5)
    pad=6
    allpts=[p for key in ('body',) for p in spec[key]]+list(spec.get('extra_bounds',[]))
    minx=min(p[0] for p in allpts)*k; miny=min(p[1] for p in allpts)*k
    maxx=max(p[0] for p in allpts)*k; maxy=max(p[1] for p in allpts)*k
    cxR=int(round(rx*k-minx))+pad; wb=int(round((fx-rx)*k)); cxF=cxR+wb
    offx=cxR+.5-rx*k
    top=int(math.floor(miny))-pad
    cy=int(round(ry*k))-top  # wheel center row
    offy=cy+.5-ry*k
    W=int(math.ceil(maxx+offx))+pad; H=cy+R+2
    T=lambda pts:[(x*k+offx,y*k+offy) for x,y in pts]
    g=np.zeros((H,W),np.int16)
    body0=poly_mask(T(spec['body']),W,H)
    yy,xx=np.mgrid[0:H,0:W]; pcx=xx+.5; pcy=yy+.5
    dR=np.hypot(pcx-(cxR+.5),pcy-(cy+.5)); dF=np.hypot(pcx-(cxF+.5),pcy-(cy+.5))
    hole=(dR<aR)|(dF<aR)
    body=body0&~hole
    # base shading by row bands defined in photo y
    Y=lambda v: v*k+offy
    g[body]=3
    belt=Y(spec['belt']); low=Y(spec['low'])
    g[body&(pcy<belt)]=4
    g[body&(pcy>low)]=2
    if 'shoulder' in spec:
        sh=line_px(T(spec['shoulder']),W,H)&body; g[sh]=5
        # light band right above the shoulder line
        up=np.roll(sh,-1,axis=0)&body&(g==3); g[up]=4
    for key,idx in (('dark',2),('trim',10),('chrome',9),('rubber',17)):
        for p in spec.get(key,[]):
            m=poly_mask(T(p),W,H,smooth=False)&body; g[m]=idx
    # glass
    gl=None
    if 'glass' in spec:
        gl=poly_mask(T(spec['glass']),W,H)&body
        g[gl]=6
        # top rows lighter (sky), streaks
        rows=np.where(gl.any(axis=1))[0]
        if len(rows):
            r0=rows[0]
            g[gl&(yy<=r0+1)]=7
            for sx,wd in spec.get('streaks',[]):
                m=gl&((xx+yy*spec.get('slant',0.9)-sx*k-offx)>=0)&((xx+yy*spec.get('slant',0.9)-sx*k-offx)<wd)
                g[m]=8
        for x0,x1 in spec.get('pillars',[]):
            m=gl&(pcx>=x0*k+offx)&(pcx<x1*k+offx); g[m]=10
    if 'wind' in spec:
        wm=poly_mask(T(spec['wind']),W,H,smooth=False)&body; g[wm]=6
        wt=wm&~np.roll(wm,1,axis=0); g[wt]=7
    # dither bands: checker at region boundaries (mid->dark, light->mid)
    chk=((xx+yy)%2==0)

    if 'refl' in spec:
        r0,r1=[int(Y(v)) for v in spec['refl']]
        band=body&(yy>=r0)&(yy<=r1)&(g==3); g[band]=4
        g[body&(yy==r1+1)&chk&(g==3)]=4
        g[body&(yy==r0-1)&chk&(g==3)]=4
    for key,idx in (('lines',2),('olines',1),('hlines',5),('chromelines',9)):
        for l in spec.get(key,[]):
            m=line_px(T(l),W,H)&body&(g!=6)&(g!=7)&(g!=8); g[m]=idx
    for (x,y,idx) in spec.get('dots',[]):
        X=int(math.floor(x*k+offx)); Yy=int(math.floor(y*k+offy))
        if 0<=X<W and 0<=Yy<H and body[Yy,X]: g[Yy,X]=idx
    for key in ('mirror',):
        if key in spec:
            m=poly_mask(T(spec[key]),W,H)
            g[m]=3; body=body|m
            # top highlight
            top_=m&~np.roll(m,1,axis=0); g[top_]=4
            mn=np.zeros_like(m)
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)): mn|=~np.roll(np.roll(m,dy,axis=0),dx,axis=1)
            g[m&mn]=1
            mirror_m=m
    # outline pass on body (exterior edge + arch edge)
    solid=body.copy()
    nb=np.zeros_like(solid)
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nb|=~np.roll(np.roll(solid,dy,axis=0),dx,axis=1)
    edge=solid&nb
    g[edge]=1
    # rim light: top surfaces right under the outline
    up_edge=np.roll(edge,1,axis=0)&solid&~edge&(g!=6)&(g!=7)&(g!=8)
    g[up_edge]=5
    # window frame outline
    if gl is not None:
        gnb=np.zeros_like(gl)
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)): gnb|=~np.roll(np.roll(gl,dy,axis=0),dx,axis=1)
        ge=gl&gnb&~edge; g[ge]=1
    # arch lip highlight ring
    for d in (dR,dF):
        ring=body&~edge&(d>=aR)&(d<aR+1.2); g[ring]=1
        ring2=body&~edge&(d>=aR+1.2)&(d<aR+2.3)&(g!=6); g[ring2]=4
    # lights
    for key,idx,inner in (('head',11,12),('tail',13,14)):
        for p in spec.get(key,[]):
            m=poly_mask(T(p),W,H,smooth=False)
            g[m&solid]=idx
            # edge pixels of the lamp -> inner/dark tone for definition
            e=m&solid
            enb=np.zeros_like(e)
            for dx,dy in ((0,1),):
                enb|=~np.roll(np.roll(e,dy,axis=0),dx,axis=1)
            g[e&enb]=inner
            lo=np.zeros_like(e)
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)): lo|=np.roll(np.roll(e,dy,axis=0),dx,axis=1)
            ring=lo&~e&solid&(g!=1)&(g!=idx)&(g!=inner)
            if spec.get('lampring',True): g[ring]=10
    for (x,y,idx) in spec.get('post',[]):
        X=int(math.floor(x*k+offx)); Yy=int(math.floor(y*k+offy))
        if 0<=X<W and 0<=Yy<H: g[Yy,X]=idx
    # well layer
    well=np.zeros((H,W),np.int16)
    sill=Y(spec['sill'])
    wm=hole&body0&(pcy<sill)
    well[wm]=15
    for d in (dR,dF):
        well[wm&(d>aR-1.6)]=16
    meta=dict(w=W,h=H,xr=cxR,xf=cxF,cy=cy,R=R,arch=aR,sill=int(sill),
              head=[int(spec['headpt'][0]*k+offx),int(spec['headpt'][1]*k+offy)],
              fx=int(max(p[0] for p in T(spec['body']))), x0=int(min(p[0] for p in T(spec['body']))),
              belt=int(belt), low=int(low))
    for e in spec.get('extras',[]):
        idx=e['idx']
        if e.get('line'):
            m=line_px(T(e['pts']),W,H,smooth=False)
        else:
            m=poly_mask(T(e['pts']),W,H,smooth=False)
        if e.get('inglass') and gl is not None: m&=gl
        g[m]=idx
        if e.get('outline'):
            on=np.zeros_like(m)
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)): on|=~np.roll(np.roll(m,dy,axis=0),dx,axis=1)
            g[m&on]=1
            g[m&~on&~np.roll(m,1,axis=0)]=e.get('top',idx)
    return g,well,meta
def enc(g): return "|".join("".join(CH[v] for v in row) for row in g)
PAL={1:"#15161b",2:"#7d8087",3:"#a9acb2",4:"#cfd2d7",5:"#f2f4f6",6:"#0d1320",7:"#1f2c44",8:"#7e98bb",9:"#d3dae3",10:"#16171c",11:"#f6fbff",12:"#9fd4ff",13:"#ff2b3d",14:"#9a1020",15:"#07080b",16:"#1e2026",17:"#2b2e35",18:"#ffb02e",19:"#ffd21f",20:"#22252c"}
def preview(g,well,meta,path,scale=6,photo=None):
    H,W=g.shape; im=Image.new('RGB',(W,H),(14,16,24)); px=im.load()
    for y in range(H):
        for x in range(W):
            if well[y,x]: px[x,y]=Image.new('RGB',(1,1),PAL[well[y,x]]).getpixel((0,0))
    d=ImageDraw.Draw(im)
    for cx in (meta['xr'],meta['xf']):
        c=meta['cy']; R=meta['R']
        d.ellipse([cx-R+.5,c-R+.5,cx+R+.5,c+R+.5],fill=(30,32,38))
        d.ellipse([cx-9+.5,c-9+.5,cx+9+.5,c+9+.5],fill=(200,170,90))
    for y in range(H):
        for x in range(W):
            if g[y,x]: px[x,y]=Image.new('RGB',(1,1),PAL[g[y,x]]).getpixel((0,0))
    im=im.resize((W*scale,H*scale),Image.NEAREST)
    if photo:
        ph=Image.open(photo).convert('RGB'); ph=ph.resize((im.width,int(ph.height*im.width/ph.width)))
        out=Image.new('RGB',(im.width,im.height+ph.height+10),(0,0,0)); out.paste(ph,(0,0)); out.paste(im,(0,ph.height+10)); im=out
    im.save(path)
