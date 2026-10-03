# Jiplakan mobil dari foto

Pipeline untuk `web/control/cars-traced.js` (foto sumber TIDAK disimpan di repo; dari IG @rzmong & @gesrexgang, dipakai dengan izin).

1. Foto samping dirapikan: `fd.png` = rzmong-3 dicerminkan; Zenix/Accord dikoreksi perspektif dengan `warp.py`
   (homografi dari titik atas/bawah ban depan & belakang ke persegi panjang).
   - Zenix: `warp.py gesrexgang-4.png zxw.png "[[179.5,157],[179.5,252],[405,117],[405,179]]" "[[140,155],[140,245],[470,155],[470,245]]" 640 300 "[0,25,451,245]"`
   - Accord: `warp.py gesrexgang-2.png acw.png "[[72,357],[72,409],[210,370],[210,426]]" "[[160,155],[160,245],[532,155],[532,245]]" 700 290 "[0,285,479,440]"`
2. Siluet bodi, kaca, spion, lampu dijiplak manual (titik Catmull-Rom di `*_cfg.json`, dicek dengan overlay `sil.py`).
3. `mk.py <cfg> <out>`: lapisan gelap/terang + garis panel dari luminans foto (potrace) di dalam siluet, tanpa roda/watermark.
4. `gen.py` menulis `web/control/cars-traced.js`, lalu `python3 tools/embed_web.py`.
