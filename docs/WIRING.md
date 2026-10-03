# Wiring 2 titik

## Pin ESP32

| Fungsi | Pin | Catatan |
|---|---|---|
| I2C SDA | 21 | ADS1115 |
| I2C SCL | 22 | ADS1115 |
| Isi depan | 25 | Ke IN relay 1 |
| Buang depan | 26 | Ke IN relay 2 |
| Isi belakang | 27 | Ke IN relay 3 |
| Buang belakang | 14 | Ke IN relay 4 |
| Kompresor | 13 | Ke kaki 86 relay 40 A |
| ACC | 34 | Input saja, lewat pembagi tegangan |
| Layar SCLK | 18 | GC9A01 |
| Layar MOSI | 23 | GC9A01 |
| Layar CS | 5 | GC9A01 |
| Layar DC | 16 | GC9A01 |
| Layar RST | 17 | GC9A01 |

ADS1115: A0 tangki, A1 depan, A2 belakang. ADDR ke GND, alamat 0x48.

## ACC

Jangan masukkan 12 V langsung ke GPIO. Pakai pembagi 47k dari ACC ke GPIO 34, dan 22k dari GPIO 34 ke ground. Di titik tengah harus di bawah 3,3 V saat kontak hidup. GPIO 34 tidak punya pull-up internal.

## Relay katup

Papan relay 4 kanal butuh 5 V di VCC dan JD-VCC. Lepas jumper JD-VCC kalau ground mobil berisik, lalu beri 5 V terpisah ke JD-VCC. IN aktif-low pada sebagian papan. Firmware menganggap aktif-low. Balik `RELAY_ON` kalau katup menyala saat harus mati.

Solenoid 12 V normally closed. Satu kaki ke 12 V bersekering, kaki lain ke COM relay. NO ke ground. Saat relay menarik, solenoid terbuka.

## Kompresor

- Kaki 30: aki lewat sekering, kabel sesuai arus pompa
- Kaki 87: positif kompresor
- Kaki 86: GPIO 13 lewat transistor, atau output papan kalau arus koil kecil
- Kaki 85: ground
- Bodi kompresor ke ground

Jangan menjalankan kompresor dari USB.

## Sensor

Merah 5 V, hitam ground, kuning ke A0/A1/A2. Ulir 1/8 NPT di port manifold atau di T saluran, bukan di dalam balon. Seal pita secukupnya. Jangan sampai serpihan masuk katup.
