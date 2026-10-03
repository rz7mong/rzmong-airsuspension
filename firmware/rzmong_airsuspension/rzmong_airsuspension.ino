#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLESecurity.h>
#include <esp_gap_ble_api.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_GC9A01A.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>  // library "WebSockets" oleh Markus Sattler (links2004)
#include "web_assets.h"        // kontroler web (gzip), dibuat oleh tools/embed_web.py
#include <WiFiClientSecure.h>
#include <PubSubClient.h>      // library "PubSubClient" oleh Nick O'Leary (knolleary)
#include <mbedtls/md.h>
#include "remote_ca.h"         // root CA untuk MQTT TLS
#include <mutex>
#include <atomic>

// Aktif-low untuk papan relay umum. Balik jika katup terbalik.
#define RELAY_ON LOW
#define RELAY_OFF HIGH

#define PIN_FILL_F 25
#define PIN_DUMP_F 26
#define PIN_FILL_R 27
#define PIN_DUMP_R 14
#define PIN_COMP 13
#define PIN_ACC 34

#define TFT_CS 5
#define TFT_DC 16
#define TFT_RST 17

#define PSI_MIN_V 0.5f
#define PSI_MAX_V 4.5f
#define PSI_RANGE 200.0f
#define DEADBAND 2.0f
#define FILL_TIMEOUT_MS 90000   // isi lebih lama dari ini tanpa sampai target → "bocor", katup as dikunci tutup
#define DUMP_TIMEOUT_MS 90000   // buang lebih lama dari ini → "buang macet", katup as dikunci tutup
#define MANUAL_MAX_MS 20000     // tombol manual ▲/▼: katup menutup sendiri kalau pesan "stop" tidak datang
#define COMP_MAX_MS 600000UL    // kompresor nyala terus >10 menit tanpa tangki penuh → dimatikan (tangki/selang bocor?)
#define ACC_DEBOUNCE_MS 500     // ACC harus stabil sekian lama (abaikan tegangan drop saat starter)
#define SENSOR_V_MIN 0.25f      // sensor 0,5–4,5 V: di luar rentang ini = kabel putus / korslet
#define SENSOR_V_MAX 4.75f
#define SENSOR_BAD_READS 3      // baca salah berturut-turut sebelum sensor dianggap rusak
#define SENSOR_GOOD_READS 5     // baca benar berturut-turut sebelum sensor dipercaya lagi
#define ADS_TIMEOUT_MS 30       // batas tunggu satu konversi ADS1115 (normal ±8 ms)
#define ADS_RETRY_MS 2000       // coba sambung ulang ADS1115 tiap 2 detik kalau hilang
#define BAG_MIN 15
#define BAG_MAX 110
#define TANK_ON 145
#define TANK_OFF 165

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define RX_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define TX_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

// WiFi: SoftAP selalu aktif, STA (router/hotspot) opsional lewat perintah {"cmd":"wifi",...}
#define FW_VERSION "0.4.0"

#define AP_SSID "RZMONG-AIR"
#define AP_PASS_DEFAULT "rzmong123"
#define MDNS_NAME "rzmong-air"
#define HTTP_PORT 80
#define WS_PORT 81

// ---------- Keamanan akses (kredensial disimpan di NVS namespace "rzmsec") ----------
// Default dipakai saat pertama kali flash atau setelah reset kredensial (tahan tombol BOOT).
#define ACCESS_CODE_DEFAULT "1234"   // kode akses UI/API (4–12 karakter)
#define BT_PIN_DEFAULT 123456        // PIN pairing Bluetooth (6 digit, passkey BLE)
#define AUTH_MAX_FAIL 5              // salah kode berturut-turut (per klien) sebelum dikunci
#define AUTH_LOCK_MS 30000           // kunci pertama; tiap kunci berikutnya 2× lebih lama
#define AUTH_LOCK_MAX_MS 900000UL    // kunci terlama 15 menit
#define AUTH_DECAY_MS 900000UL       // 15 menit tanpa salah → hitungan klien itu kembali nol
#define AUTH_SLOTS 9                 // slot 0 = Bluetooth, 1..8 = alamat IP klien WiFi (HTTP + WebSocket)
#define KEY_BLE 0xFFFFFFFFu          // kunci slot Bluetooth (bukan alamat IP yang mungkin)
// Remote internet (0.4.0+): klien web/app dibedakan per "c" (id klien acak yang disimpan di HP) dan punya
// kolam slot SENDIRI → penebak lewat internet tidak bisa mengunci pemilik di Bluetooth/WiFi lokal, dan sebaliknya.
// Kunci remote = 0xFE00xx00: sebagai IPv4 (byte rendah = oktet pertama di ESP32) berarti 0.x.x.254 → mustahil jadi IP klien.
#define RM_AUTH_SLOTS 4
#define KEY_RM_ANON 0xFE000000u
// Tombol BOOT papan ESP32 DevKit (esp32dev) = GPIO0, aktif-low. ESP32-C3 = GPIO9 (ubah kalau ganti papan).
// Hanya dibaca saat firmware sudah jalan; menahan BOOT ketika dinyalakan tetap masuk mode download.
#define PIN_BOOT 0
#define PIN_LED 2                    // LED biru bawaan DevKit (kalau ada)
#define BOOT_RESET_MS 8000           // tahan BOOT 8 detik → reset kredensial ke default

// ---------- Remote internet (MQTT lewat TLS, firmware 0.4.0+) — MATI secara default ----------
// Modul (mode STA ke WiFi router/hotspot) → broker MQTT TLS port 8883 (mis. EMQX Cloud Serverless / HiveMQ Cloud).
// Web/aplikasi → broker yang sama lewat MQTT-over-WebSocket aman (wss: EMQX 8084, HiveMQ 8884).
// Topik: rzm/<id>/status (retained), rzm/<id>/online (retained, LWT "0"), rzm/<id>/cmd, rzm/<id>/evt.
// Setiap perintah remote ditandatangani HMAC-SHA256 dengan kode akses (kecuali STOP). Lihat docs/REMOTE.md.
#define RM_MSG_MAX 480               // panjang maksimal pesan perintah dari broker
#define RM_STATUS_MS 1000            // telemetri "live" paling cepat 1x/detik (hanya kalau ada perubahan)
#define RM_SLOW_MS 30000             // tanpa penonton: paling cepat tiap 30 detik (hemat kuota broker)
#define RM_IDLE_MS 300000            // detak minimal tiap 5 menit walau tidak berubah
#define RM_LIVE_MS 60000             // web/app kirim {"cmd":"live"} tiap ±20 dtk → mode live 60 dtk
#define RM_TASK_STACK 10240          // stack task MQTT (TLS butuh ruang)

Adafruit_ADS1115 ads;
Adafruit_GC9A01A tft(TFT_CS, TFT_DC, TFT_RST);
Preferences prefs;
BLECharacteristic *txChar;
std::atomic<bool> bleConnected{false};
bool displayOk = false;

struct Preset { int front; int rear; };
Preset presets[3] = {{25, 25}, {50, 55}, {75, 80}};
int activePreset = 1;
bool riseOnStart = true;
bool dropOnStop = false;
int theme = 1;

float tankPsi = 0, frontPsi = 0, rearPsi = 0;
bool accOn = false;
String fault = "";

// Sensor tekanan: 0 tangki, 1 depan, 2 belakang. Katup/kompresor hanya dikendalikan kalau sensornya valid.
bool adsOk = false;
uint32_t adsRetryAt = 0;
bool sensorOk[3] = {false, false, false};
uint8_t sensorBad[3] = {0, 0, 0}, sensorGood[3] = {0, 0, 0};

// STOP: leveling otomatis berhenti sampai pengguna memilih preset / mengubah target (atau ACC otomatis).
bool levelHold = false;
bool compRunning = false, compFault = false;
uint32_t compStart = 0;

enum ManualAct : uint8_t { MAN_NONE = 0, MAN_FILL = 1, MAN_DUMP = 2 };
struct Axle {
  const char *name;
  int fillPin, dumpPin;
  bool filling, dumping;
  uint32_t started;
  const char *latched;   // "bocor" / "buang macet" → katup as ini dikunci tutup sampai preset dipilih lagi
  uint8_t manual;        // ManualAct
  uint32_t manualAt;
  uint8_t manualBy;      // pemilik perintah manual: 0 BLE, 1..8 WebSocket, 254 remote, 255 HTTP
};
Axle axF = {"depan", PIN_FILL_F, PIN_DUMP_F, false, false, 0, nullptr, MAN_NONE, 0, 0};
Axle axR = {"belakang", PIN_FILL_R, PIN_DUMP_R, false, false, 0, nullptr, MAN_NONE, 0, 0};

// BLE: callback jalan di task Bluetooth (core 0), loop() di core 1 → buffer bersama dilindungi mutex.
std::mutex bleMx;
String bleRxShared;            // ditulis callback BLE (pegang bleMx)
bool bleConnEvt = false;       // ada connect/disconnect yang belum diproses loop() (pegang bleMx)
String rxLine;                 // hanya dipakai loop()

WebServer http(HTTP_PORT);
WebSocketsServer ws(WS_PORT);
String staSsid, staPass, apPass;

