# Protokol kontrol RZMONG Airsuspension (BLE & WiFi)

Perintah dan status **sama persis** di Bluetooth dan WiFi: satu objek JSON per baris, diakhiri `\n`.

## Bluetooth LE

| Item | Nilai |
|---|---|
| Nama perangkat | `RZM-AIR` (UUID service belum diiklankan — cari berdasarkan nama) |
| Service | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART) |
| RX (HP → modul, write) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| TX (modul → HP, notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

Firmware menumpuk tulisan sampai ketemu `\n`, jadi UI memotong perintah per 20 byte (aman di MTU 23).
Status dikirim tiap 250 ms selama ada HP tersambung. Status ±180 byte, butuh MTU besar
(Chrome dan plugin Android otomatis minta MTU 512).

## WiFi

| Item | Nilai |
|---|---|
| SoftAP | SSID `RZMONG-AIR`, sandi default `rzmong123`, IP `192.168.4.1` (selalu aktif) |
| STA (opsional) | kirim `{"cmd":"wifi","ssid":"…","pass":"…"}`; ssid kosong = matikan STA |
| mDNS | `rzmong-air.local` |
| Halaman kontrol | `http://192.168.4.1/` — UI `web/control` disajikan dari flash ESP32 |
| WebSocket | `ws://192.168.4.1:81/` — status tiap 250 ms; kirim baris perintah sebagai teks |
| `GET /api/status` | status JSON |
| `POST /api/cmd` | body = satu/lebih baris perintah JSON (Content-Type bebas, UI pakai `text/plain`); balasan = status |

Status WiFi menambah field `ip` (IP STA kalau tersambung, kalau tidak IP AP), `sta` (bool), `ble` (bool).
CORS dibuka (`*`). Catatan: halaman HTTPS (GitHub Pages) **tidak bisa** memanggil `http://192.168.4.1`
karena aturan mixed content browser — buka UI dari modul langsung, pakai aplikasi Android, atau server lokal http.

## Perintah (HP → modul)

```json
{"cmd":"preset","id":1}                         // 0 Parkir, 1 Jalan, 2 Tinggi
{"cmd":"set","axle":"front","psi":45}           // ubah target preset AKTIF (15–110), disimpan ke flash
{"cmd":"auto","rise":true,"drop":false}         // naik saat ACC hidup / turun saat ACC mati
{"cmd":"theme","id":1}                          // tema layar bulat: 0 siang, 1 malam, 2 stance
{"cmd":"manual","axle":"front","action":"fill"} // fill | dump | stop
{"cmd":"stop"}                                  // semua katup tutup
{"cmd":"wifi","ssid":"Router","pass":"rahasia"} // WiFi STA (khusus firmware dengan WiFi)
{"cmd":"wifi","appass":"sandiBaru8"}            // ganti sandi SoftAP, berlaku setelah restart
```

## Status (modul → HP)

```json
{"tank":150,"front":48,"rear":46,"preset":1,"comp":false,"rise":true,"drop":false,
 "theme":1,"pf":50,"pr":55,"fault":""}
```

`pf`/`pr` = target depan/belakang preset aktif. `fault` contoh: `"depan bocor"`.
UI juga siap membaca field opsional `speed` (km/j) dan `acc` (bool) kalau nanti firmware menambahkannya.
