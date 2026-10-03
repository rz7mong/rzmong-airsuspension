import cv2,numpy as np,sys,json
src,out=sys.argv[1],sys.argv[2]; S=np.float32(json.loads(sys.argv[3])); D=np.float32(json.loads(sys.argv[4])); W,H=map(int,sys.argv[5:7])
crop=json.loads(sys.argv[7]) if len(sys.argv)>7 else None
im=cv2.imread(src)
if crop: x0,y0,x1,y1=crop; m=np.zeros(im.shape[:2],np.uint8); m[y0:y1,x0:x1]=1; im=im*m[...,None]
flip=len(sys.argv)>8 and sys.argv[8]=="flip"
M=cv2.getPerspectiveTransform(S,D); w=cv2.warpPerspective(im,M,(W,H),flags=cv2.INTER_CUBIC)
if flip: w=cv2.flip(w,1)
cv2.imwrite(out,w)
