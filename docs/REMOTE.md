# Remote internet (MQTT) — RZMONG Airsuspension firmware 0.4.0+

Dengan remote internet, dashboard di **website** (`https://rz7mong.github.io/rzmong-airsuspension/dashboard/`) atau
**aplikasi Android** bisa memantau dan mengontrol modul dari mana saja, asalkan modul tersambung ke WiFi router/hotspot yang punya internet.

> **Remote MATI secara default.** Bluetooth dan WiFi `RZMONG-AIR` di mobil tetap jalan seperti biasa, dengan atau tanpa internet.

## ⚠️ Baca dulu: keamanan

- **JANGAN pakai broker publik/tes** (`broker.hivemq.com`, `broker.emqx.io`, `test.mosquitto.org`, dll.) untuk mobil.
  Di broker publik **siapa pun** bisa melihat topikmu, membaca telemetri (tekanan, kontak ON/OFF = mobil sedang dipakai atau tidak),
  dan membanjiri modul dengan pesan. Tanda tangan kode akses tetap menolak perintah palsu, tapi kode pendek seperti `1234`
  bisa ditebak dari pesan yang terlihat. Pakai broker **pribadi** dengan username + sandi (contoh di bawah).
- **Ganti kode akses default `1234`** sebelum mengaktifkan remote. Firmware menolak menyalakan remote selama kode masih `1234`.
  Untuk remote, pakai kode **minimal 8 karakter** campuran huruf/angka/simbol (maksimal 12), karena kode itulah kunci tanda tangan perintah.
- Pakai **dua user broker berbeda**: satu untuk modul, satu untuk HP. Kalau HP hilang, cukup hapus user HP di broker.
- Remote mengubah tekanan mobil dari jauh. Pastikan tidak ada orang di bawah/samping mobil. Isi/buang **manual** (tahan tombol)
  sengaja **tidak bisa** lewat internet (kalau koneksi putus saat tombol ditahan, katup bisa terus terbuka). Lewat internet hanya preset,
  target ▲/▼, otomatis, tema, dan **STOP** (STOP selalu diterima tanpa kode).
- Tahan tombol BOOT 8 detik (reset kredensial) juga **mematikan remote**. Aktifkan lagi setelah mengganti kode akses.

## Cara kerja singkat

```
 HP / website (GitHub Pages, HTTPS)                        Modul ESP32 di mobil
   mqtt.js  ── wss://broker:8084/mqtt ──┐            ┌── mqtts://broker:8883 (TLS, root CA terverifikasi)
                                        ▼            ▼
                                  Broker MQTT pribadi (EMQX Cloud / HiveMQ Cloud / Mosquitto sendiri)
```

