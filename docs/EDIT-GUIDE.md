# Panduan Edit & Build Sendiri — RZMONG Airsuspension

Panduan ini untuk kamu yang ingin mengubah tampilan, menambah mobil pixel, lalu membangun firmware dan APK sendiri.
Semua file sumber ada di repo ini. Tidak ada bagian yang hanya bisa dibuat di komputer orang lain.

> Ringkasnya: **edit file → regenerasi file turunan → tes di browser → commit → push**. GitHub Actions akan membangun sisanya.

---

## 1. Struktur repo

```
.github/workflows/   CI: firmware.yml (build .bin), android.yml (build APK), pages.yml (deploy web)
web/                 Situs GitHub Pages
  index.html         Halaman depan (landing)
  assets/neon.css    Gaya halaman depan
  flash/             Web flasher (ESP Web Tools) + firmware/*.bin + manifest.json
  control/           Aplikasi kontroler (PWA). Dipakai juga oleh firmware (WiFi) dan APK
    index.html, app.js, control.css   Halaman & logika kontroler (BLE/WiFi/Internet, preset, gauge, kartu Keamanan & Remote)
    dash.js                           Tampilan DASHBOARD (mobil tampak atas, 4 balon, tangki, preset, ▲/▼ per as)
    remote.js                         Jalur INTERNET: klien MQTT (wss) + tanda tangan HMAC-SHA256
    theme.css, theme.js               Tema (neon/merah/terang/anime/karbon), maskot, efek tap
    cars.js                           Renderer mobil pixel: velg, livery, warna, latar, animasi
    cars-pixel.js                     DIBUAT OTOMATIS dari tools/pixel (sprite bodi mobil)
    sw.js                             Service worker (cache offline)
    icons/                            Ikon PWA (icon.svg + png 192/512)
    vendor/ble-native.js              DIBUAT OTOMATIS dari android/ble-entry.js (npm run bundle:ble)
    vendor/mqtt.min.js                MQTT.js 5.x (MIT) dari npm, dimuat hanya saat jalur INTERNET dipakai
  dashboard/index.html                Pintasan → control/?layout=dash
firmware/
  rzmong_airsuspension/rzmong_airsuspension.ino   Firmware utama ESP32 (Arduino)
  rzmong_airsuspension/web_assets.h               DIBUAT OTOMATIS dari web/control (tools/embed_web.py)
  rzmong_airsuspension/remote_ca.h                Root CA untuk MQTT TLS (remote internet)
  kalibrasi_sensor/                               Sketch kalibrasi sensor tekanan
  platformio.ini, merge_bin.sh                    Build PlatformIO + penggabung .bin
  test_host/                                      Simulasi firmware di PC (run.sh) + uji boot QEMU (qemu.sh)
tools/
  embed_web.py       Bundel web/control → web_assets.h
  mock_modul.py      Modul tiruan HTTP (uji kode akses, keamanan, kartu remote)
  mock_remote.py     Modul tiruan MQTT (uji dashboard lewat jalur INTERNET, butuh mosquitto + paho-mqtt)
  uji_ui_mock.py     Uji UI headless (Playwright) terhadap mock_modul.py
  pixel/             Generator sprite mobil pixel (Python)
android/             Proyek Capacitor (APK Android)
docs/                Tutorial, wiring, protokol, dan panduan ini
```

File yang ditandai **DIBUAT OTOMATIS** jangan diedit manual. Edit sumbernya, lalu jalankan generatornya.

---

## 2. Tes di komputer sendiri (tanpa ESP32)

```bash
cd web
python3 -m http.server 8765
```
Buka `http://localhost:8765/` (landing) atau `http://localhost:8765/control/` (kontroler, ada mode **DEMO** tanpa alat).
Setelah mengubah file, lakukan *hard refresh* (Ctrl+Shift+R). Service worker kadang masih menyimpan versi lama.
Buka DevTools (F12) → Console untuk memastikan tidak ada error merah.

