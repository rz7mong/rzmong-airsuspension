# vendor/

- `ble-native.js` — bundel plugin BLE Capacitor (dibuat `npm run bundle:ble` di `android/`).
- `mqtt.min.js` — [MQTT.js](https://github.com/mqttjs/MQTT.js) v5.16.0 (lisensi MIT), `dist/mqtt.min.js` dari npm.
  Dipakai jalur **INTERNET** (remote lewat broker MQTT, wss). Dimuat hanya saat jalur INTERNET dipilih,
  dan **tidak** ikut dibundel ke flash ESP32 (`tools/embed_web.py`), karena dari WiFi AP modul memang tidak ada internet.
  Update: `npm pack mqtt@5 && tar xzf mqtt-*.tgz && cp package/dist/mqtt.min.js web/control/vendor/`.
