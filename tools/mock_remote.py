#!/usr/bin/env python3
"""Modul RZM-AIR tiruan untuk jalur INTERNET (MQTT) — uji dashboard & remote tanpa ESP32.

Meniru firmware 0.4.0: topik rzm/<id>/status|online|cmd|evt, tanda tangan HMAC-SHA256 (kunci = kode akses),
nonce per koneksi broker, nomor urut anti-replay, kunci 30 dtk setelah 5x salah, STOP tanpa tanda tangan,
isi/buang manual ditolak, pengaturan keamanan/WiFi/remote ditolak (local_only), telemetri live/lambat.

Butuh:  pip install "paho-mqtt>=2"   dan broker lokal, mis. mosquitto dengan listener websockets:
    # mosquitto-test.conf
    listener 1883 127.0.0.1
    listener 9001 127.0.0.1
    protocol websockets
    allow_anonymous true
    mosquitto -c mosquitto-test.conf

Jalankan:
    python3 tools/mock_remote.py --broker 127.0.0.1 --port 1883 --id 0011223344aa-deadbeef --code 5678
Lalu buka kontroler (python3 -m http.server 8765 di folder web/), pilih INTERNET,
host  ws://127.0.0.1:9001  , ID perangkat 0011223344aa-deadbeef, Sambungkan, kode 5678.
Opsi: --user/--password (broker ber-sandi), --tls (port 8883, mis. HiveMQ Cloud), --fault "depan bocor".
"""
import argparse, hashlib, hmac, json, os, random, ssl, threading, time

import paho.mqtt.client as mqtt

ap = argparse.ArgumentParser()
ap.add_argument("--broker", default="127.0.0.1")
ap.add_argument("--port", type=int, default=1883)
ap.add_argument("--tls", action="store_true")
ap.add_argument("--user")
ap.add_argument("--password")
ap.add_argument("--id", default="0011223344aa-deadbeef")
ap.add_argument("--code", default="5678")
ap.add_argument("--fault", default="")
a = ap.parse_args()

BAG_MIN, BAG_MAX, DEADBAND, TANK_ON, TANK_OFF = 15, 110, 2, 145, 165
S = {"tank": 158.0, "front": 32.0, "rear": 30.0, "preset": 1, "comp": False, "rise": True, "drop": False, "theme": 1,
     "fault": a.fault, "acc": True, "hold": False}
presets = [[25, 25], [50, 55], [75, 80]]
lock = threading.Lock()
clients = {}   # id klien remote → hitungan salah kode
sess = {"nonce": "", "lastq": 0, "live_until": 0.0, "force": True}
base = f"rzm/{a.id}/"
T = {k: base + k for k in ("status", "online", "cmd", "evt")}
valves = {"fillF": False, "dumpF": False, "fillR": False, "dumpR": False}


def status():
    with lock:
        d = {"tank": round(S["tank"]), "front": round(S["front"]), "rear": round(S["rear"]), "preset": S["preset"],
             "comp": S["comp"], "rise": S["rise"], "drop": S["drop"], "theme": S["theme"], "pf": presets[S["preset"]][0],
             "pr": presets[S["preset"]][1], "fault": S["fault"] or ("STOP: pilih preset" if S["hold"] else ""), "acc": S["acc"], "rm": 3}
        if S["hold"]: d["hold"] = True   # firmware ≥0.3.1: STOP menahan leveling sampai preset/target dipilih
    d.update({"n": sess["nonce"], "q": sess["lastq"], "fw": "0.4.0-mock", "sta": True})
    return d


def event(cl, ev, rid):
    cl.publish(T["evt"], json.dumps({"ev": ev, "r": rid or "", "q": sess["lastq"]}, separators=(",", ":")))
    print(f"  ev → {ev}", flush=True)


def handle_line(d):
    c = d.get("cmd")
    with lock:
        if c == "preset":
            S["preset"] = max(0, min(2, int(d.get("id", 1)))); S["fault"] = ""; S["hold"] = False
        elif c == "set":
            ax = 0 if d.get("axle", "front") == "front" else 1
            presets[S["preset"]][ax] = max(BAG_MIN, min(BAG_MAX, int(d.get("psi", 40)))); S["hold"] = False
        elif c == "auto":
            S["rise"] = bool(d.get("rise", S["rise"])); S["drop"] = bool(d.get("drop", S["drop"]))
        elif c == "theme":
            S["theme"] = max(0, min(2, int(d.get("id", 1))))
        elif c == "manual":
            pass  # hanya action=stop yang sampai sini
        elif c == "stop":
            for k in valves: valves[k] = False
            S["hold"] = True
    return None


