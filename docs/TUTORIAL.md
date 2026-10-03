# Tutorial rakit RZMON-G Air Suspension

Target: kontroler 2 titik, tampilan speedometer, tiga preset PSI, naik saat ACC hidup, turun saat ACC mati kalau menu otomatis dinyalakan, plus HP.

Perkakas: obeng, tang, solder, multimeter, Arduino IDE 2.x.

## 1. Hardware

Versi hemat, tanpa remote fisik:

| Barang | Jumlah | Catatan |
|---|---|---|
| ESP32 DevKit 30 pin, chip CP2102 | 1 | Hindari CH340 kalau Bluetooth akan dipakai |
| Sensor 0–200 psi, 5 V, output 0,5–4,5 V, 1/8 NPT | 3 | Tangki, depan, belakang |
| ADS1115 | 1 | Jangan pakai ADC internal ESP32 |
| Papan relay 4 kanal 12 V | 1 | Empat solenoid |
| Relay mobil 40 A + soket | 1 | Kompresor saja |
| Step-down 12 V ke 5 V, minimal 3 A | 1 | ESP32, layar, sensor |
| Layar bulat GC9A01 1,28 inci | 1 | Opsional, bisa menyusul |
| Sekering 5 A dan sekering kompresor | 1 set | Jalur terpisah |
| Manifold 4 solenoid NC | 1 | Isi/buang depan, isi/buang belakang |

Yang sudah harus ada di mobil: empat balon, kompresor, tangki, check valve, relief valve, selang rated di atas tekanan kerja.

## 2. Udara

```
kompresor -> check valve -> tangki -> relief valve
tangki -> sensor tangki
tangki -> solenoid isi depan -> saluran depan -> T -> balon kiri dan kanan
saluran depan -> solenoid buang depan -> udara luar
saluran depan -> sensor depan
tangki -> solenoid isi belakang -> saluran belakang -> T -> dua balon
saluran belakang -> solenoid buang -> udara luar
saluran belakang -> sensor belakang
```

Jangan pasang check valve di cabang tiap balon pada model 2 titik. Sensor tidak bisa melihat tekanan yang terkunci, dan balon sehat bisa terisi berlebih.

## 3. Listrik

Ikuti `WIRING.md`. Ground modul, relay, dan sensor harus ke ground bodi yang sama dengan aki. ACC diambil dari kunci kontak, bukan dari 12 V tetap. Kompresor tidak boleh lewat relay papan kecil.

Urutan nyala pertama, solenoid belum dipasang ke udara:

1. Cek 5 V di ESP32 dan ADS1115.
2. Flash firmware.
3. Buka website kontrol, sambungkan Bluetooth.
4. Lihat tiga angka psi. Harus dekat 0 saat sistem kosong.
5. Baru colok solenoid, uji satu per satu.
6. Terakhir colok relay kompresor.

## 4. Firmware

1. Pasang board package ESP32 di Arduino IDE.
2. Library: Adafruit ADS1X15, Adafruit GFX, Adafruit GC9A01A, Preferences.
3. Buka `firmware/rzmong_airsuspension/rzmong_airsuspension.ino`.
4. Board: ESP32 Dev Module. Flash size 4 MB. Upload speed 115200.
5. Serial monitor 115200. Harus muncul `RZM-AIR ready`.

Kalibrasi ada di atas sketsa: `PSI_MIN_V` 0,5 dan `PSI_MAX_V` 4,5 untuk sensor 200 psi. Deadband 2 psi. Timeout isi 90 detik. Batas kantung 15–110 psi.

## 5. Halaman flash

Halaman `web/flash/` memakai ESP Web Tools. Butuh Chrome atau Edge, dan file `.bin` hasil build.

Build dari Arduino IDE: Sketch, Export compiled binary. Salin `.bin` ke `web/firmware/rzmong.ino.bin`, lalu buka halaman flash lewat server lokal, bukan `file://`.

```bash
cd web
python3 -m http.server 8080
```

Buka `http://localhost:8080/flash/`. Tahan BOOT saat menghubungkan kalau upload tidak mulai.

## 6. Aplikasi dan website kontrol

Tidak ada aplikasi toko. Aplikasinya adalah `web/control/`, dibuka di Chrome HP. Tambahkan ke layar utama supaya jadi ikon.

- Mode demo berjalan tanpa modul.
- Sambungkan mencari Bluetooth `RZM-AIR`.
- Tiga preset: Parkir, Jalan, Tinggi.
- All up, all down, dan setpoint depan/belakang.
- Menu otomatis: naik saat hidup, turun saat mati.
- Tiga tema speedo: siang, malam, stance.

Perintah yang dikirim HP berbentuk JSON, satu baris:

```json
{"cmd":"preset","id":1}
{"cmd":"set","axle":"front","psi":45}
{"cmd":"auto","rise":true,"drop":false}
{"cmd":"manual","axle":"front","action":"fill"}
```

Modul membalas status sepuluh kali per detik:

```json
{"tank":140,"front":48,"rear":46,"preset":1,"comp":false,"rise":true,"drop":false,"fault":""}
```

## 7. Coba di mobil

1. Isi tangki sampai kompresor berhenti sendiri, default 145 psi, mati di 165 psi.
2. Set Parkir 25/25, Jalan 50/55, Tinggi 75/80. Angka depan dulu.
3. Naikkan manual. Pastikan kedua sisi depan naik bersama.
4. Nyalakan mesin. Kalau rise-on-start aktif, mobil harus ke preset Jalan setelah 5 detik.
5. Matikan mesin. Turun otomatis hanya jalan kalau opsi itu dinyalakan.
6. Longgarkan satu fitting depan sebentar. Psi depan harus turun dan, setelah timeout, layar menampilkan `depan bocor`. Kencangkan lagi.

Jangan turun sampai ban menggesek fender saat di jalan. Preset parkir untuk foto, bukan untuk dikendarai.
