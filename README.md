# RZMONG Airsuspension

Kontroler suspensi udara 2 titik berbasis ESP32. Preset PSI, naik saat kontak hidup, turun saat kontak mati, monitor speedometer, Bluetooth, dan website kontrol.

Repo: https://github.com/rz7mong/rzmong-airsuspension

Sistem ini mengontrol tekanan, bukan tinggi mobil. Depan kiri dan kanan satu saluran. Belakang kiri dan kanan satu saluran. Satu balon bocor di satu sumbu akan mengempiskan kedua balon sumbu itu, dan monitor hanya bisa menandai sumbu yang bocor, bukan balon yang mana.

## Isi repo

- `docs/TUTORIAL.md` — cara rakit dari nol
- `docs/WIRING.md` — pin dan jalur udara
- `firmware/` — sketsa Arduino ESP32
- `docs/PROTOKOL.md` — protokol BLE & WiFi (perintah, status, endpoint)
- `docs/EDIT-GUIDE.md` — **panduan edit & build sendiri** (tema, maskot, mobil pixel, firmware, APK, Pages, release)
- `web/index.html` — landing page
- `web/flash/` — halaman flash lewat browser (ESP Web Tools + serial monitor), `.bin` di `web/flash/firmware/`
- `web/control/` — website kontrol (PWA), BLE atau WiFi, juga dibungkus jadi aplikasi Android
- `android/` — proyek Capacitor (BLE native + WiFi) → APK debug dari GitHub Actions
- `tools/embed_web.py` — bundel `web/control` ke firmware supaya ESP32 bisa menyajikan UI lewat WiFi
- `.github/workflows/` — build firmware, APK Android, dan deploy GitHub Pages

## Jalur cepat

1. Rakit hardware sesuai `docs/WIRING.md`.
2. Paling gampang: buka halaman flash (`web/flash/`) di Chrome/Edge desktop, tekan Pasang.
   Atau Arduino IDE: board ESP32 Dev Module, **Partition Scheme: Huge APP (3MB No OTA)**, flash.
   Atau PlatformIO: `cd firmware && pio run -t upload`.
3. Kontrol lewat salah satu:
   - Bluetooth: buka `web/control/` di Chrome HP/laptop, pilih BLUETOOTH, sambungkan `RZM-AIR`. Saat pertama kali, HP minta **PIN pairing** (default `123456`).
   - WiFi: sambungkan HP ke WiFi `RZMONG-AIR` (sandi `rzmong123`), buka `http://192.168.4.1/`.
   - Aplikasi Android: unduh APK dari Releases/Actions, pilih Bluetooth atau WiFi.
4. Masukkan **kode akses** (default `1234`) saat diminta, lalu langsung ganti semua kredensial default di kartu **🔒 KEAMANAN**.

Halaman kontrol punya mode demo, jadi tampilan bisa dicoba tanpa modul.

## Keamanan akses (firmware 0.3.0+)

| Kredensial | Default | Aturan | Dipakai untuk |
|---|---|---|---|
| Kode akses | `1234` | 4–12 karakter, tanpa spasi | Membuka kontrol (preset, naik/turun, manual, setelan) lewat web, aplikasi, BLE, dan WiFi |
| Sandi WiFi `RZMONG-AIR` | `rzmong123` | 8–63 karakter (WPA2) | Masuk ke WiFi modul |
| PIN Bluetooth | `123456` | tepat 6 angka | Pairing BLE `RZM-AIR` (link terenkripsi, wajib sebelum kirim perintah) |

- **Ganti** di halaman kontrol → kartu **🔒 KEAMANAN**: isi kode akses saat ini, lalu kode baru / sandi WiFi baru / PIN baru, tekan **SIMPAN KE MODUL**.
  Sandi WiFi baru langsung berlaku (WiFi modul restart ±2 detik). Setelah PIN Bluetooth diganti, semua HP lama harus **lupakan/unpair `RZM-AIR`** lalu pairing ulang.
- Tanpa kode akses, status tetap bisa dilihat ("lihat saja"), tapi perintah kontrol ditolak. Tombol **STOP** (tutup semua katup) selalu boleh demi keselamatan.
- Salah kode 5× berturut-turut → modul menolak percobaan selama 30 detik.
- Kode, sandi, dan PIN tidak pernah dikirim balik di status JSON.
- **Lupa kode?** Saat modul menyala, **tahan tombol BOOT (GPIO0) 8 detik**. LED biru berkedip makin cepat, layar bulat dan Serial Monitor menghitung mundur;
  lepas sebelum 8 detik = batal. Yang direset hanya kode akses, sandi WiFi AP, PIN Bluetooth, dan daftar HP yang sudah pairing. Kalibrasi sensor, preset, dan WiFi router tetap.
  Jangan tahan BOOT ketika baru menyalakan modul (itu masuk mode flash).

Detail: `docs/EDIT-GUIDE.md` bagian 10 dan `docs/PROTOKOL.md`.

## Keselamatan

Jangan pakai di jalan sebelum preset jalan aman untuk ban, fender, dan rem. Pasang sekering, relief valve tangki, dan timeout kompresor. Turun otomatis saat mati default-nya mati. Nyalakan hanya kalau preset parkir masih aman.