// Kredensial akses (jangan pernah dikirim di status JSON).
Preferences secPrefs;
String accessCode = ACCESS_CODE_DEFAULT;
uint32_t btPin = BT_PIN_DEFAULT;
// Proteksi tebak kode PER KLIEN: Bluetooth punya slot sendiri, klien WiFi dibedakan per alamat IP (HTTP dan
// WebSocket dari IP yang sama berbagi slot, jadi ganti jalur / sambung ulang tidak mereset hitungan).
// Penyerang di WiFi hanya mengunci dirinya sendiri, tidak bisa mengunci pemilik di Bluetooth atau IP lain.
struct AuthSlot { uint32_t key; bool used; uint8_t fails; uint8_t level; uint32_t lockUntil; uint32_t lastFail; };
AuthSlot authSlots[AUTH_SLOTS + RM_AUTH_SLOTS];   // [0] BLE · [1..8] IP WiFi · [9..12] klien remote
uint32_t apRestartAt = 0;        // >0 → SoftAP dinyalakan ulang dengan sandi baru pada millis() ini
uint32_t bootHoldMs = 0;         // lama tombol BOOT ditahan (untuk layar)
uint32_t resetNoticeUntil = 0;   // tampilkan "KREDENSIAL DIRESET" di layar sampai waktu ini

// Satu sesi per koneksi: BLE (satu HP), tiap klien WebSocket, dan tiap request HTTP.
struct Session { bool authed; const char *ev; uint32_t key; bool info; };  // key = KEY_BLE / alamat IP / KEY_REMOTE…; info → kirim id remote sekali
Session bleSession = {false, nullptr, KEY_BLE, false};
#define WS_SLOTS 8
Session wsSession[WS_SLOTS];
Session rmSession = {true, nullptr, KEY_RM_ANON, false};   // perintah remote internet (sudah lolos HMAC per pesan)

class RxCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue().c_str();
    std::lock_guard<std::mutex> g(bleMx);
    if (bleRxShared.length() + v.length() > 1024) bleRxShared = "";  // loop() tertinggal jauh → buang
    bleRxShared += v;
  }
};

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    std::lock_guard<std::mutex> g(bleMx);
    bleConnected = true;
    bleRxShared = "";
    bleConnEvt = true;   // sesi direset di loop(), bukan di task BLE
  }
  void onDisconnect(BLEServer *s) override {
    {
      std::lock_guard<std::mutex> g(bleMx);
      bleConnected = false;
      bleRxShared = "";
      bleConnEvt = true;
    }
    s->startAdvertising();
  }
};

// Pairing BLE dengan passkey statis (PIN 6 digit). Karakteristik RX/TX butuh link terenkripsi + MITM,
// jadi HP wajib pairing dengan PIN yang benar sebelum bisa kirim perintah atau menerima status.
class SecCb : public BLESecurityCallbacks {
  uint32_t onPassKeyRequest() override { return btPin; }
  void onPassKeyNotify(uint32_t) override { Serial.println("BLE: HP minta pairing, masukkan PIN Bluetooth di HP"); }
  bool onConfirmPIN(uint32_t) override { return false; }  // tidak ada layar konfirmasi angka → tolak numeric comparison
  bool onSecurityRequest() override { return true; }
  void onAuthenticationComplete(esp_ble_auth_cmpl_t r) override {
    if (r.success) Serial.println("BLE: pairing OK");
    else Serial.printf("BLE: pairing GAGAL (alasan 0x%x) — PIN salah?\n", r.fail_reason);
  }
};


struct Cal { float v0; float vRef; float pRef; bool ready; };
Cal cal[3] = {
  {0.50f, 4.50f, 200.0f, false},
  {0.50f, 4.50f, 200.0f, false},
  {0.50f, 4.50f, 200.0f, false}
};

uint32_t deadlineIn(uint32_t ms) {  // 0 berarti "tidak aktif", jadi hindari hasil 0 saat millis() meluap
  uint32_t t = millis() + ms;
  return t ? t : 1;
}

float voltsToPsi(uint8_t ch, int16_t raw) {
  float v = raw * 0.0001875f;
  float span = cal[ch].vRef - cal[ch].v0;
  if (span < 0.05f) return 0;
  float psi = (v - cal[ch].v0) * (cal[ch].pRef / span);
  return constrain(psi, 0, PSI_RANGE);
}

void setValve(int pin, bool on) { digitalWrite(pin, on ? RELAY_ON : RELAY_OFF); }

// Baca satu kanal ADS1115 dengan batas waktu. readADC_SingleEnded() bawaan library menunggu tanpa batas,
// sehingga modul lepas / kabel I2C putus membuat loop() macet dengan katup di posisi terakhir.
bool readAdc(uint8_t ch, int16_t &raw) {
  ads.startADCReading(MUX_BY_CHANNEL[ch], false);
  uint32_t t0 = millis();
  while (!ads.conversionComplete()) {
    if (millis() - t0 > ADS_TIMEOUT_MS) return false;
    delay(1);
  }
  raw = ads.getLastConversionResults();
  return true;
}

void readSensors() {
  if (!adsOk && (int32_t)(millis() - adsRetryAt) >= 0) {
    adsOk = ads.begin();
    if (adsOk) { ads.setGain(GAIN_TWOTHIRDS); Serial.println("ADS1115 tersambung"); }
    else adsRetryAt = deadlineIn(ADS_RETRY_MS);
  }
  float *psi[3] = {&tankPsi, &frontPsi, &rearPsi};
  for (uint8_t ch = 0; ch < 3; ch++) {
    int16_t raw = 0;
    bool read = adsOk && readAdc(ch, raw);
    if (adsOk && !read) {
      adsOk = false;
      adsRetryAt = deadlineIn(ADS_RETRY_MS);
      Serial.println("ADS1115 tidak menjawab — semua katup & kompresor dimatikan");
    }
    float v = raw * 0.0001875f;
    bool inRange = read && v >= SENSOR_V_MIN && v <= SENSOR_V_MAX;
    if (!read) {
      sensorOk[ch] = false; sensorGood[ch] = 0; sensorBad[ch] = SENSOR_BAD_READS;
    } else if (!inRange) {
      sensorGood[ch] = 0;
      if (sensorBad[ch] < SENSOR_BAD_READS && ++sensorBad[ch] >= SENSOR_BAD_READS) sensorOk[ch] = false;
    } else {
      sensorBad[ch] = 0;
      if (!sensorOk[ch] && ++sensorGood[ch] >= SENSOR_GOOD_READS) sensorOk[ch] = true;
    }
    if (inRange) *psi[ch] = voltsToPsi(ch, raw);   // nilai di luar rentang tidak dipakai (tetap nilai terakhir)
    else if (!sensorOk[ch]) *psi[ch] = 0;
  }
}

void allValvesOff() {
  setValve(PIN_FILL_F, false);
  setValve(PIN_DUMP_F, false);
  setValve(PIN_FILL_R, false);
  setValve(PIN_DUMP_R, false);
}

// Tulis ke flash hanya kalau nilainya berubah (mengurangi keausan flash saat slider/preset sering dipakai).
void savePrefs() {
  Preset old[3];
  if (prefs.getBytes("presets", old, sizeof(old)) != sizeof(old) || memcmp(old, presets, sizeof(old)))
    prefs.putBytes("presets", presets, sizeof(presets));
  if (prefs.getInt("preset", -1) != activePreset) prefs.putInt("preset", activePreset);
  if (!prefs.isKey("rise") || prefs.getBool("rise") != riseOnStart) prefs.putBool("rise", riseOnStart);
  if (!prefs.isKey("drop") || prefs.getBool("drop") != dropOnStop) prefs.putBool("drop", dropOnStop);
  if (prefs.getInt("theme", -1) != theme) prefs.putInt("theme", theme);
}

// STOP disimpan di flash: setelah restart / watchdog, leveling tetap berhenti sampai preset dipilih.
void setHold(bool h) {
  if (levelHold == h) return;
  levelHold = h;
  prefs.putBool("hold", h);   // hanya saat berubah
}

void loadPrefs() {
  prefs.begin("rzm", false);
  if (prefs.isKey("presets")) prefs.getBytes("presets", presets, sizeof(presets));
  activePreset = constrain(prefs.getInt("preset", 1), 0, 2);   // NVS rusak tidak boleh jadi indeks di luar presets[]
  riseOnStart = prefs.getBool("rise", true);
  dropOnStop = prefs.getBool("drop", false);
  theme = constrain(prefs.getInt("theme", 1), 0, 2);
  levelHold = prefs.getBool("hold", false);
  if (levelHold) Serial.println("STOP masih aktif dari sebelum restart — pilih preset untuk melanjutkan leveling");
  for (Preset &p : presets) { p.front = constrain(p.front, BAG_MIN, BAG_MAX); p.rear = constrain(p.rear, BAG_MIN, BAG_MAX); }
}