Tampilan: `http://localhost:8765/control/?layout=dash` (dashboard, default) atau `?layout=classic`. Pilihan tersimpan di `localStorage` `rzm.layout`.
Uji jalur INTERNET tanpa hardware: lihat `docs/REMOTE.md` bagian *Uji tanpa hardware* (mosquitto + `tools/mock_remote.py`).

---

## 3. Mengedit tampilan web

### Warna & tema (CSS variables)
Semua warna tema ada di `web/control/theme.css`, satu blok per tema:
```css
:root, [data-theme="neon"] { --bg:#05070d; --accent:#22f3ff; --accent2:#ff2bd6; ... }
[data-theme="merah"]       { ... }
[data-theme="terang"]      { ... }
[data-theme="anime"]       { ... --font:"M PLUS Rounded 1c", ...; --r:28px; }
```
Variabel penting: `--bg` (latar), `--text`/`--dim` (teks), `--accent`/`--accent2` (warna utama), `--front`/`--rear` (warna as depan/belakang),
`--ok`/`--warn`/`--bad` (status), `--glow` (bayangan neon), `--r`/`--btn-r` (kebulatan sudut), dan `--font`.
Ubah nilainya, simpan, lalu refresh.

### Menambah tema baru
1. Di `theme.css`, salin satu blok, misalnya `[data-theme="merah"] { ... }`, lalu ganti namanya menjadi `[data-theme="hijau"]` dan ubah warnanya.
2. Di `theme.js`, tambahkan entri ke array `THEMES`:
   ```js
   { id: "hijau", name: "Hijau Racing", sw: "linear-gradient(135deg,#00ff88,#00aaff)", meta: "#03100a" },
   ```
   `sw` = warna contoh di menu tema 🎨, `meta` = warna status bar HP.
3. (Opsional) Latar pixel mobil per tema ada di `cars.js` (objek `SCENE`), dan warna cat "auto" per tema ada di `THEME_COLOR`. Tema yang tidak dikenal memakai versi neon.

Tema yang dipilih tersimpan di `localStorage` dengan kunci `rzm.uitheme`.

### Maskot (tema Anime)
Ada di `web/control/theme.js`, bagian `maskot: "Rina"`:
- `MASCOT_SVG` → gambar SVG maskot. Bisa diganti SVG buatanmu sendiri (lebar sekitar 90 px).
- `TAPS` dan teks di fungsi `say(...)` → kalimat yang diucapkan maskot.
- Animasi (`happy`, `lift`, `crouch`, `worry`, `wiggle`) adalah kelas CSS `.mascot.*` di `theme.css`.
- Pengguna bisa mematikan maskot atau suara dari menu 🎨 (`rzm.mascot`, `rzm.sound`).

### Ikon
- PWA/web: `web/control/icons/icon.svg` adalah sumbernya. Buat PNG dengan, misalnya:
  ```bash
  rsvg-convert -w 192 -h 192 web/control/icons/icon.svg -o web/control/icons/icon-192.png
  rsvg-convert -w 512 -h 512 web/control/icons/icon.svg -o web/control/icons/icon-512.png
  ```
- Android: ikon launcher ada di `android/android/app/src/main/res/mipmap-*`. Cara termudah: buka folder `android/android` di Android Studio →
  klik kanan `res` → **New → Image Asset**.

### Teks & halaman
- Landing: `web/index.html` + `web/assets/neon.css`.
- Kontroler: `web/control/index.html` (struktur), `control.css` (tata letak), `app.js` (logika, preset, BLE/WiFi).

### Wajib setelah mengubah `web/control/*`
1. Naikkan versi cache di `web/control/sw.js`, misalnya `rzm-control-v7` → `rzm-control-v8`. Kalau tidak, HP pengguna bisa tetap memakai versi lama.
2. Jika menambah file baru di `web/control/`, daftarkan juga di `sw.js` (daftar cache) dan di `tools/embed_web.py` (`FILES`).
3. Regenerasi firmware: `python3 tools/embed_web.py` (lihat bagian 5).

