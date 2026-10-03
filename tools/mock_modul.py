#!/usr/bin/env python3
"""Modul RZM-AIR tiruan (HTTP saja) untuk menguji alur kode akses di UI tanpa ESP32.

Jalankan: python3 tools/mock_modul.py [port]   (default 8766), lalu buka kontroler dari
`python3 -m http.server 8765` di folder web/, pilih WIFI, host 127.0.0.1:8766, Sambungkan.
WebSocket port 81 akan gagal lalu UI otomatis memakai HTTP polling. Kode default 1234.
"""
import json, http.server, time, sys
S = {"code": "1234", "btpin": 123456, "appass": "rzmong123", "preset": 1, "hold": False}
A = {}   # proteksi tebak kode per IP klien (seperti firmware ≥0.3.2): ip → {fails, level, until}
DEF = ("1234", 123456, "rzmong123")
def status(sess):
    d = {"tank":150,"front":48,"rear":46,"preset":S["preset"],"comp":False,"rise":True,"drop":False,"theme":1,"pf":50,"pr":55,"fault":"STOP: pilih preset" if S["hold"] else "","ip":"127.0.0.1","sta":False,"ble":False}
    if S["hold"]: d["hold"] = True
    if sess is not None:
        left = A.get(sess.get("ip"), {}).get("until", 0) - time.time()
        if left > 0: d["lock"] = int(left + 0.999)
        d["auth"] = sess["authed"]
        if sess["authed"]: d["def"] = S["code"]==DEF[0] or S["btpin"]==DEF[1] or S["appass"]==DEF[2]
        if sess.get("ev"): d["ev"] = sess["ev"]
    return d
def line(l, s):
    try: d = json.loads(l)
    except Exception: return
    c = d.get("cmd","")
    def check(code):  # seperti firmware: salah 5x → kunci 30 dtk, lalu tiap salah lagi 2× lebih lama (maks 15 mnt)
        a = A.setdefault(s.get("ip"), {"fails": 0, "level": 0, "until": 0})
        if a["until"] > time.time(): s["ev"]="locked"; return False
        if code == S["code"]: a.update(fails=0, level=0); return True
        a["fails"] += 1
        if a["fails"] >= 5 or a["level"] > 0:
            a["until"] = time.time() + min(30 * 2 ** min(a["level"], 5), 900); a["fails"] = 0; a["level"] += 1; s["ev"]="locked"
        else: s["ev"]="bad_code"
        return False
    if c == "auth":
        if check(d.get("code")): s["authed"]=True; s["ev"]="auth_ok"
        else: s["authed"]=False
        return
    if c == "logout": s["authed"]=False; s["ev"]="logout"; return
    if c == "security":
        if not check(d.get("code")): return
        s["authed"]=True
        if "newcode" in d: S["code"]=d["newcode"]
        if "appass" in d: S["appass"]=d["appass"]
        if "btpin" in d: S["btpin"]=int(d["btpin"])
        s["ev"]="saved"; return
    if not s["authed"] and c != "stop": s["ev"]="need_auth"; return
    if c == "stop": S["hold"]=True              # firmware ≥0.3.1: leveling berhenti sampai preset dipilih
    if c in ("preset", "set"): S["hold"]=False
    if c == "preset": S["preset"]=d.get("id",1)
    S.setdefault("log",[]).append(c)
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
    def do_GET(self):
        self.send_response(200); self.cors(); self.send_header("Content-Type","application/json"); self.end_headers()
        d = status(None)
        left = A.get(self.client_address[0], {}).get("until", 0) - time.time()
        if left > 0: d["lock"] = int(left + 0.999)
        self.wfile.write(json.dumps(d).encode())
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length",0))).decode()
        s = {"authed":False, "ip": self.client_address[0]}
        for l in body.split("\n"):
            if l.strip(): line(l.strip(), s)
        print("POST", body.replace("\n"," | "), "->", s, flush=True)
        self.send_response(200); self.cors(); self.send_header("Content-Type","application/json"); self.end_headers()
        self.wfile.write(json.dumps(status(s)).encode())
    def log_message(self,*a): pass
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766   # port lain: python3 tools/mock_modul.py 8767
http.server.HTTPServer(("127.0.0.1",PORT),H).serve_forever()