// Satu as: manual (selama tombol ditahan) > leveling otomatis. Katup isi & buang tidak pernah terbuka bersamaan.
void applyAxle(Axle &a, float actual, bool ok, int target) {
  uint32_t now = millis();
  bool fill = false, dump = false;
  if (a.manual) {
    bool expired = now - a.manualAt > MANUAL_MAX_MS;
    bool limit = ok && ((a.manual == MAN_FILL && actual >= BAG_MAX) || (a.manual == MAN_DUMP && actual <= BAG_MIN));
    if (expired || limit) a.manual = MAN_NONE;
    else { fill = a.manual == MAN_FILL; dump = a.manual == MAN_DUMP; }
    a.filling = a.dumping = false;
  } else if (ok && !levelHold && !a.latched) {
    target = constrain(target, BAG_MIN, BAG_MAX);
    fill = actual < target - DEADBAND;
    dump = actual > target + DEADBAND;
    if (fill) {
      if (!a.filling) { a.filling = true; a.started = now; }
      else if (now - a.started > FILL_TIMEOUT_MS) { a.latched = "bocor"; fill = false; }
    } else a.filling = false;
    if (dump) {
      if (!a.dumping) { a.dumping = true; a.started = now; }
      else if (now - a.started > DUMP_TIMEOUT_MS) { a.latched = "buang macet"; dump = false; }
    } else a.dumping = false;
    if (a.latched) { a.filling = a.dumping = false; Serial.printf("Katup %s dikunci tutup: %s\n", a.name, a.latched); }
  } else {
    a.filling = a.dumping = false;
  }
  // Tutup dulu yang harus mati, baru buka yang lain.
  if (!fill) setValve(a.fillPin, false);
  if (!dump) setValve(a.dumpPin, false);
  if (fill) setValve(a.fillPin, true);
  if (dump) setValve(a.dumpPin, true);
}

void cancelManual(uint8_t owner = 0xff, bool all = true) {
  Axle *ax[2] = {&axF, &axR};
  for (Axle *a : ax)
    if (a->manual && (all || a->manualBy == owner)) { a->manual = MAN_NONE; setValve(a->fillPin, false); setValve(a->dumpPin, false); }
}

void controlCompressor() {
  bool want = compRunning;
  if (tankPsi < TANK_ON) want = true;
  if (tankPsi > TANK_OFF) want = false;
  if (!sensorOk[0] || compFault) want = false;
  uint32_t now = millis();
  if (want && !compRunning) compStart = now;
  if (want && compRunning && now - compStart > COMP_MAX_MS) {
    compFault = true;
    want = false;
    Serial.println("Kompresor >10 menit tanpa tangki penuh — dimatikan (cek kebocoran)");
  }
  compRunning = want;
  setValve(PIN_COMP, want);
}

// Teks fault untuk status/layar, urut dari yang paling penting.
void updateFault() {
  String f;
  if (!adsOk) f = "sensor ADS1115";
  else if (!sensorOk[0] && sensorBad[0] >= SENSOR_BAD_READS) f = "sensor tangki";
  else if (!sensorOk[1] && sensorBad[1] >= SENSOR_BAD_READS) f = "sensor depan";
  else if (!sensorOk[2] && sensorBad[2] >= SENSOR_BAD_READS) f = "sensor belakang";
  else if (axF.latched) f = String("depan ") + axF.latched;
  else if (axR.latched) f = String("belakang ") + axR.latched;
  else if (compFault) f = "kompresor >10 mnt";
  else if (levelHold) f = "STOP: pilih preset";
  fault = f;
}

// Preset dipilih / target diubah → lanjutkan leveling dan buka kunci fault (coba lagi).
void resumeLeveling() {
  setHold(false);
  axF.latched = axR.latched = nullptr;
  compFault = false;
}

void buildStatus(JsonDocument &doc, Session *s = nullptr);
void applyWifiSta();
void handleRemoteCfg(JsonDocument &doc, Session &s);
void remoteDisableAfterReset();
uint8_t rmStateCode();
const char *rmIdForStatus();
bool rmIsOn();

// ---------- kredensial ----------
bool sameSecret(const String &a, const char *b) {
  // Bandingkan tanpa berhenti di karakter pertama yang beda (mengurangi kebocoran waktu).
  size_t lb = strlen(b), n = a.length() > lb ? a.length() : lb;
  uint8_t diff = a.length() != lb;
  for (size_t i = 0; i < n; i++) diff |= (uint8_t)(i < a.length() ? a[i] : 0) ^ (uint8_t)(i < lb ? b[i] : 0);
  return diff == 0;
}

bool validCode(const String &c) {
  if (c.length() < 4 || c.length() > 12) return false;
  for (char ch : c) if (ch < 0x21 || ch > 0x7e) return false;  // ASCII terlihat, tanpa spasi
  return true;
}

bool validApPass(const String &p) {
  if (p.length() < 8 || p.length() > 63) return false;  // batas WPA2-PSK
  for (char ch : p) if (ch < 0x20 || ch > 0x7e) return false;
  return true;
}

bool credsAreDefault() {
  return accessCode == ACCESS_CODE_DEFAULT || btPin == BT_PIN_DEFAULT || apPass == AP_PASS_DEFAULT;
}

void applyBtPin() {
  uint32_t pk = btPin;
  esp_ble_gap_set_security_param(ESP_BLE_SM_SET_STATIC_PASSKEY, &pk, sizeof(pk));
}

// Hapus semua HP yang sudah pairing → HP wajib pairing ulang dengan PIN (baru).
void clearBleBonds() {
  int n = esp_ble_get_bond_device_num();
  if (n <= 0) return;
  esp_ble_bond_dev_t *list = (esp_ble_bond_dev_t *)malloc(sizeof(esp_ble_bond_dev_t) * n);
  if (!list) return;
  esp_ble_get_bond_device_list(&n, list);
  for (int i = 0; i < n; i++) esp_ble_remove_bond_device(list[i].bd_addr);
  free(list);
  Serial.printf("BLE: %d pairing lama dihapus\n", n);
}

void logoutAll() {
  bleSession.authed = false;
  for (int i = 0; i < WS_SLOTS; i++) wsSession[i].authed = false;
}

void loadCreds() {
  secPrefs.begin("rzmsec", false);
  accessCode = secPrefs.getString("code", ACCESS_CODE_DEFAULT);
  btPin = secPrefs.getUInt("btpin", BT_PIN_DEFAULT);
  if (!validCode(accessCode)) accessCode = ACCESS_CODE_DEFAULT;
  if (btPin > 999999) btPin = BT_PIN_DEFAULT;
  // Sandi SoftAP dulu disimpan di namespace "rzm" (firmware ≤0.2) → pindahkan sekali.
  if (secPrefs.isKey("appass")) apPass = secPrefs.getString("appass", AP_PASS_DEFAULT);
  else {
    Preferences old;
    old.begin("rzm", true);
    apPass = old.getString("appass", AP_PASS_DEFAULT);
    old.end();
    if (apPass != AP_PASS_DEFAULT && validApPass(apPass)) secPrefs.putString("appass", apPass);
  }
  if (!validApPass(apPass)) apPass = AP_PASS_DEFAULT;
}

// Reset HANYA kredensial (kode akses, sandi WiFi AP, PIN Bluetooth + daftar pairing).
// Kalibrasi sensor ("rzmcal"), preset, otomatis, tema, dan WiFi router (STA) tidak disentuh.
void factoryResetCredentials() {
  secPrefs.clear();
  { Preferences old; old.begin("rzm", false); old.remove("appass"); old.end(); }
  accessCode = ACCESS_CODE_DEFAULT;
  btPin = BT_PIN_DEFAULT;
  apPass = AP_PASS_DEFAULT;
  memset(authSlots, 0, sizeof(authSlots));
  applyBtPin();
  clearBleBonds();
  logoutAll();
  remoteDisableAfterReset();  // remote internet dimatikan (kode kembali 1234 → tidak aman dibiarkan online)
  apRestartAt = deadlineIn(500);
  resetNoticeUntil = deadlineIn(4000);
  bleSession.ev = "reset";
  for (int i = 0; i < WS_SLOTS; i++) wsSession[i].ev = "reset";
  Serial.println("=== KREDENSIAL DIRESET KE DEFAULT ===");
  Serial.printf("Kode akses: %s | WiFi %s sandi: %s | PIN Bluetooth: %06u\n", ACCESS_CODE_DEFAULT, AP_SSID, AP_PASS_DEFAULT, (unsigned)BT_PIN_DEFAULT);
  Serial.println("Kalibrasi & preset tetap. Di HP: lupakan/unpair RZM-AIR lalu pairing ulang.");
}

// Slot WiFi boleh dipakai ulang hanya kalau bersih, atau sudah lama tidak salah dan tidak sedang dikunci,
// supaya penyerang tidak bisa menghapus hukumannya dengan berganti-ganti IP.
bool slotIdle(const AuthSlot &a, uint32_t now) {
  if (!a.used || (a.fails == 0 && a.level == 0)) return true;
  return (a.lockUntil == 0 || (int32_t)(a.lockUntil - now) <= 0) && (int32_t)(now - a.lastFail) > (int32_t)AUTH_DECAY_MS;
}

bool isRemoteKey(uint32_t key) { return (key & 0xFF0000FFu) == KEY_RM_ANON; }
// Kolam slot: WiFi [1, AUTH_SLOTS), remote [AUTH_SLOTS, AUTH_SLOTS + RM_AUTH_SLOTS).
int slotLo(uint32_t key) { return isRemoteKey(key) ? AUTH_SLOTS : 1; }
int slotHi(uint32_t key) { return isRemoteKey(key) ? AUTH_SLOTS + RM_AUTH_SLOTS : AUTH_SLOTS; }

// Cari slot klien. create=true → ambil slot idle kalau belum ada. nullptr = tidak ada / tabel penuh oleh klien yang dihukum.
AuthSlot *authSlot(uint32_t key, bool create) {
  if (key == KEY_BLE) { authSlots[0].key = KEY_BLE; authSlots[0].used = true; return &authSlots[0]; }
  uint32_t now = millis();
  AuthSlot *idle = nullptr;
  for (int i = slotLo(key); i < slotHi(key); i++) {
    AuthSlot &a = authSlots[i];
    if (a.used && a.key == key) return &a;
    if (!idle && slotIdle(a, now)) idle = &a;
  }
  if (!create || !idle) return nullptr;
  *idle = {key, true, 0, 0, 0, 0};
  return idle;
}

