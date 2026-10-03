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

Jangan masukkan 12 V langsung ke GPIO. Pakai pembagi **100k dari ACC ke GPIO 34, dan 27k dari GPIO 34 ke ground**.
Saat mesin hidup tegangan aki bisa 14,4 V (lonjakan lebih tinggi), jadi titik tengah harus tetap di bawah 3,3 V:
14,4 V → 3,06 V, 12 V → 2,55 V. Ambang firmware (`analogRead > 2500`, ±2,1 V) setara ±10 V di ACC.
Tambahkan kapasitor 100 nF dari GPIO 34 ke ground, dan idealnya dioda zener 3,3 V paralel untuk meredam lonjakan.
GPIO 34 tidak punya pull-up internal.

> Catatan: pembagi lama 47k/22k memberi 3,8 V di 12 V dan 4,6 V di 14,4 V — melebihi batas GPIO ESP32 (3,6 V). Ganti resistornya.

Firmware mengabaikan perubahan ACC yang lebih singkat dari 0,5 detik (`ACC_DEBOUNCE_MS`), jadi tegangan drop saat starter
tidak memicu "turun otomatis".

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

Merah 5 V, hitam ground, kuning ke A0/A1/A2. ADS1115 tidak boleh menerima tegangan input di atas VDD+0,3 V:
kalau ADS1115 diberi 3,3 V, sinyal sensor 0,5–4,5 V harus lewat pembagi, atau beri ADS1115 VDD 5 V (cek modul I2C-nya aman
untuk ESP32). Sinyal di luar 0,25–4,75 V dianggap sensor putus/korslet dan katup as itu tidak dijalankan. Ulir 1/8 NPT di port manifold atau di T saluran, bukan di dalam balon. Seal pita secukupnya. Jangan sampai serpihan masuk katup.
