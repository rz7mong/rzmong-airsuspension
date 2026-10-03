#!/usr/bin/env python3
"""Uji alur web UI (kode akses, preset, STOP, manual, ganti kode, kunci 5x salah) secara headless
terhadap modul tiruan tools/mock_modul.py — tanpa ESP32.

Butuh: pip install playwright && python -m playwright install chromium
Jalankan dari root repo: python3 tools/uji_ui_mock.py
"""
import os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0)); return so.getsockname()[1]
WEB_PORT, MOCK_PORT = free_port(), free_port()
MOCK_LOG = os.path.join(ROOT, "tools", ".mock_ui.log")
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
try:
  with sync_playwright() as p:
      b = p.chromium.launch()
      pg = b.new_page(viewport={"width": 420, "height": 900})
      errs = []
      pg.on("pageerror", lambda e: errs.append(str(e)))
      pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ws://" not in m.text and "WebSocket" not in m.text and "Failed to load resource" not in m.text else None)
      pg.goto(f"http://127.0.0.1:{WEB_PORT}/control/")
      pg.wait_for_timeout(800)
      # tutup tur/onboarding kalau ada
      for sel in ["text=Lewati", "text=Tutup", "text=Mulai"]:
          if pg.locator(sel).count() and pg.locator(sel).first.is_visible():
              pg.locator(sel).first.click(); pg.wait_for_timeout(200)
      pg.click("#linkWifi")
      pg.fill("#wifiHost", f"127.0.0.1:{MOCK_PORT}")
      pg.click("#connect")
      pg.wait_for_timeout(5000)
      ok("tersambung via HTTP (WS gagal → polling)", "TERHUBUNG" in pg.inner_text("#statusText"), pg.inner_text("#statusText"))
      ok("layar kunci muncul", pg.is_visible("#lock"))
      pg.screenshot(path=os.path.join(ROOT, "tools", ".ui_1-kunci.png"))
      pg.fill("#lockCode", "0000"); pg.click("#lockGo"); pg.wait_for_timeout(1200)
      ok("kode salah ditolak", pg.is_visible("#lock") and "salah" in pg.inner_text("#lockMsg").lower(), pg.inner_text("#lockMsg"))
      pg.fill("#lockCode", "1234"); pg.click("#lockGo"); pg.wait_for_timeout(1500)
      ok("kode benar membuka kontrol", not pg.is_visible("#lock"))
      ok("peringatan kredensial default", "default" in pg.inner_text("#secWarn").lower(), pg.inner_text("#secWarn"))
      pg.click("#presets button[data-id='2']"); pg.wait_for_timeout(1500)
      log = open(MOCK_LOG).read()
      ok("preset Tinggi terkirim dengan auth", '{"cmd":"preset","id":2}' in log)
      pg.click("#stop"); pg.wait_for_timeout(2500)
      ok("STOP terkirim", '{"cmd":"stop"}' in open(MOCK_LOG).read())
      ok("fault 'STOP: pilih preset' tampil di UI", "STOP" in pg.inner_text("#fault").upper(), pg.inner_text("#fault"))
      pg.screenshot(path=os.path.join(ROOT, "tools", ".ui_2-stop.png"))
      pg.click("#presets button[data-id='1']"); pg.wait_for_timeout(2500)
      ok("pilih preset menghapus status STOP", pg.inner_text("#fault").strip() == "", pg.inner_text("#fault"))
      # manual tahan tombol ▲ (allUp)
      pg.locator(".hold[data-axle=front][data-action=fill]").scroll_into_view_if_needed(); box = pg.locator(".hold[data-axle=front][data-action=fill]").bounding_box()
      pg.mouse.move(box["x"]+box["width"]/2, box["y"]+box["height"]/2); pg.mouse.down(); pg.wait_for_timeout(600); pg.mouse.up(); pg.wait_for_timeout(1500)
      l = open(MOCK_LOG).read()
      ok("manual fill lalu stop terkirim", '"action":"fill"' in l and '"action":"stop"' in l)
      # ganti kode akses
      pg.fill("#secCur", "1234"); pg.fill("#secNew", "5678"); pg.fill("#secNew2", "5678"); pg.click("#secSave"); pg.wait_for_timeout(1500)
      ok("ganti kode akses tersimpan", "tersimpan" in pg.inner_text("#secMsg").lower(), pg.inner_text("#secMsg"))
      ok("kode tidak tampil di log UI", "5678" not in pg.inner_text("#log"))
      pg.click("#secLock"); pg.wait_for_timeout(1200)
      ok("kunci (logout) memunculkan layar kunci", pg.is_visible("#lock"))
      pg.fill("#lockCode", "1234"); pg.click("#lockGo"); pg.wait_for_timeout(1200)
      ok("kode lama ditolak setelah diganti", pg.is_visible("#lock"))
      pg.fill("#lockCode", "5678"); pg.click("#lockGo"); pg.wait_for_timeout(1200)
      ok("kode baru diterima", not pg.is_visible("#lock"))
      # lockout 5x
      pg.click("#secLock"); pg.wait_for_timeout(800)
      for i in range(5):
          pg.fill("#lockCode", "9999"); pg.click("#lockGo"); pg.wait_for_timeout(700)
      pg.wait_for_timeout(1200)
      txt = pg.inner_text("#lockMsg") + " " + pg.inner_text("#secWarn")
      ok("salah 5x → terkunci + hitung mundur", "terlalu banyak" in txt.lower() or "detik" in txt.lower(), txt)
      pg.screenshot(path=os.path.join(ROOT, "tools", ".ui_3-terkunci.png"))
      ok("tidak ada error JS", not errs, "; ".join(errs[:5]))
      b.close()

finally:
    for pr in procs: pr.terminate()
n_ok = sum(1 for _, c in res if c); n_bad = len(res) - n_ok
print(n_ok, "lulus,", n_bad, "gagal")
sys.exit(1 if n_bad else 0)