---

## 4. Mobil pixel: model, velg, livery, warna

Butuh Python 3 + `numpy` + `Pillow`:
```bash
pip install numpy pillow
```

### Alur regenerasi sprite
```bash
python3 tools/pixel/gen_pix.py     # menulis web/control/cars-pixel.js
python3 tools/embed_web.py         # ikut memperbarui firmware
```
Pratinjau semua model sekaligus: jalankan `python3 -m http.server 8000` dari **root repo**, lalu buka
`http://localhost:8000/tools/pixel/preview.html?m=kaze,kazeshow,lumora,ronin&p=15,110`.
Parameter: `m` = model, `p` = psi, `w` = velg, `l` = livery, `c` = warna (`auto`/hex), `v=ground` = mode ban diam, `theme` = tema, `cols` = jumlah kolom.

### Mengubah bentuk mobil yang sudah ada
- `tools/pixel/<model>_cfg.json`: titik siluet (`body`), kaca (`glass`), spion (`mirror`), lampu (`head`/`tail`), dan lengkung roda (`arches`),
  dalam koordinat foto referensi. Foto tidak disimpan di repo (proporsi berasal dari foto @rzmong & @gesrexgang, dipakai dengan izin).
- `tools/pixel/specs.py`: satu dict per model (`KAZE`, `KAZESHOW`, `LUMORA`, `RONIN`):
  - `k` = skala foto → piksel (lebih besar berarti sprite lebih besar)
  - `R` / `archR` = jari-jari roda / spatbor
  - `axleR` / `axleF` = posisi as belakang / depan
  - `belt`, `low`, `sill` = garis jendela, bawah, dan sill
  - `shoulder`, `lines`, `pillars`, `trim`, `dark` = garis bahu, garis pintu, pilar, trim krom, dan area gelap
  - `KAZESHOW['extras']` = kit show car (wing, canard, splitter, diffuser, roll cage)
- `tools/pixel/pix.py`: mesin rasterisasi (palet, outline, rim light). Biasanya tidak perlu diubah.
- `tools/pixel/sil.py`: alat bantu untuk menggambar titik cfg di atas foto (jika kamu punya fotonya sendiri):
  `python3 tools/pixel/sil.py kaze_cfg.json cek.png`. Field `img` di json menunjuk ke nama file foto.

### Menambah model baru
1. Buat `tools/pixel/namaku_cfg.json` (salin salah satu yang ada, lalu ubah titiknya).
2. Di `specs.py`, muat json-nya dan buat dict `NAMAKU = dict(...)` (salin `RONIN` sebagai awal).
3. Di `gen_pix.py`, tambahkan `'namaku'` ke tuple `for name in (...)`. Nama dict = nama dalam huruf besar.
4. Jalankan `python3 tools/pixel/gen_pix.py`.
5. Di `web/control/cars.js`, tambahkan ke `MODELS`:
   ```js
   namaku: { name: "Nama Karangan", icon: "🚗", paint: "#3366ff", wheel: "dish5" },
   ```
   Pakai nama karangan, jangan nama merek/model asli.
6. `python3 tools/embed_web.py`, naikkan versi `sw.js`, lalu tes.

### Velg
Semua ada di `web/control/cars.js`:
- `WHEELS` → id + nama yang tampil di pemilih.
- `WSYM` → jumlah palang (simetri putaran).
- `WPAL` → warna (`face`, `hi`, `lo`, `barrel`, `nut`, `cal`, ...).
- Fungsi `wheelSprite(type, R, frame)` → pola per piksel. Tambahkan cabang `else if (type === "idbaru") spoke = ...;`.

### Livery
Di `cars.js`, bagian `/* ---------- livery pixel ---------- */` (fungsi `liveryMask`). Tambahkan cabang `type === "idbaru"`,
lalu daftarkan di `LIVERIES = { ..., idbaru: "Nama Livery" }`.

