# Protokol kontrol RZMONG Airsuspension (BLE & WiFi)

Perintah dan status **sama persis** di Bluetooth dan WiFi: satu objek JSON per baris, diakhiri `\n`.

## Bluetooth LE

| Item | Nilai |
|---|---|
| Nama perangkat | `RZM-AIR` (UUID service belum diiklankan — cari berdasarkan nama) |
| Service | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART) |
| RX (HP → modul, write) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| TX (modul → HP, notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

**Keamanan (firmware 0.3.0+):** RX dan CCCD TX butuh link terenkripsi + MITM. HP harus pairing (bonding)
dengan passkey statis = **PIN Bluetooth** (default `123456`, 6 angka). Chrome/Android otomatis memunculkan dialog
pairing saat pertama `startNotifications`/tulis. PIN salah = pairing gagal = tidak bisa kirim/terima.

Firmware menumpuk tulisan sampai ketemu `\n`, jadi UI memotong perintah per 20 byte (aman di MTU 23).
Status dikirim tiap 250 ms selama ada HP tersambung. Status ±180 byte, butuh MTU besar
(Chrome dan plugin Android otomatis minta MTU 512).

## WiFi

| Item | Nilai |
|---|---|
| SoftAP | SSID `RZMONG-AIR`, sandi default `rzmong123` (WPA2, bisa diganti), IP `192.168.4.1` (selalu aktif) |
| STA (opsional) | kirim `{"cmd":"wifi","ssid":"…","pass":"…"}`; ssid kosong = matikan STA |
| mDNS | `rzmong-air.local` |
| Halaman kontrol | `http://192.168.4.1/` — UI `web/control` disajikan dari flash ESP32 |
| WebSocket | `ws://192.168.4.1:81/` — status tiap 250 ms; kirim baris perintah sebagai teks |
| `GET /api/status` | status JSON |
| `POST /api/cmd` | body = satu/lebih baris perintah JSON (Content-Type bebas, UI pakai `text/plain`); balasan = status. HTTP tidak punya sesi: awali body dengan baris `{"cmd":"auth","code":"…"}` |

Status WiFi menambah field `ip` (IP STA kalau tersambung, kalau tidak IP AP), `sta` (bool), `ble` (bool).
CORS dibuka (`*`). Catatan: halaman HTTPS (GitHub Pages) **tidak bisa** memanggil `http://192.168.4.1`
karena aturan mixed content browser — buka UI dari modul langsung, pakai aplikasi Android, atau server lokal http.

## Kode akses

Setiap koneksi (BLE, tiap klien WebSocket, tiap request HTTP) mulai **terkunci**. Perintah yang boleh tanpa kode:
`auth`, `logout`, `security` (membawa kode sendiri), dan `stop`. Perintah lain dibalas `"ev":"need_auth"` dan diabaikan.

```json
{"cmd":"auth","code":"1234"}                    // buka kunci sesi ini → ev auth_ok / bad_code / locked
{"cmd":"logout"}                                // kunci lagi sesi ini
{"cmd":"security","code":"<kode saat ini>","newcode":"5678","appass":"sandiBaru8","btpin":"246810"}
                                                // ganti kredensial (field opsional, minimal satu) → ev saved / bad_*
```

- Perintah kontrol juga boleh membawa `"code"` langsung (alternatif `auth` untuk HTTP).
- Proteksi tebak kode **per klien** (firmware 0.3.2+): Bluetooth punya hitungan sendiri, klien WiFi dihitung per **alamat IP**
  (HTTP dan WebSocket dari IP yang sama berbagi hitungan; sambung ulang tidak mereset). Salah 5× → klien itu saja ditolak
  30 detik (`ev":"locked"`, field `lock` = sisa detik). Setelah pernah dikunci, tiap salah berikutnya langsung mengunci lagi
  2× lebih lama: 30 dtk → 1 → 2 → 4 → 8 → maks 15 menit. Kode benar mereset; 15 menit tanpa salah juga mereset.
  Penyerang di WiFi tidak bisa mengunci pemilik di Bluetooth atau di IP lain. Tabel menyimpan 8 IP; kalau penuh oleh IP yang
  sedang dihukum, IP WiFi **baru** ikut ditahan sampai ada slot bebas (Bluetooth dan sesi yang sudah login tidak terpengaruh).
- `GET /api/status` membawa `lock` milik IP peminta (tanpa `auth`/`ev`).
- `newcode` 4–12 karakter ASCII tanpa spasi · `appass` 8–63 karakter (AP restart ±2 detik) · `btpin` tepat 6 angka (pairing lama dihapus).
- Ganti `newcode` mengunci semua sesi lain; sesi yang mengganti tetap terbuka.
- Tahan tombol BOOT (GPIO0) 8 detik saat jalan → kredensial kembali default (`1234` / `rzmong123` / `123456`), `ev":"reset"`.

## Perintah (HP → modul)

```json
{"cmd":"preset","id":1}                         // 0 Parkir, 1 Jalan, 2 Tinggi
{"cmd":"set","axle":"front","psi":45}           // ubah target preset AKTIF (15–110), disimpan ke flash
{"cmd":"auto","rise":true,"drop":false}         // naik saat ACC hidup / turun saat ACC mati
{"cmd":"theme","id":1}                          // tema layar bulat: 0 siang, 1 malam, 2 stance
{"cmd":"manual","axle":"front","action":"fill"} // fill | dump | stop (tahan tombol → kirim stop saat dilepas)
{"cmd":"stop"}                                  // semua katup tutup + leveling otomatis BERHENTI sampai preset dipilih
{"cmd":"wifi","ssid":"Router","pass":"rahasia"} // WiFi STA; ssid ≤32, pass kosong atau 8–63 (selain itu bad_input)
{"cmd":"wifi","appass":"sandiBaru8","code":"…"} // (lama) ganti sandi SoftAP; 0.3.2+: wajib "code" saat ini, berlaku ±2 detik
```

Semua perintah di atas kecuali `stop` butuh sesi yang sudah `auth`.

Perilaku katup (firmware 0.3.1+):
- `manual` memegang katup as itu dan **menimpa** leveling otomatis selama tombol ditahan. Katup menutup sendiri kalau:
  `action:"stop"` datang, koneksi pengirim (BLE / WebSocket) putus, sudah 20 dtk (`MANUAL_MAX_MS`), atau tekanan mencapai
  `BAG_MAX` (isi) / `BAG_MIN` (buang). Setelah dilepas, leveling otomatis kembali ke target preset.
- `stop` menutup semua katup dan menahan leveling (`"hold":true`) sampai `preset` atau `set` dikirim, atau ACC memicu
  naik/turun otomatis. Manual tetap bisa dipakai saat hold. Mulai 0.3.2 hold **disimpan di flash** (NVS `rzm`/`hold`, ditulis
  hanya saat berubah), jadi tetap aktif setelah listrik putus, restart, atau watchdog.
- `preset`/`set` juga membuka kunci fault (`bocor`, `buang macet`, `kompresor`) untuk mencoba lagi.
- `set` dengan `axle` selain `front`/`rear` ditolak (`ev":"bad_input"`).

## Status (modul → HP)

```json
{"tank":150,"front":48,"rear":46,"preset":1,"comp":false,"rise":true,"drop":false,
 "theme":1,"pf":50,"pr":55,"fault":""}
```

`pf`/`pr` = target depan/belakang preset aktif. `hold` (hanya ada saat true) = STOP aktif.

`fault` (satu teks, yang paling penting): `"sensor ADS1115"` (modul ADC tidak menjawab), `"sensor tangki"` /
`"sensor depan"` / `"sensor belakang"` (tegangan di luar 0,25–4,75 V: kabel putus/korslet), `"depan bocor"` /
`"belakang bocor"` (isi >90 dtk tanpa sampai target), `"depan buang macet"` / `"belakang buang macet"` (buang >90 dtk),
`"kompresor >10 mnt"` (kompresor nyala 10 menit tanpa tangki penuh), `"STOP: pilih preset"`.
Sensor rusak → katup as itu / kompresor tidak dijalankan. Fault bocor/buang macet/kompresor dikunci sampai `preset`/`set`.

Field keamanan (firmware 0.3.0+): `auth` (bool, sesi ini terbuka?), `ev` (sekali kirim: `auth_ok`, `bad_code`, `locked`,
`need_auth`, `saved`, `bad_newcode`, `bad_appass`, `bad_btpin`, `bad_input`, `logout`, `reset`), `def` (hanya ke sesi terbuka:
masih ada kredensial default), `lock` (detik sisa kunci salah kode), `boot` (detik tombol BOOT sedang ditahan).
`GET /api/status` tidak punya sesi, jadi tidak membawa `auth`/`ev`. **Kode, sandi, dan PIN tidak pernah ada di status.**
UI juga siap membaca field opsional `speed` (km/j) dan `acc` (bool) kalau nanti firmware menambahkannya.