uint32_t slotLockLeft(AuthSlot *a) {
  if (!a || !a->lockUntil) return 0;
  int32_t left = (int32_t)(a->lockUntil - millis());
  if (left <= 0) { a->lockUntil = 0; return 0; }
  return left;
}

// Sisa kunci (ms) untuk klien ini. Kalau tabel penuh oleh klien yang dihukum, klien WiFi baru dianggap terkunci.
uint32_t lockLeftMs(uint32_t key) {
  AuthSlot *a = authSlot(key, false);
  if (a) return slotLockLeft(a);
  uint32_t now = millis();
  for (int i = slotLo(key); i < slotHi(key); i++) if (slotIdle(authSlots[i], now)) return 0;
  return AUTH_LOCK_MS;
}

// Cek kode; hitung salah per klien. Setelah dikunci sekali, tiap salah berikutnya (dalam 15 menit) langsung
// mengunci lagi 2× lebih lama: 30 dtk, 1, 2, 4, 8, lalu maks 15 menit.
bool authVerdict(Session &s, bool good);
bool checkCode(const char *code, Session &s) { return authVerdict(s, sameSecret(accessCode, code)); }
// Inti hitung salah per klien; dipakai kode akses lokal DAN tanda tangan HMAC remote (good = tanda tangan cocok).
bool authVerdict(Session &s, bool good) {
  AuthSlot *a = authSlot(s.key, true);
  if (!a) { s.ev = "locked"; return false; }
  uint32_t now = millis();
  if (slotLockLeft(a)) { s.ev = "locked"; return false; }
  // lastFail = saat salah terakhir, atau akhir kunci terakhir (bisa di masa depan) → peluruhan dihitung dari situ.
  if (a->lastFail && (int32_t)(now - a->lastFail) > (int32_t)AUTH_DECAY_MS) { a->fails = 0; a->level = 0; }
  if (good) { a->fails = 0; a->level = 0; a->lastFail = 0; return true; }
  a->lastFail = now ? now : 1;
  if (++a->fails >= AUTH_MAX_FAIL || a->level > 0) {
    uint32_t dur = AUTH_LOCK_MS << (a->level < 5 ? a->level : 5);
    if (dur > AUTH_LOCK_MAX_MS) dur = AUTH_LOCK_MAX_MS;
    a->fails = 0;
    if (a->level < 10) a->level++;
    a->lockUntil = deadlineIn(dur);
    a->lastFail = a->lockUntil;
    s.ev = "locked";
    Serial.printf("Akses: kode salah berulang dari %s, dikunci %u dtk\n", s.key == KEY_BLE ? "Bluetooth" : isRemoteKey(s.key) ? "internet" : "WiFi", (unsigned)(dur / 1000));
  } else s.ev = "bad_code";
  return false;
}

// Ganti kredensial. Wajib menyertakan kode akses SAAT INI di field "code", walau sesi sudah login.
void handleSecurity(JsonDocument &doc, Session &s) {
  const char *cur = doc["code"] | "";
  if (!checkCode(cur, s)) return;
  s.authed = true;
  String newCode = doc["newcode"] | "";
  String newAp = doc["appass"] | "";
  String pinStr = doc["btpin"].is<const char *>() ? String((const char *)doc["btpin"]) : String("");
  if (doc["btpin"].is<int>()) { char b[8]; snprintf(b, sizeof(b), "%06d", (int)doc["btpin"]); pinStr = b; }
  // Validasi semua dulu, simpan hanya kalau semuanya benar.
  if (newCode.length() && !validCode(newCode)) { s.ev = "bad_newcode"; return; }
  if (newAp.length() && !validApPass(newAp)) { s.ev = "bad_appass"; return; }
  bool pinOk = pinStr.length() == 6;
  for (char ch : pinStr) if (ch < '0' || ch > '9') pinOk = false;
  if (pinStr.length() && !pinOk) { s.ev = "bad_btpin"; return; }
  if (!newCode.length() && !newAp.length() && !pinStr.length()) { s.ev = "bad_input"; return; }
  if (newCode.length()) {
    accessCode = newCode;
    secPrefs.putString("code", accessCode);
    logoutAll();      // sesi lain harus login ulang dengan kode baru
    s.authed = true;  // sesi yang mengganti tetap login
    Serial.println("Akses: kode akses diganti");
  }
  if (newAp.length()) {
    apPass = newAp;
    secPrefs.putString("appass", apPass);
    apRestartAt = deadlineIn(2000);  // beri waktu balasan terkirim sebelum WiFi AP restart
    Serial.println("Akses: sandi WiFi AP diganti, AP restart 2 detik lagi");
  }
  if (pinStr.length()) {
    btPin = pinStr.toInt();
    secPrefs.putUInt("btpin", btPin);
    applyBtPin();
    clearBleBonds();
    Serial.println("Akses: PIN Bluetooth diganti, pairing lama dihapus");
  }
  s.ev = "saved";
}

uint8_t sessionOwner(const Session &s) {
  if (&s == &bleSession) return 0;
  if (&s >= wsSession && &s < wsSession + WS_SLOTS) return 1 + (&s - wsSession);
  if (&s == &rmSession) return 254;  // remote internet (isi/buang manual ditolak di rmHandle)
  return 255;  // HTTP (tanpa koneksi tetap) → hanya dibatasi MANUAL_MAX_MS
}

void handleLine(const String &line, Session &s) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) return;
  const char *cmd = doc["cmd"] | "";
  // Perintah tanpa kode akses: auth, logout, stop (keselamatan: menutup katup selalu boleh).
  if (!strcmp(cmd, "auth")) {
    if (checkCode(doc["code"] | "", s)) { s.authed = true; s.ev = "auth_ok"; }
    else s.authed = false;
    return;
  }
  if (!strcmp(cmd, "logout")) { s.authed = false; s.ev = "logout"; return; }
  if (!strcmp(cmd, "security")) { handleSecurity(doc, s); return; }
  if (!strcmp(cmd, "remote")) { handleRemoteCfg(doc, s); return; }   // atur remote internet (wajib "code")
  // Perintah kontrol lain boleh menyertakan "code" langsung (berguna untuk HTTP tanpa sesi).
  if (!s.authed && strcmp(cmd, "stop") && doc["code"].is<const char *>()) {
    if (checkCode(doc["code"], s)) s.authed = true;
    else return;
  }
  if (!s.authed && strcmp(cmd, "stop")) { s.ev = lockLeftMs(s.key) ? "locked" : "need_auth"; return; }
  if (!strcmp(cmd, "rinfo")) { s.info = true; return; }   // minta id perangkat remote (sesi lokal terbuka)
  if (!strcmp(cmd, "preset")) {
    int id = doc["id"] | 1;
    activePreset = constrain(id, 0, 2);
    resumeLeveling();
  } else if (!strcmp(cmd, "set")) {
    const char *axle = doc["axle"] | "front";
    int psi = doc["psi"] | 40;
    if (!strcmp(axle, "front")) presets[activePreset].front = constrain(psi, BAG_MIN, BAG_MAX);
    else if (!strcmp(axle, "rear")) presets[activePreset].rear = constrain(psi, BAG_MIN, BAG_MAX);
    else { s.ev = "bad_input"; return; }
    resumeLeveling();
  } else if (!strcmp(cmd, "auto")) {
    riseOnStart = doc["rise"] | riseOnStart;
    dropOnStop = doc["drop"] | dropOnStop;
  } else if (!strcmp(cmd, "theme")) {
    theme = constrain((int)(doc["id"] | 1), 0, 2);
  } else if (!strcmp(cmd, "manual")) {
    // Katup dipegang applyAxle() selama tombol ditahan; tutup sendiri setelah MANUAL_MAX_MS,
    // saat koneksi pengirim putus, atau saat tekanan mencapai BAG_MAX/BAG_MIN.
    const char *axle = doc["axle"] | "front";
    const char *action = doc["action"] | "stop";
    Axle &a = !strcmp(axle, "rear") ? axR : axF;
    a.manual = !strcmp(action, "fill") ? MAN_FILL : !strcmp(action, "dump") ? MAN_DUMP : MAN_NONE;
    a.manualAt = millis();
    a.manualBy = sessionOwner(s);
    if (!a.manual) { setValve(a.fillPin, false); setValve(a.dumpPin, false); }
    return;
  } else if (!strcmp(cmd, "stop")) {
    // Keselamatan: tutup semua katup DAN hentikan leveling otomatis sampai preset dipilih lagi.
    cancelManual();
    allValvesOff();
    setHold(true);
    axF.filling = axF.dumping = axR.filling = axR.dumping = false;
    Serial.println("STOP: semua katup tutup, leveling otomatis berhenti sampai preset dipilih");
    return;
  } else if (!strcmp(cmd, "wifi")) {
    // {"cmd":"wifi","ssid":"Router","pass":"rahasia"} → sambung ke router (STA). ssid kosong = matikan STA.
    // {"cmd":"wifi","appass":"minimal8"} → ganti password SoftAP (berlaku setelah restart).
    if (doc["ssid"].is<const char *>()) {
      String ssid = (const char *)doc["ssid"], pass = doc["pass"] | "";
      // Batas WiFi: SSID ≤32 byte, sandi kosong (jaringan terbuka) atau 8–63 karakter.
      if (ssid.length() > 32 || (pass.length() && (pass.length() < 8 || pass.length() > 63))) { s.ev = "bad_input"; return; }
      staSsid = ssid;
      staPass = pass;
      prefs.putString("ssid", staSsid);
      prefs.putString("spass", staPass);
      applyWifiSta();
    }
    if (doc["appass"].is<const char *>()) {
      // Kompatibel dengan UI lama; sekarang disimpan di "rzmsec" dan langsung diterapkan.
      // Sama seperti "security": wajib membawa kode akses saat ini, walau sesi sudah login.
      if (!doc["code"].is<const char *>()) { s.ev = "bad_code"; return; }
      if (!checkCode(doc["code"], s)) return;
      String p = (const char *)doc["appass"];
      if (validApPass(p)) {
        apPass = p;
        secPrefs.putString("appass", apPass);
        apRestartAt = deadlineIn(2000);
        s.ev = "saved";
      } else s.ev = "bad_appass";
    }
    return;
  }
  savePrefs();
}

