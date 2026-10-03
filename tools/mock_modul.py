#!/usr/bin/env python3
"""Modul RZM-AIR tiruan (HTTP saja) untuk menguji alur kode akses di UI tanpa ESP32.

Jalankan: python3 tools/mock_modul.py   (port 8766), lalu buka kontroler dari
`python3 -m http.server 8765` di folder web/, pilih WIFI, host 127.0.0.1:8766, Sambungkan.
WebSocket port 81 akan gagal lalu UI otomatis memakai HTTP polling. Kode default 1234.
"""
import json, http.server
S = {"code": "1234", "btpin": 123456, "appass": "rzmong123", "preset": 1, "fails": 0}
DEF = ("1234", 123456, "rzmong123")
def status(sess):
    d = {"tank":150,"front":48,"rear":46,"preset":S["preset"],"comp":False,"rise":True,"drop":False,"theme":1,"pf":50,"pr":55,"fault":"","ip":"127.0.0.1","sta":False,"ble":False}
    if sess is not None:
        d["auth"] = sess["authed"]
        if sess["authed"]: d["def"] = S["code"]==DEF[0] or S["btpin"]==DEF[1] or S["appass"]==DEF[2]
        if sess.get("ev"): d["ev"] = sess["ev"]
    return d
def line(l, s):
    try: d = json.loads(l)
    except Exception: return
    c = d.get("cmd","")
    if c == "auth":
        if d.get("code") == S["code"]: s["authed"]=True; s["ev"]="auth_ok"
        else: s["authed"]=False; s["ev"]="bad_code"
        return
    if c == "security":
        if d.get("code") != S["code"]: s["ev"]="bad_code"; return
        s["authed"]=True
        if "newcode" in d: S["code"]=d["newcode"]
        if "appass" in d: S["appass"]=d["appass"]
        if "btpin" in d: S["btpin"]=int(d["btpin"])
        s["ev"]="saved"; return
    if not s["authed"] and c != "stop": s["ev"]="need_auth"; return
    if c == "preset": S["preset"]=d.get("id",1)
    S.setdefault("log",[]).append(c)
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
    def do_GET(self):
        self.send_response(200); self.cors(); self.send_header("Content-Type","application/json"); self.end_headers()
        self.wfile.write(json.dumps(status(None)).encode())
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length",0))).decode()
        s = {"authed":False}
        for l in body.split("\n"):
            if l.strip(): line(l.strip(), s)
        print("POST", body.replace("\n"," | "), "->", s, flush=True)
        self.send_response(200); self.cors(); self.send_header("Content-Type","application/json"); self.end_headers()
        self.wfile.write(json.dumps(status(s)).encode())
    def log_message(self,*a): pass
http.server.HTTPServer(("127.0.0.1",8766),H).serve_forever()
