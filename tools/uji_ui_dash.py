#!/usr/bin/env python3
"""Uji headless tata letak DASHBOARD (default 0.4.0) terhadap tools/mock_modul.py lewat WiFi lokal.

  pip install playwright && python -m playwright install chromium
  python3 tools/uji_ui_dash.py
Jalur INTERNET (MQTT) diuji manual dengan mosquitto + tools/mock_remote.py (lihat docs/REMOTE.md).
"""
import os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
WEB_PORT, MOCK_PORT = free_port(), free_port()
MOCK_LOG = os.path.join(ROOT, "tools", ".mock_dash.log")
procs = [
    subprocess.Popen([sys.executable, "-m", "http.server", str(WEB_PORT), "--bind", "127.0.0.1"], cwd=os.path.join(ROOT, "web"),
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen([sys.executable, "-u", os.path.join(ROOT, "tools", "mock_modul.py"), str(MOCK_PORT)],
                     stdout=open(MOCK_LOG, "w"), stderr=subprocess.STDOUT),
]
time.sleep(1.2)
res = []
def ok(name, cond, extra=""):
    res.append((name, bool(cond))); print(("LULUS " if cond else "GAGAL ") + name, extra)
def log(): return open(MOCK_LOG).read()
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h, nama in ((390, 860, "HP"), (1280, 860, "desktop")):
            pg = b.new_page(viewport={"width": w, "height": h})
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"http://127.0.0.1:{WEB_PORT}/control/?layout=dash")
            pg.wait_for_timeout(800)
            ok(f"[{nama}] dashboard tampil, kartu klasik tersembunyi", pg.is_visible("#dCar") and not pg.is_visible("#presets"))
            ok(f"[{nama}] 4 gelembung tekanan", pg.locator("#dCar text").count() >= 4 or pg.locator(".d-corner").count() >= 4)
            if nama == "desktop":
                ok("[desktop] tidak ada error JS", not errs, "; ".join(errs[:3])); pg.close(); continue
            pg.click("#linkWifi"); pg.fill("#wifiHost", f"127.0.0.1:{MOCK_PORT}"); pg.click("#connect")
            pg.wait_for_timeout(4500)
            ok("layar kunci muncul", pg.is_visible("#lock"))
            pg.fill("#lockCode", "1234"); pg.click("#lockGo"); pg.wait_for_timeout(1500)
            ok("kode benar membuka dashboard", not pg.is_visible("#lock"))
            pg.click("#dPresets button[data-id='2']"); pg.wait_for_timeout(1500)
            ok("preset 3 dari dashboard terkirim", '{"cmd":"preset","id":2}' in log())
            pg.click("#dStop"); pg.wait_for_timeout(2500)
            ok("STOP dashboard terkirim", '{"cmd":"stop"}' in log())
            ok("pesan STOP hold tampil di dashboard", "STOP" in pg.inner_text("#dMsg").upper(), pg.inner_text("#dMsg"))
            pg.click("#dPresets button[data-id='1']"); pg.wait_for_timeout(2500)
            ok("preset menghapus STOP hold", "STOP" not in pg.inner_text("#dMsg").upper(), pg.inner_text("#dMsg"))
            n0 = log().count('"cmd":"preset","id":2')
            pg.click("#dUp"); pg.wait_for_timeout(1800)
            ok("SEMUA NAIK = preset Tinggi", log().count('"cmd":"preset","id":2') > n0)
            pg.click(".d-step[data-axle=front][data-d='1']"); pg.wait_for_timeout(1800)
            ok("▲ depan mengirim set (debounce 0,6 dtk)", '"cmd":"set","axle":"front"' in log(), pg.inner_text("#dPf"))
            ok("[HP] tidak ada error JS", not errs, "; ".join(errs[:3]))
            pg.close()
        b.close()
finally:
    for pr in procs: pr.terminate()
n_ok = sum(1 for _, c in res if c); n_bad = len(res) - n_ok
print(n_ok, "lulus,", n_bad, "gagal")
sys.exit(1 if n_bad else 0)
