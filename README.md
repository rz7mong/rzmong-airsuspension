# RZMONG Airsuspension

Kontroler suspensi udara 2 titik berbasis ESP32. Preset PSI, naik saat kontak hidup, turun saat kontak mati, monitor speedometer, Bluetooth, dan website kontrol.

Repo: https://github.com/rz7mong/rzmong-airsuspension

Sistem ini mengontrol tekanan, bukan tinggi mobil. Depan kiri dan kanan satu saluran. Belakang kiri dan kanan satu saluran. Satu balon bocor di satu sumbu akan mengempiskan kedua balon sumbu itu, dan monitor hanya bisa menandai sumbu yang bocor, bukan balon yang mana.

## Isi repo

- `docs/TUTORIAL.md` — cara rakit dari nol
- `docs/WIRING.md` — pin dan jalur udara
- `firmware/` — sketsa Arduino ESP32
- `docs/PROTOKOL.md` — protokol BLE & WiFi (perintah, status, endpoint)
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
   - Bluetooth: buka `web/control/` di Chrome HP/laptop, pilih BLUETOOTH, sambungkan `RZM-AIR`.
   - WiFi: sambungkan HP ke WiFi `RZMONG-AIR` (sandi `rzmong123`), buka `http://192.168.4.1/`.
   - Aplikasi Android: unduh APK dari Releases/Actions, pilih Bluetooth atau WiFi.

Halaman kontrol punya mode demo, jadi tampilan bisa dicoba tanpa modul.

## Keselamatan

Jangan pakai di jalan sebelum preset jalan aman untuk ban, fender, dan rem. Pasang sekering, relief valve tangki, dan timeout kompresor. Turun otomatis saat mati default-nya mati. Nyalakan hanya kalau preset parkir masih aman.
