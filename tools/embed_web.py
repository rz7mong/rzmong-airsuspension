#!/usr/bin/env python3
"""Bundel web/control (gzip) jadi header C supaya ESP32 bisa menyajikan kontroler lewat WiFi.

Jalankan dari root repo setiap kali web/control berubah:
    python3 tools/embed_web.py
Hasil: firmware/rzmong_airsuspension/web_assets.h
"""
import gzip, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "control"
OUT = ROOT / "firmware" / "rzmong_airsuspension" / "web_assets.h"
FILES = [
    ("/index.html", "index.html", "text/html; charset=utf-8"),
    ("/control.css", "control.css", "text/css"),
    ("/app.js", "app.js", "application/javascript"),
    ("/manifest.webmanifest", "manifest.webmanifest", "application/manifest+json"),
    ("/sw.js", "sw.js", "application/javascript"),
    ("/icons/icon.svg", "icons/icon.svg", "image/svg+xml"),
    ("/icons/icon-192.png", "icons/icon-192.png", "image/png"),
]

lines = ["// DIBUAT OTOMATIS oleh tools/embed_web.py — jangan edit manual.", "#pragma once", "#include <Arduino.h>", ""]
table = []
total = 0
for i, (url, rel, mime) in enumerate(FILES):
    data = gzip.compress((SRC / rel).read_bytes(), compresslevel=9, mtime=0)
    total += len(data)
    hexes = ",".join(f"0x{b:02x}" for b in data)
    lines.append(f"static const uint8_t WEB_{i}[] PROGMEM = {{{hexes}}};")
    table.append(f'  {{"{url}", "{mime}", WEB_{i}, {len(data)}}},')
lines += ["", "struct WebAsset { const char *path; const char *mime; const uint8_t *data; size_t len; };",
          "static const WebAsset WEB_ASSETS[] = {", *table, "};",
          f"static const size_t WEB_ASSET_COUNT = {len(FILES)};", ""]
OUT.write_text("\n".join(lines))
print(f"{OUT.relative_to(ROOT)}: {len(FILES)} file, {total} byte gzip")