def on_message(cl, _ud, msg):
    raw = msg.payload.decode("utf-8", "replace")
    if raw.startswith("{"):
        try: d = json.loads(raw)
        except Exception: return
        if d.get("cmd") == "stop":
            print("STOP (tanpa tanda tangan)", flush=True); handle_line(d); event(cl, "stop_ok", d.get("r")); sess["force"] = True
        elif d.get("cmd") == "live":
            sess["live_until"] = time.time() + 60
        return
    if len(raw) < 67 or raw[64] != " ":
        return
    sig, body = raw[:64], raw[65:]
    try: d = json.loads(body)
    except Exception: return
    rid = d.get("r", "")
    if d.get("n") != sess["nonce"] or int(d.get("q", 0)) <= sess["lastq"]:
        return event(cl, "stale", rid)
    # seperti firmware ≥0.4.0: salah kode dihitung PER id klien "c"; 5x → 30 dtk, lalu tiap salah 2× lebih lama (maks 15 mnt)
    sl = clients.setdefault(str(d.get("c", ""))[:24], {"fails": 0, "level": 0, "until": 0.0})
    if sl["until"] > time.time():
        return event(cl, "locked", rid)
    want = hmac.new(a.code.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, sig):
        sl["fails"] += 1
        if sl["fails"] >= 5 or sl["level"] > 0:
            sl["until"] = time.time() + min(30 * 2 ** min(sl["level"], 5), 900); sl["fails"] = 0; sl["level"] += 1
            return event(cl, "locked", rid)
        return event(cl, "bad_code", rid)
    sl.update(fails=0, level=0); sess["lastq"] = int(d["q"]); sess["live_until"] = time.time() + 60; sess["force"] = True
    c = d.get("cmd", "")
    print(f"perintah OK: {body}", flush=True)
    if c in ("security", "wifi", "remote", "rinfo"): return event(cl, "local_only", rid)
    if c == "manual" and d.get("action", "stop") != "stop": return event(cl, "no_manual_remote", rid)
    if c in ("auth", "logout"): return event(cl, "auth_ok" if c == "auth" else "logout", rid)
    handle_line(d)
    event(cl, "ok", rid)


def on_connect(cl, _ud, _flags, rc, _props=None):
    if rc != 0:
        print("broker menolak:", rc, flush=True); return
    sess["nonce"] = "%016x" % random.getrandbits(64); sess["lastq"] = 0; sess["force"] = True
    cl.subscribe(T["cmd"], qos=1)
    cl.publish(T["online"], "1", qos=1, retain=True)
    print(f"ONLINE {base}…  nonce {sess['nonce']}  kode {a.code}", flush=True)


cl = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="rzm-" + a.id + "-mock")
if a.user: cl.username_pw_set(a.user, a.password)
if a.tls: cl.tls_set(cert_reqs=ssl.CERT_REQUIRED)
cl.will_set(T["online"], "0", qos=1, retain=True)
cl.on_connect = on_connect
cl.on_message = on_message
cl.reconnect_delay_set(2, 60)
cl.connect_async(a.broker, a.port, keepalive=30)
cl.loop_start()

last_pub, last_sig = 0.0, ""
try:
    while True:
        time.sleep(0.05)
        with lock:  # fisika sederhana sama seperti mode demo UI
            for ax, key in (("front", "F"), ("rear", "R")):
                tgt = presets[S["preset"]][0 if ax == "front" else 1]
                fill = not S["hold"] and S[ax] < tgt - DEADBAND and S["tank"] > S[ax] + 5
                dump = not S["hold"] and S[ax] > tgt + DEADBAND
                if fill: S[ax] += 0.45; S["tank"] -= 0.12
                if dump: S[ax] -= 0.6
                valves["fill" + key], valves["dump" + key] = fill, dump
            if S["tank"] < TANK_ON: S["comp"] = True
            if S["tank"] > TANK_OFF: S["comp"] = False
            S["tank"] += 0.3 if S["comp"] else -0.004
        if not cl.is_connected():
            continue
        now = time.time()
        live = sess["live_until"] > now
        d = status(); sig = json.dumps(d, sort_keys=True)
        due = sess["force"] or (sig != last_sig and (live and now - last_pub >= 1 or now - last_pub >= 30)) or now - last_pub >= 300
        if due:
            d.update({"up": int(now) % 100000, "rssi": -58, "heap": 92})
            cl.publish(T["status"], json.dumps(d, separators=(",", ":")), retain=True)
            last_pub, last_sig, sess["force"] = now, sig, False
except KeyboardInterrupt:
    cl.publish(T["online"], "0", qos=1, retain=True).wait_for_publish(2)
    cl.disconnect()
