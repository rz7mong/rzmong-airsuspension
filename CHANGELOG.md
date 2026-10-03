# Catatan perubahan

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
