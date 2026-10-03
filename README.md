# RZMON-G Air Suspension

Kontroler suspensi udara 2 titik berbasis ESP32. Preset PSI, naik saat kontak hidup, turun saat kontak mati, monitor speedometer, Bluetooth, dan website kontrol.

Repo: https://github.com/rz7mong/rzmong-airsuspension

Sistem ini mengontrol tekanan, bukan tinggi mobil. Depan kiri dan kanan satu saluran. Belakang kiri dan kanan satu saluran. Satu balon bocor di satu sumbu akan mengempiskan kedua balon sumbu itu, dan monitor hanya bisa menandai sumbu yang bocor, bukan balon yang mana.

## Isi repo

- `docs/TUTORIAL.md` — cara rakit dari nol
- `docs/WIRING.md` — pin dan jalur udara
- `firmware/` — sketsa Arduino ESP32
- `web/flash/` — halaman flash lewat browser
- `web/control/` — website kontrol, juga dipakai sebagai aplikasi HP
- `web/manifest.json` — manifes firmware untuk ESP Web Tools

## Jalur cepat

1. Rakit hardware sesuai `docs/WIRING.md`.
2. Buka `firmware/rzmong_airsuspension/rzmong_airsuspension.ino` di Arduino IDE, pilih board ESP32 Dev Module, flash.
3. Atau bangun file `.bin`, taruh di `web/firmware/`, lalu buka halaman flash.
4. Buka `web/control/index.html` di Chrome HP atau laptop. Sambungkan Bluetooth `RZM-AIR`.

Halaman kontrol punya mode demo, jadi tampilan bisa dicoba tanpa modul.

## Keselamatan

Jangan pakai di jalan sebelum preset jalan aman untuk ban, fender, dan rem. Pasang sekering, relief valve tangki, dan timeout kompresor. Turun otomatis saat mati default-nya mati. Nyalakan hanya kalau preset parkir masih aman.