### Warna cat
Array `COLORS` di `cars.js`: `["#hex", "Nama warna"]`. `"auto"` = mengikuti warna tema.

### Pengaturan tersimpan
Pilihan pengguna disimpan di `localStorage` dengan kunci `rzm.car` (`{model, wheel, color, livery, view}`).
Jika kamu mengganti id model/velg, tambahkan pemetaan di `OLD_MODEL` / `OLD_WHEEL` di `cars.js` supaya pilihan lama tetap jalan.

---

## 5. Regenerasi `web_assets.h` (UI di dalam firmware)

ESP32 menyajikan kontroler lewat WiFi dari file `firmware/rzmong_airsuspension/web_assets.h` (isinya gzip dari `web/control`).
Setiap kali `web/control` berubah:
```bash
python3 tools/embed_web.py
```
GitHub Actions juga menjalankan ini otomatis sebelum build. Tetap commit hasilnya supaya build Arduino IDE ikut terbarui.

---

## 6. Compile & flash firmware

### A. Web flasher (paling mudah, tanpa install)
Buka `https://rz7mong.github.io/rzmong-airsuspension/flash/` di Chrome/Edge desktop → colokkan ESP32 lewat USB → **Connect** → **Install**.
Firmware di halaman ini dibangun ulang otomatis setiap ada push ke `main`.
Kamu juga bisa memakai file `.bin` dari Release dengan [ESP Web Tools](https://esphome.github.io/esp-web-tools/) atau `esptool`:
```bash
esptool.py --chip esp32 write_flash 0x0 rzmong-airsuspension-esp32-merged.bin
```

### B. Arduino IDE
1. **File → Preferences → Additional boards manager URLs**:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   Lalu **Boards Manager** → install **esp32 by Espressif** (2.0.x atau 3.x).
2. **Library Manager**: Adafruit ADS1X15, Adafruit GFX Library, Adafruit GC9A01A, ArduinoJson (v7), WebSockets (Markus Sattler), PubSubClient (Nick O'Leary, untuk remote internet).
3. Buka `firmware/rzmong_airsuspension/rzmong_airsuspension.ino`.
4. **Tools**:
   - Board: **ESP32 Dev Module**
   - Flash Size: **4MB**
   - **Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS)**. Ini wajib, karena BLE + WiFi + UI web melebihi partisi default 1,3 MB.
   - Upload Speed: 921600 (turunkan ke 115200 jika gagal)
   - Port: port USB ESP32
5. Klik **Upload**. Jika macet di "Connecting…", tahan tombol **BOOT** di ESP32.
6. Serial Monitor: 115200 baud.

### C. arduino-cli
```bash
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli lib install "Adafruit ADS1X15" "Adafruit GFX Library" "Adafruit GC9A01A" "ArduinoJson" "WebSockets" "PubSubClient"
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app firmware/rzmong_airsuspension
arduino-cli upload  --fqbn esp32:esp32:esp32:PartitionScheme=huge_app -p /dev/ttyUSB0 firmware/rzmong_airsuspension
```
(Di Windows, port-nya `COM3` dan seterusnya.)

### D. PlatformIO (sama seperti CI)
```bash
pip install platformio esptool
python3 tools/embed_web.py
cd firmware
pio run -e esp32dev                  # build
pio run -e esp32dev -t upload        # flash
./merge_bin.sh ../dist               # buat merged .bin untuk web flasher
```

---

## 7. Build APK Android

### Lokal
Butuh **Node.js 20**, **JDK 21**, dan Android SDK (paling mudah: install Android Studio).
```bash
cd android
npm ci
npm run apk:debug
# hasil: android/android/app/build/outputs/apk/debug/app-debug.apk
```
`apk:debug` = bundel BLE (`vendor/ble-native.js`) → salin `web/control` ke `www/` → `cap sync` → `gradlew assembleDebug`.
Untuk mengedit di Android Studio: `npm run sync`, lalu buka folder `android/android`.
Nama/ID aplikasi: `android/capacitor.config.json` dan `android/android/app/build.gradle` (`versionName`, `versionCode`).

### Via GitHub Actions
Setiap push yang mengubah `android/**` atau `web/control/**` menjalankan workflow **Android APK**.
Cara mengambil APK: tab **Actions** → pilih run → bagian **Artifacts** → `rzmong-air-debug-apk`.
Bisa juga dijalankan manual: **Actions → Android APK → Run workflow**.

---

## 8. GitHub Pages (landing + kontroler + web flasher)

Cukup diatur sekali:
1. Buka repo di GitHub → **Settings → Pages**.
2. **Build and deployment → Source: GitHub Actions**.
3. Push ke `main` (atau **Actions → GitHub Pages → Run workflow**).
4. Situs akan tersedia di `https://rz7mong.github.io/rzmong-airsuspension/`.

Workflow `pages.yml` juga membangun firmware terbaru ke `web/flash/firmware/`, jadi web flasher selalu memakai versi `main`.

---

## 9. Membuat Release

```bash
git checkout main && git pull
git tag v0.2.0
git push origin v0.2.0
```
Tag `v*` menjalankan workflow **Firmware ESP32** dan **Android APK**. Keduanya otomatis melampirkan file ke Release:
- `rzmong-airsuspension-esp32-merged.bin` (flash di offset 0x0)
- `rzmong-airsuspension-esp32-app.bin` (aplikasi saja, offset 0x10000)
- `rzmong-air-debug.apk`

Lihat hasilnya di tab **Releases**. Catatan rilis bisa diedit di sana.
Alternatif dengan GitHub CLI: `gh release create v0.2.0 file1 file2 --notes "..."`.

---

## 10. Keamanan akses: kode akses, sandi WiFi, PIN Bluetooth

Mulai firmware **0.3.0**, kontrol dilindungi tiga kredensial. Semuanya disimpan di NVS (Preferences) namespace **`rzmsec`**,
terpisah dari kalibrasi (`rzmcal`) dan preset (`rzm`).

| Kredensial | Default | Aturan | Konstanta di firmware |
|---|---|---|---|
| Kode akses UI/API | `1234` | 4–12 karakter ASCII, tanpa spasi | `ACCESS_CODE_DEFAULT` |
| Sandi WiFi AP `RZMONG-AIR` | `rzmong123` | 8–63 karakter (WPA2) | `AP_PASS_DEFAULT` |
| PIN Bluetooth (passkey BLE) | `123456` | tepat 6 angka | `BT_PIN_DEFAULT` |

### Cara pakai
1. Sambungkan lewat Bluetooth: HP akan minta **PIN pairing** → ketik `123456` (atau PIN barumu).
   Lewat WiFi: masuk ke `RZMONG-AIR` dengan sandinya, buka `http://192.168.4.1/`.
2. Setelah tersambung, muncul jendela **KODE AKSES**. Masukkan kode (default `1234`).
   Centang **Ingat kode di HP ini** kalau tidak mau mengetik ulang (disimpan di `localStorage` kunci `rzm.code`; tombol
   **LUPAKAN KODE DI HP INI** menghapusnya). Pilih **LIHAT SAJA** untuk memantau tanpa bisa mengontrol.
3. Selama kredensial masih default, kartu **🔒 KEAMANAN** menampilkan tanda **DEFAULT!**.

### Mengganti kredensial
Halaman kontrol → kartu **🔒 KEAMANAN**:
1. Isi **Kode akses saat ini** (selalu wajib, walau sudah login).
2. Isi yang ingin diganti: kode akses baru (+ ulangi), sandi WiFi baru, dan/atau PIN Bluetooth baru. Kosongkan yang tidak diganti.
3. Tekan **SIMPAN KE MODUL**. Hasil:
   - Kode akses baru → HP lain yang sedang tersambung harus memasukkan kode baru.
   - Sandi WiFi baru → WiFi `RZMONG-AIR` restart ±2 detik. Sambungkan ulang HP dengan sandi baru.
   - PIN Bluetooth baru → semua pairing lama dihapus. Di HP: **Pengaturan → Bluetooth → RZM-AIR → Lupakan/Unpair**, lalu sambungkan lagi dan masukkan PIN baru.

Perintah protokolnya (`auth`, `logout`, `security`) ada di `docs/PROTOKOL.md`.

### Reset kredensial dengan tombol BOOT (lupa kode/PIN/sandi)
1. Pastikan modul **sudah menyala normal** (layar bulat tampil). Jangan menahan BOOT sambil menyalakan, karena itu masuk mode flash/download.
2. **Tahan tombol BOOT** di papan ESP32 DevKit (**GPIO0**) selama **8 detik**.
   - LED biru bawaan (GPIO2) berkedip, makin lama makin cepat.
   - Layar bulat menampilkan `TAHAN BOOT / RESET n s`. Serial Monitor (115200) menghitung mundur.
   - Halaman kontrol yang tersambung menampilkan "Tombol BOOT ditahan n dtk".
   - Lepas sebelum 8 detik = **batal**, tidak ada yang berubah.
3. Setelah 8 detik: layar menampilkan `KREDENSIAL DIRESET`, LED berkedip cepat ±4 detik, dan Serial mencetak kredensial default.
   Kode akses kembali `1234`, sandi WiFi `rzmong123`, PIN Bluetooth `123456`, dan semua pairing BLE dihapus.
   **Tidak ikut direset:** kalibrasi sensor, preset, otomatis, tema, dan WiFi router (STA).
4. Di HP: lupakan/unpair `RZM-AIR`, sambungkan ulang, lalu segera ganti kredensial default.

Mengubah pin atau lama tahan: konstanta `PIN_BOOT` (0 untuk ESP32 klasik/esp32dev; **9** untuk ESP32-C3), `PIN_LED`, dan
`BOOT_RESET_MS` (8000 ms) di bagian atas `rzmong_airsuspension.ino`. Proteksi tebak kode: `AUTH_MAX_FAIL` (5) dan `AUTH_LOCK_MS` (30 dtk).

### Catatan keamanan
- Status JSON tidak pernah memuat kode, sandi, atau PIN. Log protokol di UI menyamarkannya (`••••`).
- Tombol **STOP** (tutup semua katup) tetap diterima tanpa kode, demi keselamatan. Mulai 0.3.1 STOP juga menghentikan
  leveling otomatis sampai preset dipilih lagi (status `hold:true`, fault `STOP: pilih preset`).
- Kredensial disimpan apa adanya di flash ESP32. Orang yang memegang modul fisik bisa membaca flash atau menekan BOOT,
  jadi pasang modul di tempat yang tidak mudah dijangkau.
- WiFi lewat HTTP biasa (tanpa TLS); keamanannya bergantung pada sandi WPA2 `RZMONG-AIR`. BLE terenkripsi setelah pairing.

---

## 11. Tes firmware tanpa ESP32 (simulasi)

Ada tiga lapis uji yang bisa dijalankan di komputer sendiri (Linux/macOS/WSL). Jalankan setelah mengubah firmware.

### A. Simulasi host (paling penting, ±10 detik)
Firmware **asli** (`rzmong_airsuspension.ino`) dikompilasi untuk PC memakai stub Arduino/ESP32 di `firmware/test_host/stubs/`,
lalu dijalankan dengan waktu virtual. Sensor (tegangan ADS1115), ACC, tombol BOOT, BLE, WebSocket, HTTP, dan NVS disimulasikan.
Dikompilasi dengan AddressSanitizer + UBSan, jadi akses memori salah langsung ketahuan.

```bash
cd firmware
pio run -e esp32dev          # sekali saja, supaya library ArduinoJson terunduh (kalau tidak, run.sh meng-clone sendiri)
test_host/run.sh             # semua tes
test_host/run.sh STOP        # hanya tes yang namanya mengandung "STOP"
```
Butuh `g++` (Debian/Ubuntu: `sudo apt install g++`). Hasil akhir harus `N lulus, 0 gagal`. Yang diuji antara lain:
kode akses + kunci 5× salah/30 dtk (termasuk saat `millis()` meluap di hari ke-49), validasi ganti kredensial, rahasia tidak
bocor di status/serial, JSON rusak, BLE+WebSocket+HTTP bersamaan, BLE ditulis dari thread lain (balapan data), STOP, manual
(tahan tombol, HP putus, batas 20 dtk), timeout bocor 90 dtk, sensor putus/korslet, ADS1115 lepas, kompresor (histeresis +
batas 10 menit), ACC + debounce starter, tombol BOOT 8 dtk/batal/macet LOW, NVS rusak, ukuran status BLE, watchdog, dan fuzz
3000 langkah (katup isi & buang satu as tidak pernah terbuka bersamaan).

Menambah tes: tulis fungsi `static void t_namaku() { boot(); ... CHECK(kondisi, "pesan"); }` di
`firmware/test_host/test_firmware.cpp`, lalu daftarkan di array `TESTS[]`. Helper: `setPsi(tangki, depan, belakang)`,
`run(ms)`, `on(PIN_...)`, `ble("{...}")`, `wsSend(0, "{...}")`, `post("{...}")`, `sim::pinIn[PIN_BOOT]`, `sim::analog[PIN_ACC]`,
`sim::adsPresent`.

### B. Emulator ESP32 (QEMU) — uji boot
```bash
cd firmware
test_host/qemu.sh 30         # unduh Espressif QEMU (sekali), build env esp32dev_qemu, jalankan 30 detik
```
QEMU **tidak** meniru radio Bluetooth, PHY WiFi, dan ADC, jadi env `esp32dev_qemu` (flag `RZM_SIM_QEMU`) melewati bagian itu.
Yang dicek: firmware boot, NVS terbuka, peringatan kredensial default, loop jalan terus tanpa panic, dan ADS1115 yang tidak
menjawab ditangani (log `QEMU t=… fault="sensor ADS1115"` tiap 2 detik). Reset `TG1WDT/TG0WDT` di awal boot adalah
artefak kecepatan QEMU (juga muncul di bootloader), bukan bug firmware. **Jangan flash env `esp32dev_qemu` ke mobil.**

### C. Web UI headless vs modul tiruan
```bash
pip install playwright && python -m playwright install chromium
python3 tools/uji_ui_mock.py
```
Menjalankan `tools/mock_modul.py` + server web lokal di port acak, lalu Chromium headless mengetes: layar kunci, kode salah/benar,
peringatan kredensial default, preset, STOP (`STOP: pilih preset`), manual tahan tombol, ganti kode akses, logout, kunci 5× salah.

### Yang tetap harus dites di alat asli
Pairing BLE dengan PIN, WiFi AP restart setelah ganti sandi, tombol BOOT fisik, pembacaan ADS1115 + kalibrasi, relay/katup/kompresor
sungguhan, tegangan ACC, dan watchdog (restart saat loop macet). Lihat checklist di `docs/TUTORIAL.md`.

---

## 12. Dashboard & remote internet (firmware 0.4.0+)

### Tampilan dashboard (`web/control/dash.js`)
- Elemen HTML ada di `index.html` di dalam `<section class="card dash" id="dash">`; gaya di bagian bawah `control.css` (`.dash`, `.d-*`).
- `html[data-layout="dash"]` menyembunyikan kartu klasik (HUD, gauge, mobil samping, preset, manual, diagram) dan menampilkan dashboard.
  Kartu **OTOMATIS & TEMA**, **KEAMANAN**, **REMOTE INTERNET**, dan **LOG** tetap tampil di bawah judul *PENGATURAN*.
- Gambar mobil tampak atas digambar di `buildCar()` (SVG, orisinal). Posisi 4 gelembung tekanan ada di array `CORNERS`.
  Hardware hanya punya 2 sensor, jadi kiri & kanan satu as menampilkan angka yang sama.
- `dash.js` tidak bicara langsung ke modul; semua lewat API dari `app.js` (`api.goPreset`, `api.setTarget`, `api.stop`, `api.state`, `api.conn()`),
  jadi BLE, WiFi, dan Internet otomatis ikut. Tombol ▲/▼ mengubah target preset aktif 1 psi; perintah `set` dikirim 0,6 detik setelah jari berhenti
  (firmware menyimpan ke flash setiap `set`).
- Tema **Karbon Pro** (`data-theme="karbon"`) ada di `theme.css`/`theme.js`. Dashboard memakai variabel CSS, jadi semua tema lain tetap jalan.

### Jalur INTERNET (`web/control/remote.js`)
- `RZMRemote.create(hooks)` = transport ketiga di samping BLE & WiFi. Pengaturan broker HP disimpan di `localStorage` `rzm.remote`
  (sandi hanya kalau "Simpan sandi" dicentang).
- `vendor/mqtt.min.js` dimuat lazy. Update: `npm pack mqtt@5 && tar xzf mqtt-*.tgz && cp package/dist/mqtt.min.js web/control/vendor/`.
  File ini **tidak** ikut `web_assets.h` (dari WiFi AP modul memang tidak ada internet), `dash.js` dan `remote.js` ikut.
- SHA-256/HMAC ditulis sendiri (sinkron) supaya juga jalan di `http://192.168.4.1` yang tidak punya `crypto.subtle`.

### Firmware
- Konstanta di atas `rzmong_airsuspension.ino`: `RM_STATUS_MS` (1 dtk saat ada penonton), `RM_SLOW_MS` (30 dtk tanpa penonton),
  `RM_IDLE_MS` (detak 5 menit), `RM_LIVE_MS` (60 dtk), `RM_MSG_MAX`, `RM_TASK_STACK`.
- Library: `knolleary/PubSubClient` + `WiFiClientSecure` (mbedTLS bawaan core). Arduino IDE: pasang **PubSubClient** dari Library Manager.
- MQTT jalan di task FreeRTOS `rzm-remote` (core 0). Perintah masuk lewat antrean `rmInQ` → diproses di `loop()` (`pollRemote()`),
  telemetri keluar lewat `rmStatusBuf`. Jangan memanggil fungsi katup dari `rmCallback` (itu jalan di task MQTT).
- Pengaturan di NVS namespace **`rzmrm`**: `on`, `host`, `port`, `user`, `pass`, `id`. Reset BOOT hanya mematikan `on`.
- Broker dengan CA lain: tambahkan PEM root-nya ke `remote_ca.h` (beberapa sertifikat boleh digabung), build ulang.
- Ukuran (esp32dev, `huge_app.csv`): firmware 0.4.0 ±1,92 MB dari 3 MB (0.3.0: ±1,76 MB). RAM statis ±65,7 KB;
  saat online TLS memakai ±40–50 KB heap tambahan. Serial mencetak `heap` saat menyambung, dan telemetri membawa `heap` (KB).

---

## 13. Checklist sebelum push

- [ ] Tes di `localhost`, dan Console tidak menampilkan error
- [ ] Jika sprite berubah: `python3 tools/pixel/gen_pix.py`
- [ ] Jika `web/control` berubah: versi `sw.js` dinaikkan + `python3 tools/embed_web.py`
- [ ] Jika firmware/`web/control` berubah: build `pio run -e esp32dev` lalu `./merge_bin.sh` (memperbarui `web/flash/firmware/*.bin`) dan naikkan `version` di `web/flash/firmware/manifest.json`
- [ ] Jika firmware berubah: `firmware/test_host/run.sh` harus `0 gagal`
- [ ] Tidak meng-commit file build (`node_modules/`, `www/`, `.pio/`, `*.apk`, `__pycache__/`); semuanya sudah ada di `.gitignore`
