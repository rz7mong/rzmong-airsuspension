# Sprite pixel art mobil

`python3 gen_pix.py` (butuh numpy + Pillow) menulis `web/control/cars-pixel.js`, lalu jalankan `python3 tools/embed_web.py`.

- `*_cfg.json`: titik siluet/kaca/lampu (koordinat foto) untuk model fiktif Kazeryu 8 / Kazeryu 8 Gekirin (`kaze*`), Lumora V (`lumora`), Ronin 88 (`ronin`).
  Proporsi diambil dari foto mobil stance milik IG @rzmong & @gesrexgang (dipakai dengan izin; foto tidak disimpan di repo). Nama model sengaja dikarang, tanpa merek/emblem.
- `specs.py`: skala piksel, posisi as roda, garis bahu, garis pintu, handle, lampu, kit show car per model.
- `pix.py`: rasterisasi ke grid palet terindeks (1-5 = cat yang bisa ditukar warna, 6+ = kaca/trim/lampu tetap),
  outline, rim light, lengkung spatbor (ring gelap + bibir terang) dan lapisan ruang roda terpisah.
- Velg, latar, livery, dan animasi digambar per piksel di `web/control/cars.js`.
