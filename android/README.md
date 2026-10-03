# Aplikasi Android RZMONG Airsuspension (Capacitor)

Membungkus `web/control` (satu sumber UI) jadi APK. Bluetooth memakai
`@capacitor-community/bluetooth-le` (BLE native, karena WebView Android tidak punya Web Bluetooth).
WiFi memakai WebSocket/HTTP ke modul (`192.168.4.1` default); cleartext diizinkan lewat
`network_security_config.xml`, dan WebView dimuat dari `http://localhost` (`androidScheme: http`) supaya
tidak kena blokir mixed content.

```bash
cd android
npm ci
npm run build            # bundel ble-native.js + salin web/control → www
npx cap sync android
cd android && ./gradlew assembleDebug   # butuh JDK 21 + Android SDK 35
# APK: android/android/app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions (`.github/workflows/android.yml`) membangun APK debug otomatis → artifact `rzmong-air-debug-apk`.
Push tag `v*` untuk melampirkannya ke Releases.

Izin: Android 12+ meminta "Perangkat sekitar" (BLUETOOTH_SCAN/CONNECT). Android ≤ 11 meminta lokasi
dan lokasi HP harus aktif agar scan BLE jalan.

## Keamanan (firmware 0.3.0+)

UI aplikasi sama dengan `web/control`, jadi jendela **KODE AKSES** dan kartu **🔒 KEAMANAN** ikut ada di APK.
Saat pertama sambung Bluetooth, Android memunculkan dialog pairing → masukkan PIN Bluetooth (default `123456`).
Kalau PIN modul diganti atau direset lewat tombol BOOT, hapus dulu pairing lama: **Pengaturan → Bluetooth → RZM-AIR → Lupakan**.

## Dashboard & remote internet (firmware 0.4.0+)

APK memakai UI yang sama, jadi tampilan **DASHBOARD** (default, tombol ▦/◎ untuk ganti ke klasik) dan jalur **🌐 INTERNET** ikut ada.
Jalur INTERNET tersambung ke broker MQTT lewat `wss` (izin `INTERNET` sudah ada di manifest), jadi bisa mengontrol mobil dari mana saja
asal modul tersambung WiFi router. Setup broker & keamanan: `docs/REMOTE.md`.