void pollBle() {
  bool evt;
  {
    std::lock_guard<std::mutex> g(bleMx);
    evt = bleConnEvt;
    bleConnEvt = false;
    if (evt) rxLine = "";
    rxLine += bleRxShared;
    bleRxShared = "";
  }
  if (evt) {               // HP baru tersambung / putus → sesi terkunci lagi, tombol manual BLE dilepas
    bleSession = {false, nullptr, KEY_BLE};
    cancelManual(0, false);
  }
  if (rxLine.length() > 512) rxLine = "";  // buang sampah tanpa "\n"
  bool replied = false;
  while (rxLine.indexOf('\n') >= 0) {
    int n = rxLine.indexOf('\n');
    handleLine(rxLine.substring(0, n), bleSession);
    rxLine.remove(0, n + 1);
    replied |= bleSession.ev != nullptr;
  }
  static uint32_t last = 0;
  if (!bleConnected || (!replied && millis() - last < 250)) return;
  last = millis();
  JsonDocument doc;
  buildStatus(doc, &bleSession);
  char buf[400];
  size_t len = serializeJson(doc, buf, sizeof(buf) - 2);
  buf[len++] = '\n';
  buf[len] = 0;
  txChar->setValue((uint8_t *)buf, len);
  txChar->notify();
}

// Status yang sama untuk BLE dan WiFi. TIDAK PERNAH memuat kode akses, PIN, atau sandi WiFi.
void buildStatus(JsonDocument &doc, Session *s) {
  doc["tank"] = round(tankPsi);
  doc["front"] = round(frontPsi);
  doc["rear"] = round(rearPsi);
  doc["preset"] = activePreset;
  doc["comp"] = digitalRead(PIN_COMP) == RELAY_ON;
  doc["rise"] = riseOnStart;
  doc["drop"] = dropOnStop;
  doc["theme"] = theme;
  doc["pf"] = presets[activePreset].front;
  doc["pr"] = presets[activePreset].rear;
  doc["fault"] = fault;
  doc["acc"] = accOn;                                // kontak/ACC
  doc["rm"] = rmStateCode();                         // remote internet: 0 mati … 3 online (lihat PROTOKOL)
  if (levelHold) doc["hold"] = true;   // STOP aktif: leveling otomatis berhenti
  if (s) {
    doc["auth"] = s->authed;                         // sesi ini sudah memasukkan kode akses?
    if (s->authed) doc["def"] = credsAreDefault();   // masih pakai kredensial default (hanya ke sesi login)
    if (s->ev) { doc["ev"] = s->ev; s->ev = nullptr; }
    if (s->info && s->authed) { doc["rid"] = rmIdForStatus(); doc["ron"] = rmIsOn(); }
    s->info = false;
  }
  uint32_t lock = s ? lockLeftMs(s->key) : 0;  // sisa kunci untuk klien INI saja
  if (lock) doc["lock"] = (lock + 999) / 1000;      // detik sisa kunci salah kode
  if (bootHoldMs) doc["boot"] = bootHoldMs / 1000;   // tombol BOOT sedang ditahan (detik)
}

void drawGauge(int cx, int cy, int r, float psi, float maxPsi, const char *label, uint16_t color) {
  tft.drawCircle(cx, cy, r, color);
  tft.setTextColor(color);
  tft.setTextSize(1);
  tft.setCursor(cx - 18, cy - r + 8);
  tft.print(label);
  tft.setTextSize(2);
  tft.setCursor(cx - 16, cy - 6);
  tft.print((int)psi);
}

void drawDisplay() {
  if (!displayOk) return;
  static uint32_t last = 0;
  if (millis() - last < 200) return;
  last = millis();
  if (bootHoldMs || (resetNoticeUntil && (int32_t)(resetNoticeUntil - millis()) > 0)) {
    tft.fillScreen(GC9A01A_BLACK);
    tft.setTextColor(GC9A01A_YELLOW);
    tft.setTextSize(2);
    if (bootHoldMs) {
      tft.setCursor(40, 80);
      tft.print("TAHAN BOOT");
      tft.setCursor(40, 110);
      tft.printf("RESET %ds", (int)((BOOT_RESET_MS - min(bootHoldMs, (uint32_t)BOOT_RESET_MS) + 999) / 1000));
      tft.setTextSize(1);
      tft.setCursor(40, 145);
      tft.print("lepas = batal");
    } else {
      tft.setCursor(30, 90);
      tft.print("KREDENSIAL");
      tft.setCursor(30, 120);
      tft.print("DIRESET");
      tft.setTextSize(1);
      tft.setCursor(30, 150);
      tft.print("kode 1234  PIN 123456");
    }
    return;
  }
  uint16_t bg = GC9A01A_BLACK;
  uint16_t fg = GC9A01A_WHITE;
  if (theme == 0) fg = GC9A01A_CYAN;
  if (theme == 2) fg = GC9A01A_RED;
  tft.fillScreen(bg);
  drawGauge(120, 120, 110, tankPsi, 200, "TANK", fg);
  tft.setTextSize(1);
  tft.setCursor(20, 200);
  tft.printf("F %d  R %d", (int)frontPsi, (int)rearPsi);
  if (fault.length()) {
    tft.setTextColor(GC9A01A_RED);
    tft.setCursor(20, 24);
    tft.print(fault);
  }
}

// ---------- WiFi: HTTP REST + WebSocket, protokol sama dengan BLE ----------
void handleLines(const String &text, Session &s) {
  int start = 0;
  while (start < (int)text.length()) {
    int n = text.indexOf('\n', start);
    if (n < 0) n = text.length();
    String line = text.substring(start, n);
    line.trim();
    if (line.length()) handleLine(line, s);
    start = n + 1;
  }
}

// lockKey: untuk GET /api/status (tanpa sesi) → tetap kirim sisa kunci milik IP peminta.
String wifiStatusJson(Session *s = nullptr, uint32_t lockKey = 0) {
  JsonDocument doc;
  buildStatus(doc, s);
  if (!s && lockKey) { uint32_t l = lockLeftMs(lockKey); if (l) doc["lock"] = (l + 999) / 1000; }
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  doc["sta"] = WiFi.status() == WL_CONNECTED;
  doc["ble"] = bleConnected.load();
  String out;
  serializeJson(doc, out);
  return out;
}

void sendCors() {
  http.sendHeader("Access-Control-Allow-Origin", "*");
  http.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  http.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  http.sendHeader("Access-Control-Allow-Private-Network", "true");
}

void serveAsset(const WebAsset &a) {
  http.sendHeader("Content-Encoding", "gzip");
  http.sendHeader("Cache-Control", "no-cache");
  http.send_P(200, a.mime, (const char *)a.data, a.len);
}

void wsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t len) {
  if (num >= WS_SLOTS) return;
  Session &ss = wsSession[num];
  if (type == WStype_CONNECTED) {
    ss = {false, nullptr, (uint32_t)ws.remoteIP(num)};
    String s = wifiStatusJson(&ss) + "\n";
    ws.sendTXT(num, s);
  } else if (type == WStype_DISCONNECTED) {
    ss = {false, nullptr, 0};
    cancelManual(1 + num, false);
  } else if (type == WStype_TEXT) {
    if (len > 1024) return;
    String text;
    text.reserve(len);
    for (size_t i = 0; i < len; i++) text += (char)payload[i];
    handleLines(text, ss);
    String s = wifiStatusJson(&ss) + "\n";  // balas langsung (membawa "auth"/"ev")
    ws.sendTXT(num, s);
  }
}

void startSoftAp() {
  WiFi.softAP(AP_SSID, apPass.c_str());
}

void applyWifiSta() {
  if (staSsid.length()) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(staSsid.c_str(), staPass.c_str());
  } else {
    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
  }
}

