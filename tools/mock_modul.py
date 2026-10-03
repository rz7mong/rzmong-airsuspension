#!/usr/bin/env python3
"""Modul RZM-AIR tiruan (HTTP saja) untuk menguji alur kode akses di UI tanpa ESP32.

Jalankan: python3 tools/mock_modul.py [port]   (default 8766), lalu buka kontroler dari
`python3 -m http.server 8765` di folder web/, pilih WIFI, host 127.0.0.1:8766, Sambungkan.
WebSocket port 81 akan gagal lalu UI otomatis memakai HTTP polling. Kode default 1234.
Firmware 0.4.0: juga meniru {"cmd":"remote",...} (atur remote internet) dan {"cmd":"rinfo"} → field rm/rid/ron.
Untuk menguji jalur INTERNET (MQTT) pakai tools/mock_remote.py.
"""
import json, http.server, time, sys
S = {"code": "1234", "btpin": 123456, "appass": "rzmong123", "preset": 1, "fails": 0, "lock_until": 0, "hold": False,
     "rm_on": False, "rm_host": "", "rm_id": "0011223344aa-deadbeef"}
DEF = ("1234", 123456, "rzmong123")
def status(sess):
    d = {"tank":150,"front":48,"rear":46,"preset":S["preset"],"comp":False,"rise":True,"drop":False,"theme":1,"pf":50,"pr":55,"fault":"STOP: pilih preset" if S["hold"] else "","ip":"127.0.0.1","sta":False,"ble":False,
         "acc":True,"rm":(3 if S["rm_on"] else 0)}
    if S["hold"]: d["hold"] = True
    left = S["lock_until"] - time.time()
    if left > 0: d["lock"] = int(left + 0.999)
    if sess is not None:
        d["auth"] = sess["authed"]
        if sess["authed"]: d["def"] = S["code"]==DEF[0] or S["btpin"]==DEF[1] or S["appass"]==DEF[2]
        if sess.get("ev"): d["ev"] = sess["ev"]
        if sess.get("info") and sess["authed"]: d["rid"] = S["rm_id"]; d["ron"] = S["rm_on"]
    return d
def line(l, s):
    try: d = json.loads(l)
    except Exception: return
    c = d.get("cmd","")
    def check(code):  # sama dengan firmware: salah 5x → kunci 30 dtk
        if S["lock_until"] > time.time(): s["ev"]="locked"; return False
        if code == S["code"]: S["fails"]=0; return True
        S["fails"] += 1
        if S["fails"] >= 5: S["fails"]=0; S["lock_until"]=time.time()+30; s["ev"]="locked"
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
    if c == "remote":  # host/user/sandi broker disimpan, tidak pernah dikirim balik
        if not check(d.get("code")): return
        s["authed"]=True
        if d.get("on") and S["code"] == DEF[0]: s["ev"]="rm_default_code"; return
        if d.get("on") and not d.get("host"): s["ev"]="bad_remote"; return
        S["rm_on"]=bool(d.get("on")); S["rm_host"]=d.get("host","")
        s["ev"]="saved"; s["info"]=True; return
    if not s["authed"] and c != "stop": s["ev"]="need_auth"; return
    if c == "rinfo": s["info"]=True; return
    if c == "stop": S["hold"]=True              # firmware ≥0.3.1: leveling berhenti sampai preset dipilih
    if c in ("preset", "set"): S["hold"]=False
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
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766   # port lain: python3 tools/mock_modul.py 8767
http.server.HTTPServer(("127.0.0.1",PORT),H).serve_forever()