- Modul tersambung ke WiFi router (mode STA, diisi di kartu **OTOMATIS → WiFi modul**) lalu ke broker lewat **TLS port 8883**.
  Sertifikat broker diverifikasi dengan root CA yang dibundel (`firmware/rzmong_airsuspension/remote_ca.h`:
  DigiCert Global Root G2 untuk EMQX, ISRG Root X1/X2 untuk HiveMQ/Let's Encrypt, Amazon Root CA 1).
- Semua kerja jaringan (DNS, TLS, reconnect dengan jeda 2→60 detik) jalan di task terpisah. **Loop katup tidak pernah menunggu internet.**
- Topik per perangkat: `rzm/<id>/…`. `<id>` = MAC modul + 8 hex acak, contoh `a1b2c3d4e5f6-9f3e21c0` (lihat kartu **REMOTE INTERNET**).
- Setiap perintah ditandatangani **HMAC-SHA256** dengan kode akses. **Kode akses tidak pernah dikirim** ke broker.
  Ada nonce per koneksi + nomor urut, jadi pesan lama tidak bisa diputar ulang. Salah tanda tangan 5× → modul menolak 30 detik (sama seperti lokal).
- Telemetri (tekanan, tangki, preset, kontak, kompresor) dikirim *retained*. Kalau ada HP yang sedang membuka dashboard: maks 1×/detik.
  Tanpa penonton: hanya kalau berubah, maks 1× per 30 detik, plus detak tiap 5 menit. Status `online` memakai Last Will (`0` kalau modul putus).
- Host, username, dan sandi broker disimpan di NVS (namespace `rzmrm`) dan **tidak pernah** dikirim balik di status.

Detail protokol: `docs/PROTOKOL.md` bagian *Remote internet*.

## Langkah 1 — Buat broker gratis (EMQX Cloud Serverless)

> Catatan per Oktober 2026: paket **HiveMQ Cloud Serverless (Free)** sudah tidak bisa dibuat baru (end of sale 30-09-2026) dan cluster lama
> berhenti 31-12-2026. Kalau kamu masih punya cluster HiveMQ, lihat bagian *Memakai HiveMQ Cloud* di bawah. Untuk yang baru, pakai EMQX.

EMQX Cloud Serverless punya kuota gratis bulanan (±1 juta menit sesi = ±23 perangkat online 24 jam, 1 GB trafik). Satu mobil + beberapa HP jauh di bawah itu.

1. Daftar di **https://www.emqx.com/en/cloud** → masuk **Console**.
2. **New Deployment** → pilih **Serverless** → pilih region terdekat (mis. Singapura / `asia-southeast1`) → beri nama `rzmong-air`.
   Pastikan **Spend limit = 0** (hanya pakai kuota gratis, tidak akan ditagih) → **Deploy**.
3. Buka deployment → halaman **Overview**. Catat:
   - **Address**, contoh `x1y2z3.ala.asia-southeast1.emqxsl.com`
   - **MQTT over TLS port**: `8883` (untuk modul)
   - **WebSocket over TLS port**: `8084` (untuk website/aplikasi)
4. **Access Control → Authentication → Add**, buat dua user:
   - `rzm-modul` + sandi panjang acak (untuk modul)
   - `rzm-hp` + sandi panjang acak lain (untuk HP/website)
5. (Disarankan) **Access Control → Authorization**. Ganti `<id>` dengan ID perangkat dari Langkah 2:
   - Tab **Username** `rzm-modul`: topic `rzm/<id>/#` → *Publish & Subscribe* → **Allow**
   - Tab **Username** `rzm-hp`: topic `rzm/<id>/#` → *Publish & Subscribe* → **Allow**
   - Tab **All Users**: topic `#` → *Publish & Subscribe* → **Deny** (jadi user lain/topik lain ditolak)

## Langkah 2 — Aktifkan remote di modul (harus lewat koneksi lokal)

1. Pastikan modul sudah tersambung ke **WiFi router/hotspot** yang ada internetnya: halaman kontrol → kartu **OTOMATIS & TEMA → WiFi modul (opsional)** → isi SSID & sandi → **KIRIM KE MODUL**.
2. Sambungkan HP ke modul lewat **Bluetooth** atau **WiFi `RZMONG-AIR`**, masukkan kode akses.
3. Kalau kode masih `1234`: kartu **🔒 KEAMANAN** → ganti kode akses (minimal 8 karakter untuk remote).
4. Kartu **🌐 REMOTE INTERNET**:
   - centang **Aktifkan remote internet di modul**
   - **Host broker**: alamat dari Langkah 1 (tanpa `mqtts://`), **Port TLS** `8883`
   - **Username/Sandi modul**: `rzm-modul` dan sandinya
   - **Kode akses saat ini** → **SIMPAN KE MODUL**
5. Lencana di kartu berubah: `TUNGGU WIFI ROUTER` → `MENYAMBUNG` → **`ONLINE`**. Kalau `GAGAL KONEKSI`: cek host/port/internet router.
   Kalau `DITOLAK BROKER`: username/sandi salah. Serial Monitor (115200) juga mencetak `Remote: …`.
6. Catat **ID perangkat** yang tampil di kartu. Tekan **PAKAI DI HP INI** untuk menyalin ID + host ke pengaturan INTERNET di HP itu.

## Langkah 3 — Pakai dari website atau aplikasi

1. Buka **https://rz7mong.github.io/rzmong-airsuspension/dashboard/** (atau aplikasi Android).
2. Pilih jalur **🌐 INTERNET** → buka **Pengaturan broker internet di HP ini**:
   - Alamat broker: `x1y2z3.ala.asia-southeast1.emqxsl.com` · Port WebSocket: `8084`
   - ID perangkat: dari Langkah 2
   - Username/Sandi: **`rzm-hp`** (bukan user modul). Centang "Simpan sandi" hanya di HP pribadi.
3. Tekan **SAMBUNGKAN** → masukkan kode akses → dashboard menampilkan `INTERNET · modul online`.
4. Lewat internet, preset dan tombol SEMUA NAIK/TURUN perlu **diketuk 2×** (mencegah salah pencet dari jauh). STOP langsung.

Kalau statusnya **MODUL OFFLINE**: mobil mati/WiFi router mati/di luar jangkauan. Kontrol internet tidak tersedia, tapi kontrol lokal di mobil tetap jalan.

## Memakai HiveMQ Cloud (cluster lama / paket Starter)

Sama seperti di atas, bedanya: host `xxxx.s1.eu.hivemq.cloud`, modul port **8883**, website/aplikasi port WebSocket **8884**.
Buat dua credential di **Access Management** (permission *Publish and Subscribe*, atau topic filter `rzm/<id>/#` kalau tersedia).
HiveMQ memakai sertifikat Let's Encrypt — sudah termasuk di `remote_ca.h`.

## Broker sendiri (Mosquitto) / broker lain

- Broker wajib punya **TLS untuk port MQTT** (modul tidak mau tersambung tanpa TLS) dan **WebSocket TLS (wss)** untuk website HTTPS.
- Sertifikat broker harus berantai ke salah satu root CA di `remote_ca.h`. Kalau tidak (mis. sertifikat buatan sendiri), tambahkan PEM root CA-mu ke file itu lalu build ulang.
- Aplikasi/website juga menerima URL lengkap di kolom alamat broker, mis. `wss://mqtt.contoh.id:443/mqtt`.

## Uji tanpa hardware (broker lokal)

```bash
sudo apt install mosquitto mosquitto-clients
pip install "paho-mqtt>=2"
cat > /tmp/mosq.conf <<'CONF'
listener 1883 127.0.0.1
listener 9001 127.0.0.1
protocol websockets
allow_anonymous true
CONF
/usr/sbin/mosquitto -c /tmp/mosq.conf &
python3 tools/mock_remote.py --code 5678 &          # modul tiruan
cd web && python3 -m http.server 8765               # buka http://127.0.0.1:8765/dashboard/
```

Di dashboard: jalur **INTERNET**, alamat broker `ws://127.0.0.1:9001`, ID `0011223344aa-deadbeef`, kode `5678`.
(`ws://` tanpa TLS hanya untuk uji lokal.)

## Biaya & kuota

Telemetri ±400 byte. Dashboard terbuka terus 1 jam ≈ 1,5 MB. Tanpa penonton ≈ 1–2 MB/hari. Kuota gratis EMQX 1 GB/bulan cukup untuk pemakaian normal.
Untuk menghemat, tutup dashboard kalau tidak dipakai (modul otomatis kembali ke mode lambat setelah 60 detik).