void setupWifi() {
  // setup() menutup prefs setelah membaca kalibrasi ("rzmcal"). Buka lagi namespace utama
  // supaya savePrefs() (preset/auto/tema) dan setelan WiFi tetap tersimpan.
  prefs.begin("rzm", false);
  staSsid = prefs.getString("ssid", "");
  staPass = prefs.getString("spass", "");
  // apPass dibaca oleh loadCreds() (namespace "rzmsec").
  WiFi.mode(staSsid.length() ? WIFI_AP_STA : WIFI_AP);
  startSoftAp();
  if (staSsid.length()) WiFi.begin(staSsid.c_str(), staPass.c_str());
  MDNS.begin(MDNS_NAME);

  http.on("/api/status", HTTP_GET, []() { sendCors(); http.send(200, "application/json", wifiStatusJson(nullptr, (uint32_t)http.client().remoteIP())); });
  // HTTP tanpa sesi: body harus diawali {"cmd":"auth","code":"…"} (atau tiap perintah membawa "code").
  http.on("/api/cmd", HTTP_POST, []() {
    sendCors();
    Session hs = {false, nullptr, (uint32_t)http.client().remoteIP(), false};
    String body = http.arg("plain");
    if (body.length() > 2048) { http.send(413, "text/plain", "terlalu besar"); return; }
    handleLines(body, hs);
    http.send(200, "application/json", wifiStatusJson(&hs));
  });
  http.on("/api/cmd", HTTP_OPTIONS, []() { sendCors(); http.send(204); });
  http.on("/api/status", HTTP_OPTIONS, []() { sendCors(); http.send(204); });
  http.on("/", HTTP_GET, []() { serveAsset(WEB_ASSETS[0]); });
  http.onNotFound([]() {
    String uri = http.uri();
    for (size_t i = 0; i < WEB_ASSET_COUNT; i++)
      if (uri == WEB_ASSETS[i].path) { serveAsset(WEB_ASSETS[i]); return; }
    sendCors();
    http.send(404, "text/plain", "tidak ada");
  });
  http.begin();
  ws.begin();
  ws.onEvent(wsEvent);
  MDNS.addService("http", "tcp", HTTP_PORT);
  Serial.printf("WiFi AP %s  IP %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
}

void pollWifi() {
  http.handleClient();
  ws.loop();
  if (apRestartAt && (int32_t)(millis() - apRestartAt) >= 0) {
    apRestartAt = 0;
    WiFi.softAPdisconnect(false);
    startSoftAp();
    Serial.printf("WiFi AP %s dinyalakan ulang dengan sandi baru\n", AP_SSID);
  }
  static uint32_t last = 0;
  if (ws.connectedClients() == 0 || millis() - last < 250) return;
  last = millis();
  // Kirim per klien supaya field "auth"/"ev" sesuai sesi masing-masing.
  for (uint8_t i = 0; i < WS_SLOTS; i++) {
    if (!ws.clientIsConnected(i)) continue;
    String s = wifiStatusJson(&wsSession[i]) + "\n";
    ws.sendTXT(i, s);
  }
}


// ======================= Remote internet (MQTT lewat TLS) =======================
// Desain: semua kerja jaringan yang bisa memblokir (DNS, TLS handshake, reconnect) jalan di task FreeRTOS
// terpisah (core 0). loop() kontrol katup TIDAK pernah menunggu internet: perintah masuk lewat antrean,
// telemetri keluar lewat buffer bersama. Tanpa internet, BLE dan WiFi AP lokal tetap jalan seperti biasa.
struct RmMsg { uint16_t len; char data[RM_MSG_MAX]; };
#define RM_EV_MAX 128
Preferences rmPrefs;
bool rmOn = false;                 // diatur lewat {"cmd":"remote",...} — default MATI
String rmHost, rmUser, rmPass, rmId;
uint16_t rmPort = 8883;
volatile uint8_t rmState = 0;      // 0 mati · 1 tunggu WiFi router · 2 menyambung · 3 online · 4 gagal TLS/jaringan · 5 ditolak broker
volatile bool rmStopReq = false;   // STOP dari remote (diproses duluan, walau antrean penuh)
volatile uint32_t rmCfgGen = 1;    // naik setiap konfigurasi berubah → task menyambung ulang
volatile bool rmForcePub = false;
uint32_t rmLiveUntil = 0;          // >now → ada web/app yang sedang menonton → telemetri 1x/detik
char rmNonce[17] = "";             // nonce sesi broker (baru tiap reconnect) — wajib ada di perintah bertanda tangan
uint32_t rmLastQ = 0;              // nomor urut perintah terakhir yang diterima (anti-replay)
QueueHandle_t rmInQ = nullptr, rmEvQ = nullptr;
SemaphoreHandle_t rmLock = nullptr;
char rmStatusBuf[480];
volatile bool rmStatusDirty = false;
WiFiClientSecure rmTls;
PubSubClient rmMqtt(rmTls);

uint8_t rmStateCode() { return rmOn ? rmState : 0; }
const char *rmIdForStatus() { return rmId.c_str(); }
bool rmIsOn() { return rmOn; }

bool validHost(const String &h) {
  if (h.length() < 3 || h.length() > 100) return false;
  for (char c : h) if (!(isalnum((unsigned char)c) || c == '.' || c == '-')) return false;
  return true;
}
bool validField(const String &v, size_t maxLen) {
  if (v.length() > maxLen) return false;
  for (char c : v) if (c < 0x20 || c > 0x7e) return false;
  return true;
}

void rmNewId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char b[24];
  snprintf(b, sizeof(b), "%02x%02x%02x%02x%02x%02x-%08x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], (unsigned)esp_random());
  rmId = b;
  rmPrefs.putString("id", rmId);
}

void loadRemote() {
  rmPrefs.begin("rzmrm", false);
  rmOn = rmPrefs.getBool("on", false);
  rmHost = rmPrefs.getString("host", "");
  rmPort = rmPrefs.getUShort("port", 8883);
  rmUser = rmPrefs.getString("user", "");
  rmPass = rmPrefs.getString("pass", "");
  rmId = rmPrefs.getString("id", "");
  if (rmId.length() < 10) rmNewId();
}

void rmCallback(char *, byte *payload, unsigned int len) {
  // Jalan di task MQTT: jangan sentuh katup/JSON besar di sini, cukup salin ke antrean.
  if (len == 0 || len >= RM_MSG_MAX) return;
  if (payload[0] == '{' && len < 64) {
    char tmp[64];
    memcpy(tmp, payload, len);
    tmp[len] = 0;
    if (strstr(tmp, "\"cmd\":\"stop\"")) rmStopReq = true;   // STOP tetap sampai walau antrean penuh
  }
  RmMsg *m = (RmMsg *)malloc(sizeof(RmMsg));
  if (!m) return;
  m->len = len;
  memcpy(m->data, payload, len);
  m->data[len] = 0;
  if (xQueueSend(rmInQ, m, 0) != pdTRUE) Serial.println("Remote: antrean perintah penuh, dibuang");
  free(m);
}

void rmTask(void *) {
  uint32_t gen = 0, backoff = 2000, nextTry = 0, lastHeapLog = 0;
  bool on = false;
  String host, user, pass, id, tStatus, tOnline, tCmd, tEvt;
  uint16_t port = 8883;
  static char out[sizeof(rmStatusBuf)];
  for (;;) {
    if (gen != rmCfgGen) {
      if (rmMqtt.connected()) { rmMqtt.publish(tOnline.c_str(), "0", true); rmMqtt.disconnect(); }
      rmTls.stop();
      xSemaphoreTake(rmLock, portMAX_DELAY);
      gen = rmCfgGen; on = rmOn; host = rmHost; port = rmPort; user = rmUser; pass = rmPass; id = rmId;
      xSemaphoreGive(rmLock);
      String base = "rzm/" + id + "/";
      tStatus = base + "status"; tOnline = base + "online"; tCmd = base + "cmd"; tEvt = base + "evt";
      backoff = 2000; nextTry = 0;
    }
    if (!on || !host.length()) { rmState = 0; vTaskDelay(pdMS_TO_TICKS(300)); continue; }
    if (WiFi.status() != WL_CONNECTED) {
      if (rmMqtt.connected()) rmMqtt.disconnect();
      rmState = 1;
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    if (!rmMqtt.connected()) {
      if (rmState == 3) { Serial.println("Remote: koneksi broker putus, coba lagi"); nextTry = millis() + 1000; rmState = 2; }
      if ((int32_t)(millis() - nextTry) < 0) { vTaskDelay(pdMS_TO_TICKS(100)); continue; }
      rmState = 2;
      Serial.printf("Remote: menyambung ke %s:%u (heap %u)\n", host.c_str(), port, (unsigned)ESP.getFreeHeap());
      rmTls.stop();
      rmTls.setCACert(RM_CA_PEM);
      rmTls.setHandshakeTimeout(15);
      rmMqtt.setServer(host.c_str(), port);
      rmMqtt.setBufferSize(sizeof(rmStatusBuf) + 64);
      rmMqtt.setKeepAlive(30);
      rmMqtt.setSocketTimeout(10);
      rmMqtt.setCallback(rmCallback);
      char nonce[17];
      snprintf(nonce, sizeof(nonce), "%08x%08x", (unsigned)esp_random(), (unsigned)esp_random());
      String cid = "rzm-" + id;
      if (rmMqtt.connect(cid.c_str(), user.c_str(), pass.c_str(), tOnline.c_str(), 1, true, "0")) {
        xSemaphoreTake(rmLock, portMAX_DELAY);
        memcpy(rmNonce, nonce, sizeof(rmNonce));
        rmLastQ = 0;
        xSemaphoreGive(rmLock);
        rmMqtt.subscribe(tCmd.c_str(), 1);
        rmMqtt.publish(tOnline.c_str(), "1", true);
        rmState = 3;
        rmForcePub = true;
        backoff = 2000;
        Serial.printf("Remote: ONLINE topik rzm/%s/… (heap %u)\n", id.c_str(), (unsigned)ESP.getFreeHeap());
      } else {
        int st = rmMqtt.state();
        rmState = (st == MQTT_CONNECT_BAD_CREDENTIALS || st == MQTT_CONNECT_UNAUTHORIZED) ? 5 : 4;
        Serial.printf("Remote: gagal (state %d), coba lagi %u dtk\n", st, (unsigned)(backoff / 1000));
        nextTry = millis() + backoff;
        backoff = min<uint32_t>(backoff * 2, 60000);
      }
      continue;
    }
    rmMqtt.loop();
    if (rmStatusDirty) {
      xSemaphoreTake(rmLock, portMAX_DELAY);
      strlcpy(out, rmStatusBuf, sizeof(out));
      rmStatusDirty = false;
      xSemaphoreGive(rmLock);
      rmMqtt.publish(tStatus.c_str(), out, true);
    }
    char ev[RM_EV_MAX];
    while (xQueueReceive(rmEvQ, ev, 0) == pdTRUE) rmMqtt.publish(tEvt.c_str(), ev, false);
    if (millis() - lastHeapLog > 300000) { lastHeapLog = millis(); Serial.printf("Remote: heap bebas %u\n", (unsigned)ESP.getFreeHeap()); }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setupRemote() {
  loadRemote();
  rmInQ = xQueueCreate(4, sizeof(RmMsg));
  rmEvQ = xQueueCreate(6, RM_EV_MAX);
  rmLock = xSemaphoreCreateMutex();
  // Core 0 (sama dengan stack WiFi); loop() Arduino di core 1 tidak ikut tertahan saat TLS handshake.
  xTaskCreatePinnedToCore(rmTask, "rzm-remote", RM_TASK_STACK, nullptr, 1, nullptr, 0);
  Serial.printf("Remote internet: %s · id %s\n", rmOn ? "AKTIF" : "mati (default)", rmId.c_str());
}

void rmEvent(const char *ev, const char *rid) {
  if (!rmEvQ) return;
  char b[RM_EV_MAX];
  snprintf(b, sizeof(b), "{\"ev\":\"%s\",\"r\":\"%.24s\",\"q\":%u}", ev, rid ? rid : "", (unsigned)rmLastQ);
  xQueueSend(rmEvQ, b, 0);
}

// HMAC-SHA256(kunci = kode akses, pesan = teks JSON persis seperti dikirim) → 64 karakter hex.
void hmacHex(const String &key, const char *msg, size_t len, char out[65]) {
  uint8_t mac[32];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), (const uint8_t *)key.c_str(), key.length(), (const uint8_t *)msg, len, mac);
  for (int i = 0; i < 32; i++) snprintf(out + i * 2, 3, "%02x", mac[i]);
}

// STOP remote lewat jalur yang sama dengan STOP lokal (handleLine), supaya semantik STOP selalu identik.
void rmStop() {
  rmSession = {true, nullptr, KEY_RM_ANON, false};
  handleLine("{\"cmd\":\"stop\"}", rmSession);
}

// Id klien remote ("c", maks 24 karakter dari web/app) → kunci slot 0xFE00xx00 (FNV-1a 16 bit). Tanpa "c" = klien anonim.
uint32_t rmClientKey(const char *c) {
  if (!c || !*c) return KEY_RM_ANON;
  uint32_t h = 2166136261u;
  for (int i = 0; c[i] && i < 24; i++) { h ^= (uint8_t)c[i]; h *= 16777619u; }
  h = (h ^ (h >> 16)) & 0xFFFF;
  return KEY_RM_ANON | ((h ? h : 1) << 8);
}

// Format pesan perintah remote:  "<hmac 64 hex> <json>"   (JSON berisi cmd, n = nonce, q = nomor urut, r = id balasan)
// Pengecualian: {"cmd":"stop"} boleh TANPA tanda tangan (keselamatan).
void rmHandle(const char *data, size_t len) {
  if (data[0] == '{') {
    JsonDocument d;
    if (deserializeJson(d, data, len)) return;
    const char *c = d["cmd"] | "";
    if (!strcmp(c, "stop")) { rmStop(); rmEvent("stop_ok", d["r"] | ""); rmForcePub = true; }
    // "live" hanya mempercepat telemetri (tanpa kontrol) → boleh tanpa tanda tangan.
    else if (!strcmp(c, "live")) { if (!rmLiveUntil || (int32_t)(rmLiveUntil - millis()) < RM_LIVE_MS / 2) rmForcePub = true; rmLiveUntil = deadlineIn(RM_LIVE_MS); }
    return;
  }
  if (len < 67 || data[64] != ' ') return;
  const char *json = data + 65;
  size_t jl = len - 65;
  JsonDocument d;
  if (deserializeJson(d, json, jl)) return;
  const char *rid = d["r"] | "";
  const char *cmd = d["cmd"] | "";
  char nonce[17];
  xSemaphoreTake(rmLock, portMAX_DELAY);
  memcpy(nonce, rmNonce, sizeof(nonce));
  xSemaphoreGive(rmLock);
  if (strcmp(d["n"] | "", nonce)) { rmEvent("stale", rid); return; }   // nonce lama (modul reconnect) → UI ambil nonce baru
  uint32_t q = d["q"] | 0;
  if (q <= rmLastQ) { rmEvent("stale", rid); return; }                 // pesan diulang (replay) / urutan lama
  // Kunci salah kode PER KLIEN remote (kolam slot sendiri, aturan sama dengan lokal: 5x → 30 dtk, lalu bertingkat s/d 15 mnt).
  rmSession = {true, nullptr, rmClientKey(d["c"] | ""), false};
  if (lockLeftMs(rmSession.key)) { rmEvent("locked", rid); return; }
  char want[65];
  hmacHex(accessCode, json, jl, want);
  char got[65];
  memcpy(got, data, 64);
  got[64] = 0;
  if (!authVerdict(rmSession, sameSecret(String(want), got))) { rmEvent(rmSession.ev ? rmSession.ev : "bad_code", rid); return; }
  rmSession.ev = nullptr;
  rmLastQ = q;
  rmLiveUntil = deadlineIn(RM_LIVE_MS);
  rmForcePub = true;
  if (!strcmp(cmd, "security") || !strcmp(cmd, "wifi") || !strcmp(cmd, "remote") || !strcmp(cmd, "rinfo")) { rmEvent("local_only", rid); return; }
  // Isi/buang manual lewat internet ditolak: kalau koneksi putus saat tombol ditahan, katup bisa terus terbuka.
  if (!strcmp(cmd, "manual") && strcmp(d["action"] | "stop", "stop")) { rmEvent("no_manual_remote", rid); return; }
  if (!strcmp(cmd, "auth")) { rmEvent("auth_ok", rid); return; }
  if (!strcmp(cmd, "logout")) { rmEvent("logout", rid); return; }
  String line;
  line.reserve(jl);
  for (size_t i = 0; i < jl; i++) line += json[i];
  handleLine(line, rmSession);   // jalur sama dengan lokal: STOP hold, resumeLeveling, kunci bocor, batas PSI
  rmEvent(rmSession.ev ? rmSession.ev : "ok", rid);
  rmForcePub = true;
  Serial.printf("Remote: perintah %s\n", cmd);
}

void pollRemote() {
  if (!rmInQ) return;
  if (rmStopReq) { rmStopReq = false; rmStop(); }
  static RmMsg m;   // statis: 480 byte jangan di stack loop()
  while (xQueueReceive(rmInQ, &m, 0) == pdTRUE) rmHandle(m.data, m.len);
  static uint32_t lastBuild = 0, lastPub = 0;
  static char lastSig[sizeof(rmStatusBuf)];
  uint32_t now = millis();
  bool live = rmLiveUntil && (int32_t)(rmLiveUntil - now) > 0;
  if (rmState != 3 || (!rmForcePub && now - lastBuild < (live ? RM_STATUS_MS : 1000))) return;
  lastBuild = now;
  JsonDocument doc;
  buildStatus(doc, nullptr);
  char nonce[17];
  xSemaphoreTake(rmLock, portMAX_DELAY);
  memcpy(nonce, rmNonce, sizeof(nonce));
  xSemaphoreGive(rmLock);
  doc["n"] = nonce;
  doc["q"] = rmLastQ;
  doc["fw"] = FW_VERSION;
  doc["sta"] = true;
  char sig[sizeof(rmStatusBuf)];
  serializeJson(doc, sig, sizeof(sig));
  bool changed = strcmp(sig, lastSig) != 0;
  if (!rmForcePub && !(changed && (live || now - lastPub >= RM_SLOW_MS)) && now - lastPub < RM_IDLE_MS) return;
  strlcpy(lastSig, sig, sizeof(lastSig));
  doc["up"] = now / 1000;
  doc["rssi"] = WiFi.RSSI();
  doc["heap"] = ESP.getFreeHeap() / 1024;
  xSemaphoreTake(rmLock, portMAX_DELAY);
  serializeJson(doc, rmStatusBuf, sizeof(rmStatusBuf));
  rmStatusDirty = true;
  xSemaphoreGive(rmLock);
  rmForcePub = false;
  lastPub = now;
}

// {"cmd":"remote","code":"<kode saat ini>","on":true,"host":"xxxx.ala.asia-southeast1.emqxsl.com","port":8883,"user":"…","pass":"…","newid":false}
// Hanya dari sesi LOKAL (BLE / WiFi AP / HTTP). "pass" kosong = sandi lama dipakai. Host/user/sandi tidak pernah dikirim balik.
void handleRemoteCfg(JsonDocument &doc, Session &s) {
  if (!checkCode(doc["code"] | "", s)) return;
  s.authed = true;
  bool on = doc["on"] | rmOn;
  String host = doc["host"].is<const char *>() ? String((const char *)doc["host"]) : rmHost;
  String user = doc["user"].is<const char *>() ? String((const char *)doc["user"]) : rmUser;
  String pass = doc["pass"] | "";
  int port = doc["port"] | (int)rmPort;
  host.trim();
  host.toLowerCase();
  if (host.length() && !validHost(host)) { s.ev = "bad_remote"; return; }
  if (port < 1 || port > 65535 || !validField(user, 64) || !validField(pass, 64)) { s.ev = "bad_remote"; return; }
  if (on && !host.length()) { s.ev = "bad_remote"; return; }
  if (on && accessCode == ACCESS_CODE_DEFAULT) { s.ev = "rm_default_code"; return; }   // wajib ganti kode 1234 dulu
  xSemaphoreTake(rmLock, portMAX_DELAY);
  rmOn = on; rmHost = host; rmPort = port; rmUser = user;
  if (pass.length()) rmPass = pass;
  if (doc["newid"] | false) rmNewId();
  rmCfgGen++;
  xSemaphoreGive(rmLock);
  rmPrefs.putBool("on", rmOn);
  rmPrefs.putString("host", rmHost);
  rmPrefs.putUShort("port", rmPort);
  rmPrefs.putString("user", rmUser);
  if (pass.length()) rmPrefs.putString("pass", rmPass);
  s.ev = "saved";
  s.info = true;
  Serial.printf("Remote internet %s (host %s:%u)%s\n", rmOn ? "AKTIF" : "MATI", rmHost.c_str(), rmPort, staSsid.length() ? "" : " — isi WiFi router dulu (mode STA)!");
}

void remoteDisableAfterReset() {
  if (!rmLock) return;
  xSemaphoreTake(rmLock, portMAX_DELAY);
  rmOn = false;
  rmCfgGen++;
  xSemaphoreGive(rmLock);
  rmPrefs.putBool("on", false);
  Serial.println("Remote internet dimatikan (reset kredensial). Aktifkan lagi di KEAMANAN setelah ganti kode akses.");
}

// Tahan tombol BOOT (GPIO0) 8 detik saat firmware jalan → reset kredensial. LED berkedip makin cepat,
// Serial Monitor menghitung mundur, layar bulat menampilkan sisa detik, UI menerima field "boot".
void pollBootButton() {
  static uint32_t pressedAt = 0, lastSec = 0;
  static bool done = false;
  static bool seenHigh = false;  // GPIO0 harus pernah HIGH dulu: jalur yang macet LOW (DTR/RTS, tombol rusak) tidak me-reset
  bool down = digitalRead(PIN_BOOT) == LOW;
  uint32_t now = millis();
  if (!seenHigh) { seenHigh = !down; if (!seenHigh) return; }
  if (!down) {
    if (pressedAt && !done && now - pressedAt > 1000) Serial.println("BOOT dilepas — reset kredensial dibatalkan");
    pressedAt = 0;
    done = false;
    bootHoldMs = 0;
    if (resetNoticeUntil && (int32_t)(resetNoticeUntil - now) > 0) digitalWrite(PIN_LED, (now / 80) % 2);
    else { resetNoticeUntil = 0; digitalWrite(PIN_LED, LOW); }
    return;
  }
  if (!pressedAt) { pressedAt = now ? now : 1; lastSec = 0; }
  if (done) { bootHoldMs = 0; digitalWrite(PIN_LED, (now / 80) % 2); return; }
  uint32_t held = now - pressedAt;
  if (held < 300) return;  // abaikan tekan sebentar / pantulan
  bootHoldMs = held;
  uint32_t period = held > BOOT_RESET_MS * 3 / 4 ? 100 : held > BOOT_RESET_MS / 2 ? 200 : 400;
  digitalWrite(PIN_LED, (held / period) % 2);
  uint32_t sec = held / 1000;
  if (sec != lastSec) {
    lastSec = sec;
    Serial.printf("BOOT ditahan %u dtk — reset kredensial dalam %u dtk (lepas = batal)\n", (unsigned)sec, (unsigned)((BOOT_RESET_MS - min(held, (uint32_t)BOOT_RESET_MS)) / 1000));
  }
  if (held >= BOOT_RESET_MS) {
    done = true;
    bootHoldMs = 0;
    factoryResetCredentials();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FILL_F, OUTPUT);
  pinMode(PIN_DUMP_F, OUTPUT);
  pinMode(PIN_FILL_R, OUTPUT);
  pinMode(PIN_DUMP_R, OUTPUT);
  pinMode(PIN_COMP, OUTPUT);
  allValvesOff();
  setValve(PIN_COMP, false);
  pinMode(PIN_ACC, INPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  Serial.printf("RZMONG Airsuspension firmware %s\n", FW_VERSION);
  loadPrefs();
  prefs.end();
  prefs.begin("rzmcal", true);
  if (prefs.isKey("cal")) prefs.getBytes("cal", cal, sizeof(cal));
  prefs.end();
  loadCreds();

  Wire.begin(21, 22);
  adsOk = ads.begin();
  if (adsOk) ads.setGain(GAIN_TWOTHIRDS);
  else { Serial.println("ADS1115 tidak ditemukan — katup & kompresor tidak dijalankan sampai sensor terbaca"); adsRetryAt = deadlineIn(ADS_RETRY_MS); }

  SPI.begin(18, -1, 23);
  displayOk = true;
  tft.begin();  // Adafruit_GC9A01A tidak punya init(w,h); layar 240x240 tetap
  tft.setRotation(0);
  tft.fillScreen(GC9A01A_BLACK);

#ifndef RZM_SIM_QEMU  // QEMU tidak meniru radio Bluetooth (env esp32dev_qemu hanya untuk uji boot)
  BLEDevice::init("RZM-AIR");
  // Keamanan BLE: bonding + MITM dengan passkey statis (PIN Bluetooth). Modul "menampilkan" PIN,
  // HP mengetik PIN itu saat pairing. Link wajib terenkripsi untuk RX/TX.
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT_MITM);
  BLEDevice::setSecurityCallbacks(new SecCb());
  BLESecurity *sec = new BLESecurity();
  sec->setStaticPIN(btPin);
  sec->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_MITM_BOND);
  sec->setCapability(ESP_IO_CAP_OUT);
  sec->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  sec->setRespEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *rx = service->createCharacteristic(RX_UUID, BLECharacteristic::PROPERTY_WRITE);
  rx->setAccessPermissions(ESP_GATT_PERM_WRITE_ENC_MITM);
  rx->setCallbacks(new RxCb());
  txChar = service->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  BLE2902 *cccd = new BLE2902();
  cccd->setAccessPermissions(ESP_GATT_PERM_READ_ENC_MITM | ESP_GATT_PERM_WRITE_ENC_MITM);
  txChar->addDescriptor(cccd);
  service->start();
  server->getAdvertising()->start();
#endif
#ifndef RZM_SIM_QEMU  // QEMU juga tidak meniru PHY WiFi
  setupWifi();
  setupRemote();
#else
  prefs.begin("rzm", false);
  Serial.println("QEMU: BLE & WiFi dilewati (tidak diemulasikan)");
#endif
  Serial.println("RZM-AIR ready");
  if (credsAreDefault())
    Serial.println("PERINGATAN: masih pakai kredensial default (kode 1234 / PIN BT 123456 / WiFi rzmong123). Ganti di UI → KEAMANAN.");
  // Watchdog loop (5 dtk): kalau loop() macet, ESP32 restart → semua relay kembali mati saat boot.
  enableLoopWDT();
}

// ACC dengan debounce: tegangan drop sesaat (starter) tidak dianggap kunci kontak mati.
void pollAcc() {
  static bool rawLast = false;
  static uint32_t changedAt = 0;
#ifndef RZM_SIM_QEMU
  bool raw = analogRead(PIN_ACC) > 2500;
#else
  bool raw = false;  // SAR ADC ESP32 tidak diemulasikan QEMU
#endif
  uint32_t now = millis();
  if (raw != rawLast) { rawLast = raw; changedAt = now; }
  if (raw == accOn || now - changedAt < ACC_DEBOUNCE_MS) return;
  accOn = raw;
  if (accOn && riseOnStart) { activePreset = 1; resumeLeveling(); }
  if (!accOn && dropOnStop) { activePreset = 0; resumeLeveling(); }
}

void loop() {
  readSensors();
  pollAcc();
  controlCompressor();
  applyAxle(axF, frontPsi, sensorOk[1], presets[activePreset].front);
  applyAxle(axR, rearPsi, sensorOk[2], presets[activePreset].rear);

  pollBootButton();
  pollBle();
#ifndef RZM_SIM_QEMU
  pollWifi();
  pollRemote();
#endif
  updateFault();
#ifdef RZM_SIM_QEMU
  static uint32_t hb = 0;
  if (millis() - hb > 2000) { hb = millis(); Serial.printf("QEMU t=%lu ads=%d tank=%.0f F=%.0f R=%.0f comp=%d fault=\"%s\"\n", (unsigned long)millis(), adsOk, tankPsi, frontPsi, rearPsi, compRunning, fault.c_str()); }
#endif
  drawDisplay();
  delay(40);
}
