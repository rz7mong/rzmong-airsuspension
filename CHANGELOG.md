# Catatan perubahan

## 0.4.0 — 2026-10-04 (dasar: 0.3.2)
- **Dashboard** baru (default): mobil tampak atas dengan tekanan 4 sudut, gauge tangki, preset 1–3, ▲/▼ per as,
  SEMUA NAIK/TURUN, STOP, status koneksi. Tema baru **Karbon Pro**. Tata letak klasik & 4 tema lama tetap ada (`?layout=classic`).
- **Remote internet (MQTT lewat TLS)**, MATI secara default, diatur di kartu KEAMANAN → REMOTE INTERNET (hanya dari
  BLE/WiFi lokal, wajib kode akses ≠ 1234). Web/app tersambung lewat MQTT WSS (bisa dari GitHub Pages & aplikasi).
- Perintah remote ditandatangani HMAC-SHA256 (kunci = kode akses), nonce per koneksi + nomor urut (anti-replay).
  Salah tanda tangan dihitung **per id klien remote** dengan aturan 0.3.2 (5× → 30 dtk, bertingkat s/d 15 mnt), kolam slot
  terpisah dari Bluetooth/WiFi lokal. STOP tanpa tanda tangan selalu diterima dan memakai jalur STOP lokal (hold tersimpan di NVS).
- Ditolak lewat remote: ganti keamanan/WiFi/remote, isi/buang manual.
- Klien MQTT di task FreeRTOS terpisah (core 0) → loop katup tidak pernah menunggu internet.
- `tools/mock_remote.py`, `tools/uji_ui_dash.py`, tes host remote, `docs/REMOTE.md` (panduan broker EMQX gratis).

## 0.3.2 — 2026-10-04
- **Kunci salah kode per klien.** Bluetooth punya hitungan sendiri, klien WiFi dihitung per alamat IP (HTTP + WebSocket
  berbagi). Penyerang di WiFi tidak bisa lagi mengunci pemilik di Bluetooth / IP lain. Kunci bertingkat 30 dtk → 15 mnt,
  reset saat kode benar atau 15 menit tanpa salah. Tabel 8 IP tidak bisa dikosongkan dengan berganti-ganti IP.
- `GET /api/status` membawa sisa kunci (`lock`) milik IP peminta.
- **STOP disimpan di flash**: tetap aktif setelah listrik putus / restart / watchdog sampai preset dipilih.
- Preset/otomatis/tema hanya ditulis ke flash kalau nilainya berubah (mengurangi keausan).
- Perintah lama `{"cmd":"wifi","appass":…}` sekarang wajib membawa kode akses saat ini (sama seperti `security`).
- Validasi `{"cmd":"wifi","ssid":…}`: SSID ≤32, sandi kosong atau 8–63.
- `mock_modul.py` meniru kunci per IP + bertingkat.

## 0.3.1 — 2026-10-04
- ADS1115 lepas / tidak ada tidak lagi membuat firmware macet (baca dengan timeout, katup & kompresor mati, coba ulang).
- Watchdog loop 5 detik.
- STOP benar-benar menahan katup (leveling berhenti sampai preset dipilih).
- Manual ▲/▼ bekerja; menutup sendiri saat dilepas, koneksi putus, 20 dtk, atau batas tekanan.
- Timeout bocor 90 dtk dikunci; timeout buang 90 dtk; batas kompresor 10 menit.
- Sensor putus/korslet (di luar 0,25–4,75 V) terdeteksi.
- Balapan data buffer BLE diperbaiki (mutex).
- NVS rusak tidak bisa membuat indeks preset di luar batas; debounce ACC 0,5 dtk; GPIO0 macet LOW tidak mereset kredensial.
- Dokumen wiring: pembagi ACC 100k/27k.
- Simulasi host (`firmware/test_host/run.sh`), uji boot QEMU (`qemu.sh`), uji UI headless (`tools/uji_ui_mock.py`).

## 0.3.0
- Kode akses, sandi WiFi AP, PIN Bluetooth, reset kredensial tombol BOOT.
